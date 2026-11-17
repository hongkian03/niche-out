import { answerTextSchema, codePointCount, collapseWhitespace, matchingKey } from '@rarity/contracts';
import { isCompiledPack, type CompiledAnswer, type CompiledPack } from './compile.js';

export type Phase = 'Setup' | 'Lobby' | 'Reading' | 'Answering' | 'Results' | 'Finished';
export interface EnginePlayer {
  playerId: string; identityId: string; nickname: string;
  connection: 'connected' | 'disconnected'; removed: boolean; publishedTotal: number;
}
export interface Submission { playerId: string; submittedText: string; answer: CompiledAnswer }
export interface RevealedAnswer { canonicalText: string; tierName: string; points: number }
export interface RoundResults { groups: (RevealedAnswer & { count: number })[]; unused: RevealedAnswer | null }
export interface EngineRound {
  roundId: string; roundIndex: number; prompt: string; submissions: Submission[];
  finalized: boolean; results: RoundResults | null; points: { playerId: string; points: number }[];
}
export interface EngineState {
  serverInstanceId: string; revision: number; setupGeneration: number; phaseId: string; phase: Phase;
  gameId: string | null; gameCode: string | null; definition: CompiledPack | null;
  roundIndex: number | null; roundId: string | null; phaseDeadlineMs: number | null;
  phaseStartedMs: number | null; players: EnginePlayer[]; rounds: EngineRound[];
}
export interface TimerToken {
  serverInstanceId: string; gameId: string; roundId: string; phaseId: string; phase: Phase; deadlineMs: number;
}
export type FailureCode = 'WRONG_GAME' | 'WRONG_ROUND' | 'INVALID_PACK' | 'STALE_GENERATION' |
  'INVALID_PHASE' | 'INVALID_ID' | 'INVALID_CODE' | 'INVALID_NICKNAME' | 'INVALID_IDENTITY' |
  'NICKNAME_TAKEN' | 'GAME_FULL' | 'ADMISSION_HISTORY_LIMIT' | 'ENTRY_CLOSED' | 'REMOVED' |
  'UNKNOWN_PLAYER' | 'NO_PLAYERS' | 'TUNNEL_NOT_READY' | 'IMPORT_IN_PROGRESS' |
  'NOT_ANSWERING' | 'EXPIRED' | 'INVALID_PAYLOAD' | 'INVALID_RECEIPT';
export type Result<T extends object = Record<never, never>> = ({ ok: true } & T) | { ok: false; code: FailureCode };
export interface EngineOptions {
  now: () => number; newId: (kind: string) => string; newGameCode: () => string; serverInstanceId?: string;
}
type DeepReadonly<T> = T extends (...args: never[]) => unknown ? T : T extends readonly unknown[] ?
  { readonly [K in keyof T]: DeepReadonly<T[K]> } : T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;
export type EngineSnapshot = DeepReadonly<EngineState>;

function freeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}
const fail = (code: FailureCode): { ok: false; code: FailureCode } => ({ ok: false, code });
const reveal = (answer: CompiledAnswer): RevealedAnswer => ({ canonicalText: answer.text, tierName: answer.tierName, points: answer.points });

/** Trusted server-side snapshot only: contains answer banks. Never serialize it to a client. */
export function readiness(state: EngineSnapshot): { accepted: number; eligible: number } {
  const players = state.players.filter(player => !player.removed);
  const submissions = state.rounds.find(round => round.roundId === state.roundId)?.submissions ?? [];
  return { eligible: players.length, accepted: players.filter(player => submissions.some(answer => answer.playerId === player.playerId)).length };
}
export function standings(state: EngineSnapshot): { playerId: string; nickname: string; rank: number; publishedTotal: number }[] {
  const sorted = state.players.filter(player => !player.removed).sort((a, b) => b.publishedTotal - a.publishedTotal);
  let rank = 0;
  return sorted.map((player, index) => {
    if (index === 0 || player.publishedTotal !== sorted[index - 1].publishedTotal) rank = index + 1;
    return { playerId: player.playerId, nickname: player.nickname, rank, publishedTotal: player.publishedTotal };
  });
}

/** Synchronous deterministic rules. Authorization, request deduplication and actual timers belong to the server adapter. */
export class GameEngine {
  #state: EngineState;
  #options: EngineOptions;
  #lastNow = -Infinity;
  #idSequence = 0;

  constructor(options: EngineOptions) {
    this.#options = options;
    const serverInstanceId = options.serverInstanceId ?? this.#id('instance');
    if (typeof serverInstanceId !== 'string' || !serverInstanceId) throw new Error('Server instance ID must be nonempty.');
    this.#state = { serverInstanceId, revision: 0, setupGeneration: 0, phaseId: this.#id('phase'), phase: 'Setup',
      gameId: null, gameCode: null, definition: null, roundIndex: null, roundId: null,
      phaseDeadlineMs: null, phaseStartedMs: null, players: [], rounds: [] };
  }

  #id(kind: string): string {
    const id = this.#options.newId(kind);
    if (typeof id !== 'string' || !id) throw new Error('ID generator must return nonempty IDs.');
    // A constant-sized counter guarantees occurrence uniqueness even if an injected
    // generator repeats. Old games need no retained ID set. Instance identity is
    // separately supplied by the process adapter to fence process restarts.
    return id + '-' + (++this.#idSequence);
  }
  #now(): number {
    const time = this.#options.now();
    if (!Number.isFinite(time) || time < this.#lastNow) throw new Error('Clock must return finite monotonic milliseconds.');
    this.#lastNow = time;
    return time;
  }
  /** Constant-time phase metadata for adapter scheduling and private diagnostics. */
  get phase(): Phase { return this.#state.phase; }
  state(): EngineSnapshot {
    return freeze({ ...this.#state, players: this.#state.players.map(player => ({ ...player })),
      rounds: this.#state.rounds.map(round => ({ ...round,
        submissions: round.submissions.map(submission => ({ ...submission })),
        points: round.points.map(points => ({ ...points })),
        results: round.results && { groups: round.results.groups.map(group => ({ ...group })),
          unused: round.results.unused && { ...round.results.unused } },
      })) });
  }
  /** Adapter-owned observable metadata changed (hosting/control/import); reads must never call this. */
  touchRevision(): void { this.#state.revision++; }
  advanceSetupGeneration(): Result<{ setupGeneration: number }> {
    if (!['Setup', 'Lobby', 'Finished'].includes(this.#state.phase)) return fail('INVALID_PHASE');
    this.#state.setupGeneration++;
    this.#state.revision++;
    return { ok: true, setupGeneration: this.#state.setupGeneration };
  }
  commit(definition: CompiledPack, expectedSetupGeneration: number): Result<{ gameId: string; gameCode: string }> {
    if (!isCompiledPack(definition)) return fail('INVALID_PACK');
    if (expectedSetupGeneration !== this.#state.setupGeneration) return fail('STALE_GENERATION');
    if (!['Setup', 'Lobby', 'Finished'].includes(this.#state.phase)) return fail('INVALID_PHASE');
    // Prepare every fallible value before replacing the committed state.
    const gameCode = this.#options.newGameCode();
    if (!/^\d{6}$/.test(gameCode) || gameCode === this.#state.gameCode) return fail('INVALID_CODE');
    let gameId: string; let phaseId: string;
    try { gameId = this.#id('game'); phaseId = this.#id('phase'); } catch { return fail('INVALID_ID'); }
    this.#state = { ...this.#state, gameId, gameCode, phaseId, definition, phase: 'Lobby',
      setupGeneration: this.#state.setupGeneration + 1, revision: this.#state.revision + 1,
      players: [], rounds: [], roundId: null, roundIndex: null, phaseDeadlineMs: null, phaseStartedMs: null };
    return { ok: true, gameId, gameCode };
  }
  #game(gameId: string): Result {
    return gameId === this.#state.gameId ? { ok: true } : fail('WRONG_GAME');
  }
  #player(gameId: string, playerId: string): Result<{ player: EnginePlayer }> {
    const game = this.#game(gameId); if (!game.ok) return game;
    const player = this.#state.players.find(candidate => candidate.playerId === playerId);
    if (!player) return fail('UNKNOWN_PLAYER');
    if (player.removed) return fail('REMOVED');
    return { ok: true, player };
  }
  admit(input: { gameId: string; identityId: string; nickname: string }): Result<{ playerId: string; nickname: string; recovered: boolean }> {
    const game = this.#game(input.gameId); if (!game.ok) return game;
    if (typeof input.identityId !== 'string' || !input.identityId) return fail('INVALID_IDENTITY');
    const existing = this.#state.players.find(player => player.identityId === input.identityId);
    if (existing) {
      if (existing.removed) return fail('REMOVED');
      this.#expire(this.#now());
      if (existing.connection !== 'connected') { existing.connection = 'connected'; this.#state.revision++; }
      return { ok: true, playerId: existing.playerId, nickname: existing.nickname, recovered: true };
    }
    if (this.#state.phase !== 'Lobby') return fail('ENTRY_CLOSED');
    if (typeof input.nickname !== 'string') return fail('INVALID_NICKNAME');
    const nickname = collapseWhitespace(input.nickname);
    if (!nickname || codePointCount(nickname) > 32) return fail('INVALID_NICKNAME');
    const active = this.#state.players.filter(player => !player.removed);
    if (active.some(player => matchingKey(player.nickname) === matchingKey(nickname))) return fail('NICKNAME_TAKEN');
    if (active.length >= 100) return fail('GAME_FULL');
    if (this.#state.players.length >= 1000) return fail('ADMISSION_HISTORY_LIMIT');
    const playerId = this.#id('player');
    this.#state.players.push({ playerId, identityId: input.identityId, nickname, connection: 'connected', removed: false, publishedTotal: 0 });
    this.#state.revision++;
    return { ok: true, playerId, nickname, recovered: false };
  }
  start(gameId: string, options: { hostingReady: boolean; importInProgress?: boolean } = { hostingReady: false }): Result {
    const game = this.#game(gameId); if (!game.ok) return game;
    if (this.#state.phase !== 'Lobby') return fail('INVALID_PHASE');
    if (!options.hostingReady) return fail('TUNNEL_NOT_READY');
    if (options.importInProgress) return fail('IMPORT_IN_PROGRESS');
    if (!this.#state.players.some(player => !player.removed)) return fail('NO_PLAYERS');
    this.#beginRound(0, this.#now());
    this.#state.setupGeneration++;
    this.#state.revision++;
    return { ok: true };
  }
  #beginRound(index: number, now: number): void {
    const prompt = this.#state.definition!.prompts[index];
    const roundId = this.#id('round');
    const phaseId = this.#id('phase');
    this.#state.rounds.push({ roundId, roundIndex: index, prompt: prompt.text, submissions: [], finalized: false, results: null, points: [] });
    this.#state.roundIndex = index;
    this.#state.roundId = roundId;
    this.#phase('Reading', now, this.#state.definition!.settings.readingSeconds, phaseId);
  }
  #phase(phase: Phase, now: number, seconds?: number, phaseId = this.#id('phase')): void {
    this.#state.phaseId = phaseId;
    this.#state.phase = phase;
    this.#state.phaseStartedMs = seconds === undefined ? null : now;
    this.#state.phaseDeadlineMs = seconds === undefined ? null : now + Math.round(seconds * 1000);
  }
  timerToken(): Readonly<TimerToken> | null {
    const state = this.#state;
    if (state.phaseDeadlineMs === null) return null;
    return Object.freeze({ serverInstanceId: state.serverInstanceId, gameId: state.gameId!, roundId: state.roundId!,
      phaseId: state.phaseId, phase: state.phase, deadlineMs: state.phaseDeadlineMs });
  }
  wake(token: TimerToken): boolean {
    const current = this.timerToken();
    if (!current || Object.keys(current).some(key => current[key as keyof TimerToken] !== token[key as keyof TimerToken])) return false;
    return this.#expire(this.#now());
  }
  resumeAfterSuspension(): boolean { return this.#expire(this.#now()); }
  #expire(now: number, phaseId?: string): boolean {
    if (this.#state.phaseDeadlineMs === null || now < this.#state.phaseDeadlineMs) return false;
    this.#advance(now, phaseId);
    this.#state.revision++;
    return true;
  }
  #advance(now: number, phaseId?: string): void {
    const definition = this.#state.definition!;
    if (this.#state.phase === 'Reading') this.#phase('Answering', now, definition.settings.answerSeconds);
    else if (this.#state.phase === 'Answering') {
      const nextPhaseId = phaseId ?? this.#id('phase');
      this.#finalize();
      this.#phase('Results', now, definition.settings.resultsSeconds, nextPhaseId);
    } else if (this.#state.phase === 'Results') {
      if (this.#state.roundIndex! + 1 < definition.prompts.length) this.#beginRound(this.#state.roundIndex! + 1, now);
      else {
        this.#phase('Finished', now);
        this.#state.roundId = null;
        this.#state.roundIndex = null;
      }
    }
  }
  #currentRound(): EngineRound { return this.#state.rounds[this.#state.roundIndex!]; }
  #finalize(): void {
    const round = this.#currentRound();
    if (round.finalized) return;
    const counts = new Map<string, number>();
    for (const submission of round.submissions) counts.set(submission.answer.id, (counts.get(submission.answer.id) ?? 0) + 1);
    round.points = this.#state.players.map(player => {
      const points = round.submissions.find(answer => answer.playerId === player.playerId)?.answer.points ?? 0;
      player.publishedTotal += points;
      return { playerId: player.playerId, points };
    });
    const ordered = [...this.#state.definition!.prompts[round.roundIndex].answers].sort((a, b) => b.points - a.points || a.index - b.index);
    const unused = ordered.find(answer => !counts.has(answer.id));
    round.results = { groups: ordered.filter(answer => counts.has(answer.id)).map(answer => ({ ...reveal(answer), count: counts.get(answer.id)! })),
      unused: unused ? reveal(unused) : null };
    round.finalized = true;
  }
  #early(now: number, phaseId?: string): void {
    if (this.#state.phase !== 'Answering') return;
    const counts = readiness(this.#state);
    if (counts.eligible > 0 && counts.accepted === counts.eligible) this.#advance(now, phaseId);
  }
  submit(input: { gameId: string; roundId: string; playerId: string; text: string; receivedAtMs: number }):
    Result<{ outcome: 'ACCEPTED' | 'REJECTED' | 'ALREADY_LOCKED'; locked: boolean; submittedText: string | null }> {
    const member = this.#player(input.gameId, input.playerId); if (!member.ok) return member;
    if (input.roundId !== this.#state.roundId) return fail('WRONG_ROUND');
    if (this.#state.phase !== 'Answering') return fail('NOT_ANSWERING');
    const now = this.#now();
    if (!Number.isFinite(input.receivedAtMs) || input.receivedAtMs > now || input.receivedAtMs < this.#state.phaseStartedMs!) return fail('INVALID_RECEIPT');
    if (input.receivedAtMs >= this.#state.phaseDeadlineMs!) { this.#expire(now); return fail('EXPIRED'); }
    if (!answerTextSchema.safeParse(input.text).success) return fail('INVALID_PAYLOAD');
    const round = this.#currentRound();
    const existing = round.submissions.find(submission => submission.playerId === input.playerId);
    if (existing) {
      this.#expire(now);
      return { ok: true, outcome: 'ALREADY_LOCKED', locked: true, submittedText: existing.submittedText };
    }
    const answer = this.#state.definition!.prompts[round.roundIndex].match(input.text);
    if (!answer) {
      this.#expire(now);
      return { ok: true, outcome: 'REJECTED', locked: false, submittedText: null };
    }
    const nextPhaseId = this.#id('phase');
    round.submissions.push({ playerId: input.playerId, submittedText: input.text, answer });
    this.#early(now, nextPhaseId);
    this.#expire(now, nextPhaseId);
    this.#state.revision++;
    return { ok: true, outcome: 'ACCEPTED', locked: true, submittedText: input.text };
  }
  disconnect(gameId: string, playerId: string): Result { return this.#connection(gameId, playerId, 'disconnected'); }
  resumePlayer(gameId: string, playerId: string): Result { return this.#connection(gameId, playerId, 'connected'); }
  #connection(gameId: string, playerId: string, connection: 'connected' | 'disconnected'): Result {
    const member = this.#player(gameId, playerId); if (!member.ok) return member;
    this.#expire(this.#now());
    if (member.player.connection !== connection) { member.player.connection = connection; this.#state.revision++; }
    return { ok: true };
  }
  remove(gameId: string, playerId: string): Result<{ alreadyRemoved: boolean }> {
    const game = this.#game(gameId); if (!game.ok) return game;
    const player = this.#state.players.find(candidate => candidate.playerId === playerId);
    if (!player) return fail('UNKNOWN_PLAYER');
    if (player.removed) return { ok: true, alreadyRemoved: true };
    const now = this.#now();
    this.#expire(now);
    const nextPhaseId = this.#state.phase === 'Answering' ? this.#id('phase') : undefined;
    player.removed = true;
    this.#early(now, nextPhaseId);
    this.#state.revision++;
    return { ok: true, alreadyRemoved: false };
  }
}
