import { afterEach, describe, expect, it } from 'vitest';
import { GameEngine, compilePack } from '@rarity/game-core';
import { httpRoutes } from '@rarity/contracts';
import { ImportService, importDefaults, ImportError, type ImportOptions } from '../../apps/server/src/game/imports.js';

const bytes = (input: unknown) => Buffer.from(JSON.stringify(input));
const pack = () => ({ schemaVersion: 1, title: 'Import test', tiers: [{ id: 'rare', name: 'Rare', points: 100 }],
  prompts: [{ id: 'season', text: 'Name a season.', answers: [{ text: 'Autumn SECRET', tierId: 'rare', aliases: ['Fall SECRET'] }] }] });
const capacity = () => ({ availableBytes: 2 ** 32, parentHeapBytes: 2 ** 32 });
const services: ImportService[] = [];
afterEach(async () => { await Promise.all(services.splice(0).map(service => service.close())); });
function setup(options: ImportOptions = {}) {
  let time = 0; let id = 0; let code = 100000;
  const engine = new GameEngine({ now: () => time, newId: kind => kind + (++id), newGameCode: () => String(++code) });
  const service = new ImportService(engine, { now: () => time, newId: () => 'candidate-' + (++id), capacity, ...options });
  services.push(service);
  return { engine, service, setTime: (value: number) => { time = value; } };
}
function commitExisting(engine: GameEngine) {
  const result = engine.commit(compilePack(pack()), engine.state().setupGeneration);
  if (!result.ok) throw Error(result.code);
  engine.admit({ gameId: result.gameId, identityId: 'browser-a', nickname: 'Ada' });
  return result.gameId;
}

describe('E3-S08 bounded worker import', () => {
  it('uses adopted production defaults', () => {
    expect(importDefaults).toEqual({ uploadBytes: 10 * 1024 ** 2, timeoutMs: 10000, workerHeapMiB: 256,
      candidateLifetimeMs: 300000, processHeadroomBytes: 256 * 1024 ** 2,
      parentHeapHeadroomBytes: 128 * 1024 ** 2, byteMultiplier: 8 });
  });
  it('parses and compiles in a real worker, returning a safe summary without committing', async () => {
    const { engine, service } = setup();
    const result = await service.importBytes(bytes(pack()));
    expect(httpRoutes['POST /api/host/import'].success.safeParse(result).success).toBe(true);
    expect(result).toMatchObject({ expectedGameId: null, expectedSetupGeneration: 1,
      summary: { title: 'Import test', promptCount: 1, settings: { readingSeconds: 3, answerSeconds: 25, resultsSeconds: 10 } } });
    expect(JSON.stringify(result)).not.toContain('SECRET');
    expect(JSON.stringify(result)).not.toContain('Name a season.');
    expect(engine.state().phase).toBe('Setup');
    const definition = service.candidateForCommit(result.candidateId, null, 1);
    expect(definition.prompts[0]!.match('  FALL secret ')?.text).toBe('Autumn SECRET');
    expect(engine.commit(definition, 1).ok).toBe(true);
    service.consume(result.candidateId);
    expect(() => service.candidateForCommit(result.candidateId, null, 1)).toThrow('Validate and review');
    expect(service.busy).toBe(false);
    expect(service.lastMetrics).toMatchObject({ workerStarted: true });
    expect(service.lastMetrics!.workerPeakHeapBytes).toBeGreaterThan(0);
    expect(service.lastMetrics!.transferRssBytes).toBeGreaterThan(0);
  });
  it('reserves before upload body consumption and rejects concurrent readers without a queue', async () => {
    const { engine, service } = setup();
    const ticket = service.begin();
    expect(service.busy).toBe(true);
    expect(() => service.begin()).toThrow(expect.objectContaining({ code: 'IMPORT_IN_PROGRESS' }));
    expect(engine.state().setupGeneration).toBe(1);
    expect(engine.start('none', { hostingReady: true, importInProgress: service.busy }).ok).toBe(false);
    service.abort(ticket);
    expect(service.busy).toBe(false);
    await expect(service.complete(ticket, bytes(pack()))).rejects.toMatchObject({ code: 'CANDIDATE_STALE' });
  });
  it('releases reservation for a missing raw upload body', async () => {
    const { service } = setup();
    await expect(service.complete(service.begin(), undefined as unknown as Uint8Array)).rejects.toMatchObject({ code: 'INVALID_PACK' });
    expect(service.busy).toBe(false);
    await expect(service.importBytes(bytes(pack()))).resolves.toHaveProperty('candidateId');
  });
  it('rejects concurrent complete calls using the same reservation', async () => {
    const { service } = setup(); const ticket = service.begin();
    const pending = service.complete(ticket, bytes(pack()));
    await expect(service.complete(ticket, bytes(pack()))).rejects.toMatchObject({ code: 'IMPORT_IN_PROGRESS' });
    await pending;
  });
  it('rejects >10 MiB before creating any worker and preserves committed state', async () => {
    const { engine, service } = setup(); const gameId = commitExisting(engine);
    await expect(service.importBytes(new Uint8Array(importDefaults.uploadBytes + 1))).rejects.toMatchObject({ code: 'UPLOAD_TOO_LARGE' });
    expect(service.lastMetrics?.workerStarted).toBe(false);
    expect(engine.state()).toMatchObject({ gameId, phase: 'Lobby', players: [{ nickname: 'Ada' }] });
  });
  it('accepts an exactly 10 MiB valid JSON body including trailing whitespace', async () => {
    const { service } = setup();
    const prefix = bytes(pack());
    const input = Buffer.alloc(importDefaults.uploadBytes, 32);
    input.set(prefix);
    const result = await service.importBytes(input);
    expect(result.summary.promptCount).toBe(1);
    expect(service.lastMetrics?.bytes).toBe(importDefaults.uploadBytes);
  });
  it.each([
    { availableBytes: undefined, parentHeapBytes: 2 ** 32 },
    { availableBytes: 0, parentHeapBytes: 2 ** 32 },
    { availableBytes: 2 ** 32, parentHeapBytes: undefined },
    { availableBytes: 2 ** 32, parentHeapBytes: 0 },
  ])('rejects unknown/insufficient memory without starting a worker (%j)', async value => {
    const { service } = setup({ capacity: () => value });
    await expect(service.importBytes(bytes(pack()))).rejects.toMatchObject({ code: 'IMPORT_CAPACITY' });
    expect(service.lastMetrics?.workerStarted).toBe(false);
    expect(service.busy).toBe(false);
  });
  it('rejects malformed JSON and invalid UTF-8 without reflecting uploaded content', async () => {
    const { engine, service } = setup(); const gameId = commitExisting(engine);
    for (const input of [Buffer.from('{"secret": "DO NOT ECHO'), Buffer.from([255, 254])]) {
      const failure = await service.importBytes(input).catch(value => value as ImportError);
      expect(failure).toBeInstanceOf(ImportError);
      if (!(failure instanceof ImportError)) throw Error('Expected import rejection');
      expect(failure.code).toBe('INVALID_PACK');
      expect(JSON.stringify(failure)).not.toContain('DO NOT ECHO');
      expect(engine.state().gameId).toBe(gameId);
    }
  });
  it('preserves exact unknown-field and alias-collision paths from worker compilation', async () => {
    const { service } = setup(); const unknown = { ...pack(), settings: { typo: 1 } };
    await expect(service.importBytes(bytes(unknown))).rejects.toMatchObject({ code: 'INVALID_PACK',
      fieldErrors: [{ path: ['settings', 'typo'], message: 'Unknown field.' }] });
    const collision = pack();
    collision.prompts[0]!.answers.push({ text: 'Other', tierId: 'rare', aliases: ['FALL SECRET'] });
    await expect(service.importBytes(bytes(collision))).rejects.toMatchObject({ code: 'INVALID_PACK',
      fieldErrors: [{ path: ['prompts', 0, 'answers', 1, 'aliases', 0] }] });
  });
  it('expires a staged candidate at exactly five minutes', async () => {
    const { service, setTime } = setup(); const result = await service.importBytes(bytes(pack()));
    setTime(299999);
    expect(service.candidateForCommit(result.candidateId, null, 1).title).toBe('Import test');
    setTime(300000);
    expect(() => service.candidateForCommit(result.candidateId, null, 1)).toThrow(expect.objectContaining({ code: 'CANDIDATE_EXPIRED' }));
  });
  it('new validation invalidates the prior candidate even if new validation fails', async () => {
    const { engine, service } = setup(); const gameId = commitExisting(engine);
    const first = await service.importBytes(bytes(pack()));
    await expect(service.importBytes(Buffer.from('{'))).rejects.toMatchObject({ code: 'INVALID_PACK' });
    expect(() => service.candidateForCommit(first.candidateId, first.expectedGameId, first.expectedSetupGeneration)).toThrow(expect.objectContaining({ code: 'CANDIDATE_STALE' }));
    expect(engine.state()).toMatchObject({ gameId, phase: 'Lobby', players: [{ nickname: 'Ada' }] });
  });
  it('checks candidate/game/generation context and closes Start-vs-import races', async () => {
    const { engine, service } = setup(); const gameId = commitExisting(engine);
    const result = await service.importBytes(bytes(pack()));
    expect(() => service.candidateForCommit(result.candidateId, 'old-game', result.expectedSetupGeneration)).toThrow(expect.objectContaining({ code: 'CANDIDATE_STALE' }));
    expect(() => service.candidateForCommit(result.candidateId, gameId, result.expectedSetupGeneration + 1)).toThrow(expect.objectContaining({ code: 'CANDIDATE_STALE' }));
    engine.start(gameId, { hostingReady: true });
    expect(() => service.candidateForCommit(result.candidateId, gameId, result.expectedSetupGeneration)).toThrow(expect.objectContaining({ code: 'CANDIDATE_STALE' }));
    const before = engine.state();
    expect(() => service.begin()).toThrow(expect.objectContaining({ code: 'WRONG_PHASE' }));
    expect(engine.state()).toEqual(before);
  });
  it('invalidates an unfinished worker result if setup generation changes', async () => {
    const { engine, service } = setup(); const pending = service.importBytes(bytes(pack()));
    engine.advanceSetupGeneration();
    await expect(pending).rejects.toMatchObject({ code: 'CANDIDATE_STALE' });
    expect(engine.state().phase).toBe('Setup');
  });
  it('terminates a stalled real worker at the configured timeout without committing', async () => {
    const { engine, service } = setup({ timeoutMs: 25, workerUrl: new URL('data:text/javascript,setInterval(()=>{},1000)') });
    const gameId = commitExisting(engine);
    await expect(service.importBytes(bytes(pack()))).rejects.toMatchObject({ code: 'IMPORT_TIMEOUT' });
    expect(service.busy).toBe(false);
    expect(engine.state().gameId).toBe(gameId);
  });
  it.each(["throw new Error('PRIVATE FAILURE')", 'process.exit(0)'])('sanitizes failed or prematurely exited workers: %s', async source => {
    const { service } = setup({ workerUrl: new URL('data:text/javascript,' + encodeURIComponent(source)) });
    const result = await service.importBytes(bytes(pack())).catch(error => error);
    expect(result).toMatchObject({ code: 'IMPORT_CAPACITY' });
    expect(JSON.stringify(result)).not.toContain('PRIVATE FAILURE');
    expect(service.busy).toBe(false);
  });
  it('close cancels and terminates a pending worker and future imports', async () => {
    const { service } = setup({ workerUrl: new URL('data:text/javascript,setInterval(()=>{},1000)') });
    const pending = expect(service.importBytes(bytes(pack()))).rejects.toMatchObject({ code: 'CANDIDATE_STALE' });
    await service.close(); await pending;
    expect(service.busy).toBe(false);
    expect(() => service.begin()).toThrow(expect.objectContaining({ code: 'CANDIDATE_STALE' }));
  });
  it('fencing clears the candidate and advances generation without replacing the lobby', async () => {
    const { engine, service } = setup(); const gameId = commitExisting(engine);
    const result = await service.importBytes(bytes(pack()));
    service.invalidate();
    expect(engine.state().setupGeneration).toBe(result.expectedSetupGeneration + 1);
    expect(engine.state().gameId).toBe(gameId);
    expect(() => service.candidateForCommit(result.candidateId, gameId, result.expectedSetupGeneration)).toThrow(expect.objectContaining({ code: 'CANDIDATE_STALE' }));
  });
});
