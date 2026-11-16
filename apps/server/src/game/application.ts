import Fastify, { type FastifyRequest } from 'fastify';
import { randomBytes, randomInt } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { Server, type Socket } from 'socket.io';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Socket as NetSocket } from 'node:net';
import {
  checkTunnelIngress, deploymentConfigSchema, invitationForOrigin, httpRoutes, httpStatusForError, hostingStatusSchema,
  sessionRequest, socketCommands, socketAcknowledgements, mutationFingerprint, commitRequest, resolveRequest,
  type HostingStatus, type CommandName, type MutationName,
} from '@rarity/contracts';
import { GameEngine, projectHost, projectPlayer } from '@rarity/game-core';
import { OwnerAuthority } from '../hosting/owner.js';
import { SessionService, type Session } from './sessions.js';
import { RequestLedger } from './ledger.js';
import { ImportService, type ImportTicket } from './imports.js';

const cookieFlags = '; Path=/; Secure; HttpOnly; SameSite=Strict';
const browserCookie = '__Host-niche-player';
const ownerCookie = '__Host-niche-owner';
const secret = () => randomBytes(32).toString('base64url');
function cookie(req: IncomingMessage, name: string) {
  return (req.headers.cookie ?? '').split(';').map(part => part.trim()).find(part => part.startsWith(name + '='))?.slice(name.length + 1) ?? '';
}
function fault(code: string, requestId?: string, extra?: object) {
  const validId = requestId && /^[A-Za-z0-9_-]+\.[1-9][0-9]*$/.test(requestId) && Number.isSafeInteger(Number(requestId.slice(requestId.lastIndexOf('.') + 1)));
  return { code, message: code.toLowerCase().replaceAll('_', ' '), ...(validId ? { requestId } : {}), ...extra };
}
function caught(error: unknown, requestId?: string) {
  const code = (error as { code?: string })?.code;
  return fault(code && code in httpStatusForError ? code : 'INVALID_PAYLOAD', requestId,
    (error as { fieldErrors?: unknown })?.fieldErrors ? { fieldErrors: (error as { fieldErrors: unknown }).fieldErrors } : undefined);
}
function fail(code: string): never { throw Object.assign(new Error(code), { code }); }
function core<T extends { ok: boolean; code?: string }>(result: T): T {
  if (!result.ok) {
    const mapping: Record<string, string> = { INVALID_PHASE: 'WRONG_PHASE', STALE_GENERATION: 'CANDIDATE_STALE', UNKNOWN_PLAYER: 'UNAUTHORIZED', INVALID_RECEIPT: 'EXPIRED' };
    fail(mapping[result.code!] ?? (result.code! in httpStatusForError ? result.code! : 'INVALID_PAYLOAD'));
  }
  return result;
}
export interface GameApplicationOptions {
  port?: number; now?: () => number;
  /** Private launcher notification; never exposed in public protocol state. */
  onActiveChange?: (active: boolean) => void;
  importsOptions?: ConstructorParameters<typeof ImportService>[1];
  diagnosticAssets?: Map<string, { bytes: Buffer; type: string }>;
  /** Optional private measurement sink. No payloads, identities or secrets are supplied. */
  onDiagnostic?: (sample: { kind: 'command' | 'egress' | 'transport'; name: string; durationMs?: number; outcome?: string; bytes?: number }) => void;
}
/** Production application behind one verified public origin. Local launcher routes are never mounted here. */
export async function createGameApplication(sessionId: string, healthToken: string, options: GameApplicationOptions = {}) {
  const now = options.now ?? (() => performance.now());
  const diagnostic = (sample: Parameters<NonNullable<GameApplicationOptions['onDiagnostic']>>[0]) => {
    try { options.onDiagnostic?.(sample); } catch { /* Measurement cannot change gameplay. */ }
  };
  let closed = false;
  let reportedActive = false;
  function reportActive(active: boolean) {
    if (reportedActive === active) return;
    reportedActive = active;
    try { options.onActiveChange?.(active); } catch { /* OS power availability must not change game rules. */ }
  }
  let config: ReturnType<typeof deploymentConfigSchema.parse> | undefined;
  let hosting: HostingStatus = { status: 'connecting' };
  let previousCode = '';
  const engine = new GameEngine({ now, serverInstanceId: sessionId, newId: kind => kind + '-' + secret(), newGameCode() {
    let next: string; do { next = String(randomInt(1_000_000)).padStart(6, '0'); } while (next === previousCode);
    return previousCode = next;
  } });
  const owners = new OwnerAuthority(now);
  const ledger = new RequestLedger({ now });
  const sessions = new SessionService({ serverInstanceId: sessionId, now, onRetirePage(session, tabId) { ledger.retirePage(session.kind === 'host' ? 'owner' : session.id, tabId); }, membership(identityId: string) {
    const state = engine.state(), player = state.players.find(candidate => candidate.identityId === identityId);
    return player && state.gameId ? { gameId: state.gameId, playerId: player.playerId, nickname: player.nickname, status: player.removed ? 'removed' as const : 'admitted' as const } : null;
  } });
  const imports = new ImportService(engine, { now, ...options.importsOptions });
  let lastGameCommit: { requestId: string; candidateId: string; gameId: string; setupGeneration: number; revision: number } | null = null;
  const member = (actor: Session) => engine.state().players.find(player => player.identityId === actor.id);
  const actorFor = (req: IncomingMessage): Session | null => owners.authorized(cookie(req, ownerCookie)) ? sessions.host() : sessions.resolve(cookie(req, browserCookie));
  const actorRates = new WeakMap<Session, Map<string, { tokens: number; at: number }>>();
  const actorRate = (actor: Session, key: string, refill: number, burst: number) => {
    const time = now(), buckets = actorRates.get(actor) ?? new Map(); actorRates.set(actor, buckets);
    const bucket = buckets.get(key) ?? { tokens: burst, at: time };
    bucket.tokens = Math.min(burst, bucket.tokens + (time - bucket.at) * refill / 1000); bucket.at = time; buckets.set(key, bucket);
    if (bucket.tokens < 1) fail('RATE_LIMITED'); bucket.tokens--;
  };
  const requireActor = (req: IncomingMessage): Session => actorFor(req) ?? fail('UNAUTHORIZED');
  const requireOwner = (req: IncomingMessage): Session => { const actor = requireActor(req); if (actor.kind !== 'host') fail('FORBIDDEN'); return actor; };
  const scope = (actor: Session) => actor.kind === 'host' ? 'owner' : actor.id;
  const permit = (req: IncomingMessage) => Boolean(config && checkTunnelIngress(config, { peerAddress: req.socket.remoteAddress,
    host: req.headers.host, origin: req.headers.origin, method: req.method, upgrade: req.headers.upgrade?.toLowerCase() === 'websocket' }));
  const guardContext = (actor: Session, input: any) => {
    if (input.serverInstanceId !== sessionId) fail('WRONG_INSTANCE'); return sessions.page(actor, input.tabId, input.requestId);
  };
  const currentMember = (actor: Session, gameId: string | null) => {
    if (gameId !== engine.state().gameId) fail('WRONG_GAME');
    const player = member(actor); if (!player) fail('UNAUTHORIZED'); if (player.removed) fail('REMOVED'); return player;
  };
  const context = (actor: Session, kind: MutationName, input: any, pinKey?: string) => {
    const page = guardContext(actor, input);
    return { scope: scope(actor), pageId: input.tabId, requestPrefix: page.requestPrefix, requestId: input.requestId,
      fingerprint: mutationFingerprint(kind, input), gameId: kind === 'game.commit' ? input.expectedGameId : input.gameId,
      ...(pinKey ? { pinKey } : {}), ...(actor.kind !== 'host' && !member(actor) ? { rejectedLimit: 1 } : {}) };
  };
  const hostView = (requestedRoundId?: string) => {
    const state = engine.state();
    return projectHost(state, { hosting, serverNowMs: now(), importInProgress: imports.busy,
      ...(config && state.gameCode ? { invitation: invitationForOrigin(config.publicOrigin, state.gameCode) } : {}), requestedRoundId });
  };
  const viewFor = (actor: Session, tabId: string, requestedRoundId?: string) => {
    if (actor.kind === 'host') return hostView(requestedRoundId);
    const player = currentMember(actor, engine.state().gameId); sessions.assertController(actor, tabId, engine.state().gameId!);
    return projectPlayer(engine.state(), { playerId: player.playerId, controlGeneration: sessions.currentControl(actor)!.generation, serverNowMs: now(), requestedRoundId });
  };
  const app = Fastify({ logger: false, trustProxy: false, bodyLimit: 4096, requestTimeout: 10000, connectionTimeout: 15000 });
  const measuredTransports = new Set<NetSocket>();
  let closedReadBytes = 0, closedWrittenBytes = 0, transportRequests = 0, transportConnections = 0, maxOpenTransports = 0, openHttpRequests = 0, maxOpenHttpRequests = 0, upgrades = 0;
  const observeHttp = (request: IncomingMessage, response: ServerResponse) => {
    if (!options.onDiagnostic || request.headers.upgrade?.toLowerCase() === 'websocket') return;
    transportRequests++; openHttpRequests++; maxOpenHttpRequests = Math.max(maxOpenHttpRequests, openHttpRequests);
    let complete = false; const done = () => { if (!complete) { complete = true; openHttpRequests--; } };
    response.once('finish', done); response.once('close', done);
  };
  if (options.onDiagnostic) {
    app.server.on('connection', socket => {
      measuredTransports.add(socket); transportConnections++; maxOpenTransports = Math.max(maxOpenTransports, measuredTransports.size);
      socket.once('close', () => { closedReadBytes += socket.bytesRead; closedWrittenBytes += socket.bytesWritten; measuredTransports.delete(socket); });
    });
    app.server.on('request', observeHttp);
    app.server.on('upgrade', () => { upgrades++; });
  }
  app.removeAllContentTypeParsers(); app.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));
  const importTickets = new WeakMap<FastifyRequest, ImportTicket>();
  const limits = new Map<string, { at: number; count: number }>();
  const rate = (key: string, maximum: number) => {
    const second = Math.floor(now() / 1000), old = limits.get(key), entry = old?.at === second ? old : { at: second, count: 0 };
    limits.set(key, entry); if (++entry.count > maximum) fail('RATE_LIMITED');
  };
  app.addHook('onRequest', async (request, reply) => {
    reply.headers({ 'Cache-Control': 'no-store, private', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' });
    if (!request.raw.url?.startsWith('/') || request.raw.url.startsWith('//')) fail('INVALID_PAYLOAD');
    if (!permit(request.raw)) fail('FORBIDDEN'); rate('http', 1000);
    if (request.method === 'POST' && request.url.split('?')[0] === '/api/host/import') {
      requireOwner(request.raw); const ticket = imports.begin(); importTickets.set(request, ticket); publish();
      request.raw.once('aborted', () => { const wasBusy = imports.busy; imports.abort(ticket); if (wasBusy && !imports.busy) engine.touchRevision(); publish(); });
    }
  });
  app.setErrorHandler((error, request, reply) => {
    const ticket = importTickets.get(request); if (ticket) { const wasBusy = imports.busy; imports.abort(ticket); if (wasBusy && !imports.busy) engine.touchRevision(); publish(); }
    const value = (error as { code?: string }).code === 'FST_ERR_CTP_BODY_TOO_LARGE' ? fault(request.url.startsWith('/api/host/import') ? 'UPLOAD_TOO_LARGE' : 'INVALID_PAYLOAD') : caught(error);
    reply.code(httpStatusForError[value.code as keyof typeof httpStatusForError] ?? 400).send(value);
  });
  const json = (request: FastifyRequest) => { const value = JSON.parse((request.body as Buffer).toString('utf8')); if (value?.protocolVersion !== 1) fail('UNSUPPORTED_VERSION'); return value; };
  const assets = new Map<string, { bytes: Buffer; type: string }>();
  const dist = new URL('../../../web/dist/', import.meta.url), shell = readFileSync(new URL('index.html', dist));
  for (const path of ['/', '/host', '/join']) assets.set(path, { bytes: shell, type: 'text/html; charset=utf-8' });
  const assetTypes: Record<string, string> = { js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', ttf: 'font/ttf', woff2: 'font/woff2', svg: 'image/svg+xml' };
  for (const file of readdirSync(new URL('assets/', dist))) if (/^[\w.-]+\.(js|css|ttf|woff2|svg)$/.test(file)) assets.set('/assets/' + file, {
    bytes: readFileSync(new URL('assets/' + file, dist)), type: assetTypes[file.slice(file.lastIndexOf('.') + 1)]!,
  });
  // Deliberately named authoring examples and license notices; never serve an arbitrary directory or uploaded pack.
  for (const file of ['game.example.json', 'game-format.txt', 'asset-notices.txt', 'VT323-OFL.txt']) assets.set('/' + file, {
    bytes: readFileSync(new URL(file, dist)), type: file.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
  });
  for (const [path, asset] of options.diagnosticAssets ?? []) assets.set(path, asset);
  for (const [path, asset] of assets) app.get(path, async (_request, reply) => reply.type(asset.type).send(asset.bytes));
  app.get('/health', async () => ({ protocolVersion: 1, appVersion: '0.1.0', live: true }));
  app.get('/hosting-health', async () => ({ kind: 'niche-hosting-v1', sessionId, healthToken, ready: true }));
  app.post('/api/session', async (request, reply) => {
    const input = sessionRequest.parse(json(request)); let actor = actorFor(request.raw);
    if (!actor) { rate('guest-create', 256); const created = sessions.createGuest(); actor = created.session;
      reply.header('Set-Cookie', browserCookie + '=' + created.credential + cookieFlags); }
    return sessions.bootstrap(actor, input.page, { gameId: engine.state().gameId, lastGameCommit });
  });
  app.post('/api/owner/exchange', async (request, reply) => {
    rate('owner-exchange', 10); const input = httpRoutes['POST /api/owner/exchange'].request.parse(json(request));
    const browser = sessions.resolve(cookie(request.raw, browserCookie)), player = browser && member(browser);
    const result = owners.exchange(input.token, Boolean(player && !player.removed));
    if ('error' in result) fail(result.error === 'HOST_PLAYER_CONFLICT' ? result.error : 'UNAUTHORIZED');
    for (const socket of io.sockets.sockets.values()) if (socket.data.actor?.kind === 'host') socket.disconnect(true);
    reply.header('Set-Cookie', ownerCookie + '=' + result.credential + cookieFlags);
    return sessions.bootstrap(sessions.host(), { kind: 'fresh' }, { gameId: engine.state().gameId, lastGameCommit });
  });
  app.post('/api/host/import', { bodyLimit: 10 * 1024 * 1024 }, async request => {
    try { requireOwner(request.raw); return await imports.complete(importTickets.get(request)!, request.body as Buffer); }
    finally { const ticket = importTickets.get(request); if (ticket) { imports.abort(ticket); engine.touchRevision(); } importTickets.delete(request); publish(); }
  });
  app.post('/api/host/games', async (request, reply) => {
    const actor = requireOwner(request.raw), input = commitRequest.parse(json(request));
    const output = ledger.run(context(actor, 'game.commit', input, 'commit'), () => {
      try {
        if (input.expectedGameId !== engine.state().gameId) fail('WRONG_GAME');
        const definition = imports.candidateForCommit(input.candidateId, input.expectedGameId, input.expectedSetupGeneration), oldGameId = engine.state().gameId;
        const result = core(engine.commit(definition, input.expectedSetupGeneration)); if (!result.ok) throw new Error('Unexpected core rejection');
        imports.consume(input.candidateId);
        if (oldGameId) { io.emit('game.closed', { protocolVersion: 1, serverInstanceId: sessionId, gameId: oldGameId, revision: engine.state().revision, reason: 'replaced' }); sessions.invalidateGame(oldGameId); }
        ledger.replaceGame(); lastGameCommit = { requestId: input.requestId, candidateId: input.candidateId, gameId: result.gameId, setupGeneration: engine.state().setupGeneration, revision: engine.state().revision };
        publish(); return { outcome: 'COMMITTED', ...lastGameCommit };
      } catch (error) { return caught(error, input.requestId); }
    });
    if ('code' in output) reply.code(httpStatusForError[output.code as keyof typeof httpStatusForError] ?? 400);
    return output;
  });
  app.get('/api/snapshot', async request => {
    const actor = requireActor(request.raw), input = httpRoutes['GET /api/snapshot'].request.parse(request.query);
    if (input.serverInstanceId !== sessionId) fail('WRONG_INSTANCE');
    if ((input.gameId ?? null) !== engine.state().gameId) fail('WRONG_GAME');
    // Removal retires every page but retains this credential's membership
    // tombstone. Report that authenticated reason before a missing-page error.
    if (actor.kind !== 'host' && member(actor)?.removed) fail('REMOVED');
    sessions.page(actor, input.tabId); actorRate(actor, 'read', 20, 40); return viewFor(actor, input.tabId);
  });
  app.post('/api/host/operations/resolve', async request => {
    const actor = requireOwner(request.raw), input = resolveRequest.parse(json(request)), operation = input.operation, original = operation.original;
    let retired = false;
    try { guardContext(actor, original); } catch { retired = true; }
    const ctx = { scope: 'owner', pageId: original.tabId, requestId: original.requestId,
      requestPrefix: original.requestId.slice(0, original.requestId.lastIndexOf('.')), fingerprint: mutationFingerprint(operation.kind, original) };
    if (original.serverInstanceId !== sessionId) return { outcome: 'SUPERSEDED', view: hostView() };
    const cached: any = ledger.inspect(ctx);
    if (cached && !cached.code && cached.gameId === engine.state().gameId) return { outcome: 'APPLIED', result: cached, view: hostView() };
    const expectedGame = operation.kind === 'game.commit' ? operation.original.expectedGameId : operation.original.gameId;
    if (expectedGame !== engine.state().gameId) return { outcome: 'SUPERSEDED', view: hostView() };
    if (ledger.isFenced(ctx)) return { outcome: 'NOT_APPLIED', view: hostView() };
    if (retired || (operation.kind === 'game.commit' && operation.original.expectedSetupGeneration !== engine.state().setupGeneration)) return { outcome: 'SUPERSEDED', view: hostView() };
    ledger.fence(ctx); if (operation.kind === 'game.commit') imports.invalidate();
    publish(); return { outcome: 'NOT_APPLIED', view: hostView() };
  });
  const io = new Server(app.server, { serveClient: false, maxHttpBufferSize: 4096, connectTimeout: 10000, pingInterval: 5000, pingTimeout: 5000 });
  const pending = new Set<string>(), transports = new Map<string, string>();
  io.engine.use((req: IncomingMessage, res: ServerResponse, next: (error?: Error) => void) => {
    observeHttp(req, res);
    const deny = (code: string) => { res.writeHead(httpStatusForError[code as keyof typeof httpStatusForError] ?? 403, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(fault(code))); };
    if (!permit(req)) return deny('FORBIDDEN');
    const actor = actorFor(req); if (!actor) return deny('UNAUTHORIZED');
    let sid: string | null; try { sid = new URL(req.url!, config!.publicOrigin).searchParams.get('sid'); } catch { return deny('INVALID_PAYLOAD'); }
    if (sid && transports.get(sid) !== actor.id) return deny('FORBIDDEN');
    if (!sid && pending.size >= 128) return deny('HANDSHAKE_CAPACITY');
    res.setHeader('Cache-Control', 'no-store, private'); next();
  });
  io.engine.on('connection', transport => {
    if (options.onDiagnostic) {
      diagnostic({ kind: 'transport', name: 'open', outcome: transport.transport.name });
      transport.once('close', (reason: unknown) => diagnostic({ kind: 'transport', name: 'close', outcome: typeof reason === 'string' ? reason : 'UNKNOWN' }));
    }
    const actor = actorFor(transport.request); if (!actor) return transport.close();
    const transportId = (transport as unknown as { id: string }).id;
    pending.add(transportId); transports.set(transportId, actor.id);
    transport.once('close', () => { pending.delete(transportId); transports.delete(transportId); });
  });
  io.use((socket, next) => {
    try {
      const actor = requireActor(socket.request), auth = socket.handshake.auth;
      if (auth.protocolVersion !== 1) fail('UNSUPPORTED_VERSION'); if (auth.serverInstanceId !== sessionId) fail('WRONG_INSTANCE');
      if (typeof auth.tabId !== 'string' || Object.keys(auth).some(key => !['protocolVersion', 'serverInstanceId', 'tabId'].includes(key))) fail('INVALID_PAYLOAD');
      const player = member(actor); if (player?.removed) fail('REMOVED'); sessions.page(actor, auth.tabId);
      socket.data.actor = actor; socket.data.tabId = auth.tabId;
      const old = sessions.attachTransport(actor, auth.tabId, socket.id); if (old) io.sockets.sockets.get(old)?.disconnect(true);
      pending.delete((socket.conn as unknown as { id: string }).id); next();
    } catch (error) { next(Object.assign(new Error(caught(error).code), { data: caught(error) })); }
  });
  let timer: ReturnType<typeof setTimeout> | undefined, readinessTimer: ReturnType<typeof setTimeout> | undefined;
  const sendView = (socket: Socket, event = 'state.changed', requestedRoundId?: string) => {
    try { const actor = requireActor(socket.request); if (actor.id !== socket.data.actor.id) return; const view = viewFor(actor, socket.data.tabId, requestedRoundId); socket.emit(event, view); if (options.onDiagnostic) diagnostic({ kind: 'egress', name: event, bytes: Buffer.byteLength(JSON.stringify(view)) }); } catch { /* Never emit a private view to an unauthorized recipient. */ }
  };
  function publish(readinessOnly = false) {
    if (closed) return;
    if (readinessOnly) { if (!readinessTimer) readinessTimer = setTimeout(() => { readinessTimer = undefined; publish(); }, 50); return; }
    if (readinessTimer) { clearTimeout(readinessTimer); readinessTimer = undefined; }
    reportActive(['Reading', 'Answering', 'Results'].includes(engine.state().phase));
    for (const socket of io.sockets.sockets.values()) sendView(socket);
    if (timer) clearTimeout(timer); const token = engine.timerToken();
    if (token) timer = setTimeout(() => { timer = undefined; engine.wake(token); publish(); }, Math.max(1, token.deadlineMs - now()));
  }
  const answerRates = new WeakMap<Session, { tokens: number; at: number }>();
  const answerRate = (actor: Session) => { const time = now(), bucket = answerRates.get(actor) ?? { tokens: 8, at: time };
    bucket.tokens = Math.min(8, bucket.tokens + (time - bucket.at) * 4 / 1000); bucket.at = time; answerRates.set(actor, bucket);
    if (bucket.tokens < 1) fail('RATE_LIMITED'); bucket.tokens--; };
  function command(socket: Socket, name: CommandName, raw: unknown, receivedAtMs: number) {
    const actor = requireActor(socket.request); if (actor.id !== socket.data.actor.id) fail('UNAUTHORIZED');
    if ((raw as any)?.protocolVersion !== 1) fail('UNSUPPORTED_VERSION');
    const input: any = socketCommands[name].parse(raw);
    if (input.tabId !== socket.data.tabId) fail('FORBIDDEN'); guardContext(actor, input);
    if (name === 'game.start' || name === 'player.remove') { if (actor.kind !== 'host') fail('FORBIDDEN'); }
    else if (['game.join', 'player.claimControl', 'answer.submit'].includes(name) && actor.kind === 'host') fail('FORBIDDEN');
    if (actor.kind !== 'host' && name !== 'game.join') currentMember(actor, input.gameId);
    if (name === 'game.join' && member(actor)?.removed) fail('REMOVED');
    if (name === 'answer.submit' || (actor.kind !== 'host' && (name === 'state.get' || name === 'clock.sample'))) sessions.assertController(actor, input.tabId, input.gameId, input.controlGeneration);
    if (name === 'state.get' || name === 'clock.sample') {
      if (input.gameId !== engine.state().gameId) fail('WRONG_GAME'); actorRate(actor, 'read', 20, 40);
      const base = { requestId: input.requestId, gameId: engine.state().gameId, revision: engine.state().revision };
      return name === 'clock.sample' ? { ...base, outcome: 'CLOCK', sampleId: input.payload.sampleId, serverNowMs: now() } : { ...base, outcome: 'STATE', view: viewFor(actor, input.tabId, input.payload.recapRoundId) };
    }
    // A cached grant belongs to its exact control generation, even if that page later regains control.
    if (['game.resume', 'game.join', 'player.claimControl'].includes(name)) {
      const control = sessions.currentControl(actor);
      const cached = ledger.inspect<{ control?: { controlGeneration: number } | null }>(context(actor, name, input));
      if (cached && ((control && control.tabId !== input.tabId) ||
        (cached.control && cached.control.controlGeneration !== control?.generation))) fail('TAB_SUPERSEDED');
    }
    const pinKey = name === 'answer.submit' ? 'answer:' + input.roundId : name === 'player.remove' ? 'remove:' + input.payload.targetPlayerId : name === 'game.join' ? 'join' : name === 'game.start' ? 'start' : undefined;
    return ledger.run(context(actor, name, input, pinKey), () => {
      const before = engine.state();
      try {
        let response: any;
        if (name === 'game.join') {
          actorRate(actor, 'join', 4, 8);
          if (!before.gameId || input.payload.code !== before.gameCode) fail('GAME_NOT_FOUND');
          if (input.gameId !== null && input.gameId !== before.gameId) fail('WRONG_GAME');
          const existing = member(actor);
          const priorGrant = existing ? grantControl(actor, input.tabId, before.gameId, 'join') : undefined;
          const result = core(engine.admit({ gameId: before.gameId, identityId: actor.id, nickname: input.payload.nickname })); if (!result.ok) throw new Error('Unexpected core failure');
          const grant = priorGrant ?? grantControl(actor, input.tabId, before.gameId, 'join'); supersede(grant, actor, before.gameId);
          response = { outcome: 'JOINED', control: grant.control };
        } else if (name === 'game.resume' || name === 'player.claimControl') {
          actorRate(actor, 'control', 4, 8);
          if (input.gameId !== before.gameId) fail('WRONG_GAME');
          if (actor.kind === 'host') response = { outcome: 'RESUMED', control: null };
          else { const player = currentMember(actor, input.gameId);
            const grant = grantControl(actor, input.tabId, input.gameId, name === 'player.claimControl' ? 'claim' : input.payload.mode);
            supersede(grant, actor, input.gameId); core(engine.resumePlayer(input.gameId, player.playerId));
            response = { outcome: name === 'game.resume' ? 'RESUMED' : 'CONTROL_GRANTED', control: grant.control }; }
        } else if (name === 'game.start') {
          core(engine.start(input.gameId, { hostingReady: hosting.status === 'ready', importInProgress: imports.busy })); imports.clearCandidate(); response = { outcome: 'STARTED' };
        } else if (name === 'player.remove') {
          const target = before.players.find(player => player.playerId === input.payload.targetPlayerId);
          core(engine.remove(input.gameId, input.payload.targetPlayerId)); if (target) sessions.removeMembership(target.identityId);
          response = { outcome: 'REMOVED', targetPlayerId: input.payload.targetPlayerId };
          for (const other of io.sockets.sockets.values()) if (other.data.actor.id === target?.identityId) other.disconnect(true);
        } else {
          answerRate(actor); const player = currentMember(actor, input.gameId);
          const result = core(engine.submit({ gameId: input.gameId, roundId: input.roundId, playerId: player.playerId, text: input.payload.text, receivedAtMs })); if (!result.ok) throw new Error('Unexpected core failure');
          response = { outcome: result.outcome, roundId: input.roundId, locked: result.locked, ...(result.locked ? { submittedText: result.submittedText } : {}) };
        }
        const after = engine.state(); response = { requestId: input.requestId, gameId: after.gameId, revision: after.revision, ...response };
        if (before.revision !== after.revision || ['game.join', 'game.resume', 'player.claimControl'].includes(name)) publish(name === 'answer.submit' && before.phaseId === after.phaseId && before.revision !== after.revision); return response;
      } catch (error) { if (engine.state().revision !== before.revision) publish(); return caught(error, input.requestId); }
    });
  }
  function grantControl(actor: Session, tabId: string, gameId: string, mode: 'join' | 'bootstrap' | 'loaded' | 'claim') {
    const previous = sessions.currentControl(actor), grant = sessions.control(actor, tabId, gameId, mode);
    if (previous?.tabId !== tabId || previous.generation !== grant.control.controlGeneration) engine.touchRevision();
    return grant;
  }
  function supersede(grant: { supersededTabId?: string; control: any }, actor: Session, gameId: string) {
    if (!grant.supersededTabId) return;
    for (const other of io.sockets.sockets.values()) if (other.data.actor.id === actor.id && other.data.tabId === grant.supersededTabId) {
      other.emit('player.superseded', { protocolVersion: 1, serverInstanceId: sessionId, gameId, tabId: grant.supersededTabId,
        controlGeneration: grant.control.controlGeneration, revision: engine.state().revision }); other.disconnect(true);
    }
  }
  io.on('connection', socket => {
    for (const name of Object.keys(socketCommands) as CommandName[]) socket.on(name, (raw: unknown, ack: unknown) => {
      const receivedAtMs = now(); if (typeof ack !== 'function') return;
      const started = performance.now();
      const measuredAck = (value: any) => {
        const durationMs = performance.now() - started; ack(value);
        if (options.onDiagnostic) {
          diagnostic({ kind: 'command', name, durationMs, outcome: value.code ?? value.outcome ?? 'UNKNOWN' });
          diagnostic({ kind: 'egress', name: 'ack', bytes: Buffer.byteLength(JSON.stringify(value)) });
        }
      };
      try { const value = command(socket, name, raw, receivedAtMs); measuredAck(socketAcknowledgements[name].parse(value)); if (['game.join', 'game.resume', 'player.claimControl'].includes(name) && !('code' in value)) sendView(socket, 'state.snapshot'); }
      catch (error) { measuredAck(caught(error, typeof (raw as any)?.requestId === 'string' ? (raw as any).requestId : undefined)); }
    });
    socket.on('disconnect', () => {
      const actor: Session = socket.data.actor; sessions.detachTransport(actor, socket.data.tabId, socket.id);
      try { const player = member(actor), control = sessions.currentControl(actor);
        if (player && !player.removed && control?.tabId === socket.data.tabId && !sessions.page(actor, socket.data.tabId).transportId) { engine.disconnect(engine.state().gameId!, player.playerId); publish(); } } catch { /* A retired session has no current transport. */ }
    });
  });
  await app.ready(); let port = options.port ?? 3210;
  for (;;) { try { await app.listen({ port, host: '127.0.0.1' }); break; }
    catch (error) { if ((error as { code?: string }).code !== 'EADDRINUSE' || options.port !== undefined || port >= 3220) throw error; port++; } }
  port = (app.server.address() as { port: number }).port;
  return {
    port, healthPath: '/hosting-health',
    diagnosticSnapshot() { return { connectedSockets: io.sockets.sockets.size, players: engine.state().players.length, importMetrics: imports.lastMetrics,
      upstreamTransport: { connections: transportConnections, openConnections: measuredTransports.size, maxOpenConnections: maxOpenTransports, httpRequests: transportRequests, upgrades, openHttpRequests, maxOpenHttpRequests,
        readBytes: closedReadBytes + [...measuredTransports].reduce((sum, socket) => sum + socket.bytesRead, 0),
        writtenBytes: closedWrittenBytes + [...measuredTransports].reduce((sum, socket) => sum + socket.bytesWritten, 0) } }; },
    reconcileAfterInterruption() {
      if (closed) return;
      const token = engine.timerToken();
      if (token) engine.wake(token);
      publish();
    },
    configureOrigin(origin: string) {
      if (closed || (config && config.publicOrigin !== origin)) throw new Error('A changed public origin requires a fresh application.');
      config = deploymentConfigSchema.parse({ mode: 'tunnel', purpose: 'event', provider: 'cloudflare', tunnelKind: 'quick', publicOrigin: origin,
        listen: { host: '127.0.0.1', port }, upstreamHost: 'public' });
    },
    setHostingStatus(status: HostingStatus) { const next = hostingStatusSchema.parse(status); if (JSON.stringify(next) !== JSON.stringify(hosting)) { hosting = next; engine.touchRevision(); publish(); } },
    mintOwnerLink() { if (!config || closed) throw new Error('Application unavailable'); return config.publicOrigin + '/host#' + owners.mint(); },
    hasDisposableState() { return engine.state().gameId !== null || imports.busy; },
    async close() {
      if (closed) return; closed = true; reportActive(false); if (timer) clearTimeout(timer); if (readinessTimer) clearTimeout(readinessTimer);
      const state = engine.state(); if (state.gameId) io.emit('game.closed', { protocolVersion: 1, serverInstanceId: sessionId, gameId: state.gameId, revision: state.revision, reason: 'shutdown' });
      owners.clear(); await imports.close(); io.disconnectSockets(true); await io.close(); await app.close(); sessions.clear();
    },
  };
}
