import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../apps/web/src/App.js';
import type { ClientSnapshot, GameClient } from '../../apps/web/src/client.js';

const guest = { protocolVersion: 2, serverInstanceId: 'instance', tabId: 'tab', requestPrefix: 'prefix',
  role: 'guest', membership: null, hostGameId: null, lastGameCommit: null, resume: 'none' } as const;
const setup = { protocolVersion: 2, serverInstanceId: 'instance', revision: 1, phaseId: 'setup-phase', serverNowMs: 1000,
  viewRole: 'host', phase: 'Setup', hosting: { status: 'ready', publicOrigin: 'https://niche.example.com' },
  gameId: null, promptCount: 0, roundId: null, roundIndex: null, phaseDeadlineMs: null, setupGeneration: 0 } as const;
function render(patch: Partial<ClientSnapshot>, pathname = '/host') {
  vi.stubGlobal('location', { pathname, hash: '', search: '' });
  const snapshot: ClientSnapshot = { session: null, view: null, status: 'discovering', error: null, pending: null,
    candidate: null, controlGeneration: null, clockOffsetMs: 0, answerFeedback: null, recapCache: {}, ...patch };
  const client = { getSnapshot: () => snapshot, subscribe: () => () => {}, boot: vi.fn(), dispose: vi.fn() } as unknown as GameClient;
  return renderToStaticMarkup(createElement(App, { client }));
}
afterEach(() => vi.unstubAllGlobals());

describe('role routing and private host recovery', () => {
  it('preserves the disabled host view when cookie-loss discovery now identifies a guest', () => {
    const html = render({ session: guest, view: setup, status: 'host-revoked', error: { code: 'HOST_REVOKED', message: 'Host access expired.' } });
    expect(html).toContain('Host access is no longer available in this browser.');
    expect(html).toContain('Open host page in the local launcher');
    expect(html).toMatch(/<input[^>]*id="game-file"[^>]*disabled=""/);
    expect(html).not.toContain('Join a game');
    expect(html).not.toContain('This game is no longer available.');
  });
  it('offers launcher recovery for an invalid private bootstrap link before any view exists', () => {
    const html = render({ status: 'closed', error: { code: 'UNAUTHORIZED', message: 'unauthorized' } });
    expect(html).toContain('Open your host page');
    expect(html).toContain('local hosting launcher');
    expect(html).not.toContain('Back to join');
  });
  it('does not silently turn an unclaimed host page into player admission', () => {
    const html = render({ session: guest, status: 'connected' });
    expect(html).toContain('Open your host page');
    expect(html).not.toContain('Join game');
  });
  it('provides separate-profile instructions and preserves the player on owner-role conflict', () => {
    const html = render({ status: 'host-conflict' });
    expect(html).toContain('Your player and score are preserved.');
    expect(html).toContain('separate browser profile or private window');
    expect(html).toContain('href="/join"');
    expect(html).toContain('Continue playing');
  });
  it('shows normal public admission only after guest discovery', () => {
    expect(render({ status: 'discovering' }, '/join')).not.toContain('id="nickname"');
    expect(render({ session: guest, status: 'connected' }, '/join')).toContain('id="nickname"');
  });
});
