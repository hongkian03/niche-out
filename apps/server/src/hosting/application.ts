import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { once } from 'node:events';
import { Server } from 'socket.io';
import { deploymentConfigSchema, checkTunnelIngress, sessionRequest, sessionResponse, socketCommands } from '@rarity/contracts';
import { OwnerAuthority } from './owner.js';
import { makeMembership } from './membership.js';

const asset = (name: string) => readFileSync(new URL('../../hosting-assets/public/' + name, import.meta.url));
// socket.io ships the browser client alongside its server distribution.
const client = readFileSync(resolve(dirname(createRequire(import.meta.url).resolve('socket.io')), '../client-dist/socket.io.js'));
const assets = new Map([
  ['/','index.html'], ['/owner','owner.html'], ['/page.js','page.js'], ['/owner.js','owner.js']
].map(([path,name]) => [path, {bytes:asset(name),type:path.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8'}]));
assets.set('/client.js',{bytes:client,type:'text/javascript; charset=utf-8'});
const playerCookie = '__Host-niche-player';
const ownerCookie = '__Host-niche-owner';
const flags = '; Path=/; Secure; HttpOnly; SameSite=Strict';
function cookie(req: IncomingMessage, name: string): string {
  return (req.headers.cookie ?? '').split(';').map(p=>p.trim()).find(p=>p.startsWith(name+'='))?.slice(name.length+1) ?? '';
}
function reply(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(value));
}
async function body(req: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[]=[];let bytes=0;
  const timer=setTimeout(()=>req.destroy(new Error('Body timeout')),10_000);
  try { for await (const chunk of req) {bytes+=chunk.length;if(bytes>limit)throw Object.assign(new Error('Too large'),{status:413});chunks.push(chunk);}return Buffer.concat(chunks); }
  finally {clearTimeout(timer);}
}
export async function createApplication(sessionId: string, healthToken: string) {
  let config: ReturnType<typeof deploymentConfigSchema.parse> | undefined;
  let closed=false;let uploading=false;
  const owners=new OwnerAuthority();
  type Actor={member:ReturnType<typeof makeMembership>;pages:number;connections:number};
  const sessions=new Map<string,Actor>();
  const transports=new Map<string,Actor>();
  const usage=new Map<string,{second:number;count:number}>();
  const within=(key:string,limit:number)=>{
    const second=Math.floor(Date.now()/1000);const previous=usage.get(key);
    const current=previous?.second===second?previous:{second,count:0};current.count++;usage.set(key,current);return current.count<=limit;
  };
  const actor=(req:IncomingMessage)=>sessions.get(cookie(req,playerCookie));
  const owner=(req:IncomingMessage)=>owners.authorized(cookie(req,ownerCookie));
  const permit=(req:IncomingMessage)=>Boolean(config && checkTunnelIngress(config,{
    peerAddress:req.socket.remoteAddress,host:req.headers.host,origin:req.headers.origin,method:req.method,
    upgrade:req.headers.upgrade?.toLowerCase()==='websocket'}));
  const server=createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
    if(!permit(req))return reply(res,403,{code:'FORBIDDEN'});
    if(!within('http',150))return reply(res,429,{code:'RATE_LIMITED'});
    try {
      if(!req.url?.startsWith('/') || req.url.startsWith('//'))return reply(res,400,{code:'INVALID_TARGET'});
      const path=new URL(req.url,config!.publicOrigin).pathname;
      if(req.method==='GET' && path==='/health')return reply(res,200,{kind:'niche-hosting-v1',sessionId,healthToken,ready:true});
      const page=assets.get(path);
      if(req.method==='GET' && page) {res.writeHead(200,{'Content-Type':page.type}).end(page.bytes);return;}
      if(req.method==='POST' && path==='/api/owner/exchange') {
        if(!within('owner-exchange',10))return reply(res,429,{code:'RATE_LIMITED'});
        const input:unknown=JSON.parse((await body(req,4096)).toString());
        if(!input || typeof input!=='object' || Object.keys(input).length!==1 || !('token'in input) || typeof input.token!=='string' || !/^[\w-]{43}$/.test(input.token))return reply(res,400,{code:'INVALID_PAYLOAD'});
        const result=owners.exchange(input.token,Boolean(actor(req)));
        if('error'in result)return reply(res,result.error==='HOST_PLAYER_CONFLICT'?409:401,{code:result.error});
        res.setHeader('Set-Cookie',ownerCookie+'='+result.credential+flags);return reply(res,200,{role:'host',sessionId});
      }
      if(req.method==='GET' && path==='/api/owner/status')return reply(res,owner(req)?200:401,owner(req)?{role:'host',sessionId}:{code:'UNAUTHORIZED'});
      if(req.method==='POST' && path==='/session') {
        if(owner(req))return reply(res,409,{code:'HOST_CANNOT_PLAY'});
        if(!within('bootstrap',12))return reply(res,429,{code:'RATE_LIMITED'});
        const input=sessionRequest.parse(JSON.parse((await body(req,4096)).toString()));
        let current=actor(req);
        if(!current) {
          if(sessions.size>=100)return reply(res,503,{code:'SESSION_CAPACITY'});
          const secret=randomBytes(32).toString('base64url');current={member:makeMembership(secret,sessionId),pages:0,connections:0};sessions.set(secret,current);
          res.setHeader('Set-Cookie',playerCookie+'='+secret+flags);
        }
        if(current.pages>=8)return reply(res,503,{code:'PAGE_CAPACITY'});
        current.pages++;return reply(res,200,sessionResponse.parse(current.member.bootstrap(input.page)));
      }
      const current=actor(req);
      // No public route exposes launcher control or owner-link minting.
      if(!['/game.resume','/player.claimControl','/upload'].includes(path))return reply(res,404,{code:'NOT_FOUND'});
      if(!current)return reply(res,401,{code:'UNAUTHORIZED'});
      if(!within(current.member.sessionToken,20))return reply(res,429,{code:'RATE_LIMITED'});
      if(req.method==='POST' && (path==='/game.resume' || path==='/player.claimControl')) {
        const kind=path.slice(1) as 'game.resume'|'player.claimControl';
        const command=socketCommands[kind].parse(JSON.parse((await body(req,4096)).toString()));
        return reply(res,200,current.member.command(command,kind));
      }
      if(req.method==='POST' && path==='/upload') {
        if(uploading)return reply(res,503,{code:'IMPORT_IN_PROGRESS'});
        uploading=true;try {const bytes=await body(req,10*1024*1024);return reply(res,200,{bytes:bytes.length,synthetic:true});}finally{uploading=false;}
      }
      reply(res,405,{code:'METHOD_NOT_ALLOWED'});
    } catch(error) {
      if(!res.destroyed && !res.headersSent)reply(res,(error as {status?:number}).status??400,{code:(error as {status?:number}).status===413?'PAYLOAD_TOO_LARGE':'INVALID_PAYLOAD'});
    }
  });
  server.requestTimeout=15_000;server.headersTimeout=10_000;
  const io=new Server(server,{serveClient:false,maxHttpBufferSize:4096,pingInterval:5000,pingTimeout:5000});
  io.engine.use((req: IncomingMessage,res: ServerResponse,next: (error?: Error) => void)=>{
    if(!permit(req))return reply(res,403,{code:'FORBIDDEN'});
    const current=actor(req);if(!current)return reply(res,401,{code:'UNAUTHORIZED'});
    if(!req.url?.startsWith('/') || req.url.startsWith('//'))return reply(res,400,{code:'INVALID_TARGET'});
    let sid:string|null;
    try {sid=new URL(req.url,config!.publicOrigin).searchParams.get('sid');}catch{return reply(res,400,{code:'INVALID_TARGET'});}
    if(sid && transports.get(sid)!==current)return reply(res,403,{code:'FORBIDDEN'});
    if(!sid && (io.engine.clientsCount>=128 || current.connections>=8))return reply(res,503,{code:'CONNECTION_CAPACITY'});
    if(!within('transport',300))return reply(res,429,{code:'RATE_LIMITED'});next();
  });
  io.engine.on('connection',transport=>{const current=actor(transport.request)!;current.connections++;transports.set(transport.id,current);transport.once('close',()=>{current.connections--;transports.delete(transport.id);});});
  io.on('connection',socket=>{socket.on('probe',(ack:unknown)=>{
    if(typeof ack!=='function')return;const current=actor(socket.request);
    ack(current && within(current.member.sessionToken,20)?{ok:true}:{ok:false,code:'RATE_LIMITED'});
  });});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const port=(server.address() as {port:number}).port;
  return {
    port,
    configureOrigin(origin:string) {
      if(closed)throw new Error('Application is closed.');
      if(config && config.publicOrigin!==origin)throw new Error('A changed public origin requires a fresh application session.');
      config=deploymentConfigSchema.parse({mode:'tunnel',purpose:'event',provider:'cloudflare',tunnelKind:'quick',publicOrigin:origin,listen:{host:'127.0.0.1',port},upstreamHost:'public'});
    },
    mintOwnerLink() {if(!config || closed)throw new Error('Application is not configured.');return config.publicOrigin+'/owner#'+owners.mint();},
    hasDisposableState() {return sessions.size>0;},
    async close() {if(closed)return;closed=true;owners.clear();io.disconnectSockets(true);await io.close();server.closeAllConnections();sessions.clear();transports.clear();usage.clear();}
  };
}
