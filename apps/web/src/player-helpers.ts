import { codePointCount, collapseWhitespace, trimOuterWhitespace, type CompleteView } from '@rarity/contracts';

export type PlayerView = Extract<CompleteView, { viewRole: 'player' }>;
export type PersonalResult = Extract<PlayerView, { phase: 'Results' }>['ownResult'];

/** Keep codes as text; Number('000042') would point players at the wrong lobby. */
export function validateJoin(code: string, nickname: string): { code?: string; nickname?: string } {
  return {
    ...(!/^\d{6}$/.test(trimOuterWhitespace(code)) ? { code: 'Enter the six-digit game code.' } : {}),
    ...(!trimOuterWhitespace(nickname) ? { nickname: 'Enter a nickname.' }
      : codePointCount(collapseWhitespace(nickname)) > 32 ? { nickname: 'Use 32 characters or fewer for your nickname.' } : {}),
  };
}

export function validateAnswer(text: string): string | null {
  if (!trimOuterWhitespace(text)) return 'Enter an answer.';
  if (codePointCount(text) > 512) return 'Use 512 characters or fewer. Your text has been kept so you can edit it.';
  return null;
}

export function playerErrorMessage(error: { code: string; message: string } | null): string | null {
  if (!error) return null;
  const messages: Record<string, string> = {
    GAME_NOT_FOUND: 'Game not found. Check the code or ask the host for a fresh invitation.',
    NO_LOBBY: 'No game is open. Ask the host to create a lobby and provide a fresh invitation.',
    ENTRY_CLOSED: 'This game has already started. New players cannot join.',
    GAME_FINISHED: 'This game has ended. Ask the host for a fresh invitation.',
    GAME_FULL: 'This game is full. All 100 player places are taken.',
    NICKNAME_TAKEN: 'That nickname is already in use. Choose another nickname.',
    ADMISSION_HISTORY_LIMIT: 'This lobby has reached its admission history limit. Ask the host for a fresh invitation.',
    SESSION_CAPACITY: 'The server is temporarily busy accepting browser sessions. Please try again shortly.',
    HANDSHAKE_CAPACITY: 'The server is temporarily busy connecting browsers. Please try again shortly.',
    PAGE_CAPACITY: 'Too many pages are active in this browser. Close an unused game page, then retry.',
    RATE_LIMITED: 'Please wait briefly before trying again. Your answer has not been rejected by the answer list.',
    REMOVED: 'You were removed from this game. This player identity cannot rejoin it.',
    UNAUTHORIZED: 'This browser cannot recover its player identity. A nickname alone cannot restore access after the game starts.',
    EXPIRED: 'This browser session has expired. A nickname alone cannot restore access after the game starts.',
    UNSUPPORTED_VERSION: 'This page and server use different app versions. Reload this page to get the current app.',
    WRONG_GAME: 'This game is no longer available. Ask the host for a fresh invitation.',
    WRONG_INSTANCE: 'The host server has restarted. Ask the host for a fresh invitation.',
    NOT_ANSWERING: 'The answer phase has closed. Synchronizing the current round…',
    WRONG_ROUND: 'The round has changed. Synchronizing the current round…',
    WRONG_PHASE: 'The phase has changed. Synchronizing the current game…',
    TAB_SUPERSEDED: 'This game is active in another tab.',
    CONTROL_CONFIRMATION_REQUIRED: 'Confirm control of this tab before continuing.',
  };
  return messages[error.code] ?? error.message;
}

/** This is a display estimate, never a transition or an answer verdict. */
export function estimatedRemainingMs(deadlineMs: number, clockOffsetMs: number, nowMs: number): number {
  return Math.max(0, deadlineMs - (nowMs + clockOffsetMs));
}

export function initialInvitationCode(search: string): string {
  // Preserve malformed input for correction, without ever joining automatically.
  return new URLSearchParams(search).get('code') ?? '';
}
