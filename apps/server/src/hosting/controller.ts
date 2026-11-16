import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import QRCode from 'qrcode';
export interface ManagedHosting {
  snapshot(): { status: string; sessionId: string | null; publicOrigin?: string | null; reason?: unknown };
  start(): Promise<void>; stop(): Promise<void>;
  readonly application: { mintOwnerLink(): string; hasDisposableState(): boolean } | undefined | null;
}
const secret = () => randomBytes(32).toString('base64url');
const matches = (a: unknown, b: string) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const cookieName = 'niche_local_control';
const assetRoot = new URL('../../hosting-assets/local/', import.meta.url);
function reply(res: ServerResponse, status: number, value: unknown) { res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(value)); }
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []; let size = 0; const timer = setTimeout(() => req.destroy(), 5000);
  try { for await (const chunk of req) { size += chunk.length; if (size > 4096) throw new Error('BODY_LIMIT'); chunks.push(chunk); }
    const value = JSON.parse(Buffer.concat(chunks).toString());
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_BODY'); return value;
  } finally { clearTimeout(timer); }
}
/** Separate loopback control surface. Never pass this listener to the connector. */
export async function createController(manager: ManagedHosting, options: { port?: number; now?: () => number; onQuit?: () => Promise<void> } = {}) {
  const now = options.now ?? Date.now, credential = secret();
  let bootstrap: { value: string; expires: number } | undefined, origin = '', closed = false, quitting = false;
  let bucketSecond = 0, bucketCount = 0;
  const html = await readFile(new URL('index.html', assetRoot)), script = await readFile(new URL('dashboard.js', assetRoot)), css = await readFile(new URL('style.css', assetRoot));
  function authorized(req: IncomingMessage) {
    const cookie = (req.headers.cookie ?? '').split(';').map(x => x.trim()).find(x => x.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
    return matches(cookie, credential);
  }
  function state() {
    const current = manager.snapshot();
    return { state: current.status, sessionId: current.sessionId, publicOrigin: current.status === 'ready' ? current.publicOrigin : null,
      hasDisposableState: manager.application?.hasDisposableState() ?? false,
      error: typeof current.reason === 'string' && /^[a-z-]{1,64}$/.test(current.reason) ? current.reason : current.status === 'failed' ? 'HOSTING_UNAVAILABLE' : null };
  }
  const server = createServer((req, res) => { void handle(req, res).catch(() => { if (!res.headersSent) reply(res, 500, { code: 'CONTROL_UNAVAILABLE' }); else res.end(); }); });
  async function handle(req: IncomingMessage, res: ServerResponse) {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const sameOrigin = req.headers.origin === origin;
    if (req.socket.remoteAddress !== '127.0.0.1' || req.headers.host !== new URL(origin).host || (req.headers.origin !== undefined && !sameOrigin) || (!['GET', 'HEAD'].includes(req.method ?? '') && !sameOrigin)) return reply(res, 403, { code: 'FORBIDDEN' });
    const second = Math.floor(now() / 1000); if (second !== bucketSecond) { bucketSecond = second; bucketCount = 0; }
    if (++bucketCount > 100) return reply(res, 429, { code: 'RATE_LIMITED' });
    let path: string; try { path = new URL(req.url ?? '/', origin).pathname; } catch { return reply(res, 400, { code: 'INVALID_URL' }); }
    if (req.method === 'GET' && ['/', '/dashboard.js', '/style.css'].includes(path)) {
      res.writeHead(200, { 'Content-Type': path === '/' ? 'text/html; charset=utf-8' : path.endsWith('.js') ? 'text/javascript' : 'text/css' }).end(path === '/' ? html : path.endsWith('.js') ? script : css); return;
    }
    if (req.method === 'POST' && path === '/control/exchange') {
      try { const input = await body(req);
        if (!bootstrap || now() >= bootstrap.expires || !matches(input.token, bootstrap.value)) return reply(res, 401, { code: 'INVALID_LOCAL_ACCESS' });
        bootstrap = undefined;
        // HTTP literal-loopback controller cookie is separate from Secure public cookies.
        res.setHeader('Set-Cookie', `${cookieName}=${credential}; HttpOnly; SameSite=Strict; Path=/`); return reply(res, 200, { ok: true });
      } catch { return reply(res, 400, { code: 'INVALID_BODY' }); }
    }
    if (!authorized(req)) return reply(res, 401, { code: 'LOCAL_ACCESS_REQUIRED' });
    if (quitting && req.method === 'POST') return reply(res, 409, { code: 'LAUNCHER_QUITTING' });
    if (req.method === 'GET' && path === '/control/state') return reply(res, 200, state());
    if (req.method === 'GET' && path === '/control/qr') {
      const current = state(); if (current.state !== 'ready' || !current.publicOrigin) return reply(res, 409, { code: 'NOT_READY' });
      const requestedSession = new URL(req.url ?? '/', origin).searchParams.get('v');
      if (requestedSession !== null && requestedSession !== current.sessionId) return reply(res, 409, { code: 'SESSION_CHANGED' });
      const svg = await QRCode.toString(String(current.publicOrigin), { type: 'svg', margin: 2, errorCorrectionLevel: 'M' });
      const latest = state();
      if (latest.state !== 'ready' || latest.sessionId !== current.sessionId || latest.publicOrigin !== current.publicOrigin) return reply(res, 409, { code: 'SESSION_CHANGED' });
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' }).end(svg); return;
    }
    if (req.method !== 'POST') return reply(res, 404, { code: 'NOT_FOUND' });
    let input: Record<string, unknown>; try { input = await body(req); } catch { return reply(res, 400, { code: 'INVALID_BODY' }); }
    const current = state();
    if (path === '/control/start') {
      if (!['idle', 'starting', 'connecting', 'ready'].includes(current.state)) return reply(res, 409, { code: 'FINISH_SESSION_FIRST' });
      void manager.start().catch(() => {}); return reply(res, 202, { ok: true });
    }
    if (['/control/finish', '/control/quit'].includes(path)) {
      if (input.sessionId !== current.sessionId) return reply(res, 409, { code: 'SESSION_CHANGED' });
      if (current.hasDisposableState && input.confirm !== true) return reply(res, 409, { code: 'CONFIRM_STATE_LOSS' });
      if (path === '/control/quit') quitting = true;
      await manager.stop(); reply(res, 200, { ok: true });
      if (path === '/control/quit') setTimeout(() => { void close().then(() => options.onQuit?.()); }, 30); return;
    }
    if (path === '/control/owner-link') {
      if (input.sessionId !== current.sessionId || current.state !== 'ready' || !manager.application) return reply(res, 409, { code: 'NOT_READY' });
      return reply(res, 200, { url: manager.application.mintOwnerLink() });
    }
    reply(res, 404, { code: 'NOT_FOUND' });
  }
  server.listen(options.port ?? 0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('CONTROL_BIND_FAILED'); origin = `http://127.0.0.1:${address.port}`;
  async function close() { if (closed) return; closed = true; bootstrap = undefined; server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  return { origin, server, state, close, accessUrl() { bootstrap = { value: secret(), expires: now() + 60_000 }; return origin + '/#access=' + bootstrap.value; } };
}
