import {
  hostView, playerView, hostingStatusSchema, invitationSchema,
  type HostingStatus, type Invitation,
} from '@rarity/contracts';
import { readiness, standings, type EngineSnapshot } from './engine.js';

type Round = EngineSnapshot['rounds'][number];
type Player = EngineSnapshot['players'][number];

export class ProjectionError extends Error {
  constructor(readonly code: 'NO_GAME' | 'PLAYER_NOT_FOUND' | 'REMOVED' | 'RECAP_NOT_AVAILABLE' | 'ROUND_NOT_FOUND' | 'INVITATION_MISMATCH') {
    super(code);
    this.name = 'ProjectionError';
  }
}

interface ViewContext {
  /** Sample from the same injected clock domain as the engine deadline. */
  serverNowMs: number;
  requestedRoundId?: string;
}

export interface HostViewContext extends ViewContext {
  hosting: HostingStatus;
  importInProgress?: boolean;
  /** Required only in Lobby. This is the public invitation, never an owner URL. */
  invitation?: Invitation;
}

export interface PlayerViewContext extends ViewContext {
  /** Server-resolved authenticated membership, never a browser-supplied target. */
  playerId: string;
  controlGeneration: number;
}

function base(state: EngineSnapshot, context: ViewContext) {
  return {
    protocolVersion: 2 as const,
    serverInstanceId: state.serverInstanceId,
    revision: state.revision,
    phaseId: state.phaseId,
    serverNowMs: context.serverNowMs,
  };
}

const inactive = { roundId: null, roundIndex: null, phaseDeadlineMs: null } as const;

function committed(state: EngineSnapshot, context: ViewContext) {
  if (!state.gameId || !state.definition) throw new ProjectionError('NO_GAME');
  return { ...base(state, context), gameId: state.gameId, promptCount: state.definition.prompts.length };
}

function roundIdentity(round: Round) {
  return { roundId: round.roundId, roundIndex: round.roundIndex, prompt: round.prompt };
}

function currentRound(state: EngineSnapshot): Round {
  const round = state.rounds.find(candidate => candidate.roundId === state.roundId);
  if (!round) throw new ProjectionError('ROUND_NOT_FOUND');
  return round;
}

function timed(state: EngineSnapshot, context: ViewContext) {
  return { ...committed(state, context), ...roundIdentity(currentRound(state)), phaseDeadlineMs: state.phaseDeadlineMs };
}

function identity(player: Player) {
  return { playerId: player.playerId, nickname: player.nickname };
}

function roster(state: EngineSnapshot) {
  return state.players.filter(player => !player.removed).map(player => ({ ...identity(player), connection: player.connection }));
}

function result(round: Round, playerId: string) {
  const submission = round.submissions.find(item => item.playerId === playerId);
  if (!submission) return { outcome: 'miss' as const, points: 0 as const };
  return {
    outcome: 'accepted' as const, submittedText: submission.submittedText,
    canonicalText: submission.answer.text, tierName: submission.answer.tierName, points: submission.answer.points,
  };
}

function publicResults(round: Round) {
  if (!round.finalized || !round.results) throw new ProjectionError('RECAP_NOT_AVAILABLE');
  // Select every wire field explicitly, even from already-aggregated core records.
  const revealed = (item: NonNullable<Round['results']>['groups'][number] | NonNullable<NonNullable<Round['results']>['unused']>) => ({
    canonicalText: item.canonicalText, tierName: item.tierName, points: item.points,
  });
  return {
    groups: round.results.groups.map(group => ({ ...revealed(group), count: group.count })),
    unused: round.results.unused ? revealed(round.results.unused) : null,
  };
}

function roundStandings(state: EngineSnapshot, round: Round) {
  return standings(state).map(row => ({
    playerId: row.playerId, nickname: row.nickname, rank: row.rank, publishedTotal: row.publishedTotal,
    roundPoints: round.points.find(item => item.playerId === row.playerId)?.points ?? 0,
  }));
}

function requestedDetail(state: EngineSnapshot, context: ViewContext) {
  if (context.requestedRoundId === undefined) return null;
  if (state.phase !== 'Finished') throw new ProjectionError('RECAP_NOT_AVAILABLE');
  const round = state.rounds.find(candidate => candidate.roundId === context.requestedRoundId);
  if (!round) throw new ProjectionError('ROUND_NOT_FOUND');
  return { roundId: round.roundId, results: publicResults(round) };
}

function finished(state: EngineSnapshot, context: ViewContext) {
  const rows = standings(state);
  return {
    ...committed(state, context), ...inactive, phase: 'Finished' as const,
    standings: rows, winnerIds: rows.filter(row => row.rank === 1).map(row => row.playerId),
    requestedDetail: requestedDetail(state, context),
  };
}

/** Trusted server adapter entry point. Never serialize EngineState itself. */
export function projectHost(state: EngineSnapshot, context: HostViewContext) {
  requestedDetail(state, context);
  const hosting = hostingStatusSchema.parse(context.hosting);
  if (state.phase === 'Setup') {
    return hostView.parse({
      ...base(state, context), ...inactive, phase: 'Setup', viewRole: 'host', hosting,
      gameId: null, promptCount: 0, setupGeneration: state.setupGeneration,
    });
  }
  if (state.phase === 'Lobby') {
    const invitation = invitationSchema.parse(context.invitation);
    if (invitation.code !== state.gameCode) throw new ProjectionError('INVITATION_MISMATCH');
    const definition = state.definition!;
    const rows = roster(state);
    return hostView.parse({
      ...committed(state, context), ...inactive, phase: 'Lobby', viewRole: 'host', hosting,
      setupGeneration: state.setupGeneration, invitation,
      packSummary: {
        title: definition.title, promptCount: definition.prompts.length,
        tiers: definition.tiers.map(tier => ({ name: tier.name, points: tier.points })),
        settings: { ...definition.settings },
      },
      roster: rows, canStart: hosting.status === 'ready' && rows.length > 0 && !context.importInProgress,
      canReplace: !context.importInProgress, admissionHistoryFull: state.players.length >= 1000,
    });
  }
  if (state.phase === 'Reading' || state.phase === 'Answering') {
    return hostView.parse({
      ...timed(state, context), phase: state.phase, viewRole: 'host', hosting,
      readiness: readiness(state), roster: roster(state), publishedStandings: standings(state),
    });
  }
  if (state.phase === 'Results') {
    const round = currentRound(state);
    return hostView.parse({
      ...timed(state, context), phase: 'Results', viewRole: 'host', hosting, roster: roster(state),
      results: publicResults(round), standings: roundStandings(state, round),
    });
  }
  return hostView.parse({
    ...finished(state, context), viewRole: 'host', hosting, setupGeneration: state.setupGeneration,
    rounds: state.rounds.map(roundIdentity),
  });
}

/** Caller identity must already be authenticated; this API has no recap target. */
export function projectPlayer(state: EngineSnapshot, context: PlayerViewContext) {
  const player = state.players.find(candidate => candidate.playerId === context.playerId);
  if (!player) throw new ProjectionError('PLAYER_NOT_FOUND');
  if (player.removed) throw new ProjectionError('REMOVED');
  requestedDetail(state, context);
  const ownPlayer = identity(player);
  if (state.phase === 'Lobby') {
    return playerView.parse({
      ...committed(state, context), ...inactive, phase: 'Lobby', viewRole: 'player',
      title: state.definition!.title, ownPlayer, admittedCount: roster(state).length, connection: player.connection,
    });
  }
  if (state.phase === 'Reading' || state.phase === 'Answering') {
    const submission = currentRound(state).submissions.find(item => item.playerId === player.playerId);
    return playerView.parse({
      ...timed(state, context), phase: state.phase, viewRole: 'player', ownPlayer,
      ownAnswer: submission ? { locked: true, submittedText: submission.submittedText } : { locked: false, submittedText: null },
      controlGeneration: context.controlGeneration, readiness: readiness(state),
      publishedTotal: player.publishedTotal,
    });
  }
  if (state.phase === 'Results') {
    const round = currentRound(state);
    return playerView.parse({
      ...timed(state, context), phase: 'Results', viewRole: 'player', ownPlayer,
      ownResult: result(round, player.playerId), results: publicResults(round), standings: roundStandings(state, round),
    });
  }
  if (state.phase !== 'Finished') throw new ProjectionError('NO_GAME');
  return playerView.parse({
    ...finished(state, context), viewRole: 'player', ownPlayer,
    rounds: state.rounds.map(round => ({ ...roundIdentity(round), ownResult: result(round, player.playerId) })),
  });
}
