import { describe, expect, it } from 'vitest';
import { createPreferredSocket } from '../../apps/web/src/transport.js';
import type { io } from 'socket.io-client';

function fixture() {
  let options: any;
  const listeners = new Map<string, (...args: any[]) => void>();
  const fake = { io: { opts: {} as any }, on: (event: string, listener: (...args: any[]) => void) => { listeners.set(event, listener); } };
  const create = ((opts: unknown) => { options = opts; fake.io.opts = opts; return fake; }) as unknown as typeof io;
  const socket = createPreferredSocket({ protocolVersion: 2, serverInstanceId: 'instance', tabId: 'tab' }, create);
  return { socket, options, fire: (event: string, value?: unknown) => listeners.get(event)?.(value) };
}
describe('WebSocket-first opening policy', () => {
  it('opens directly with WebSocket and leaves retries with the application', () => {
    const h = fixture(); expect(h.options.transports).toEqual(['websocket']);
    expect(h.options.timeout).toBe(10000); expect(h.options.reconnection).toBe(false); expect(h.options.autoConnect).toBe(false);
  });
  it.each(['websocket error', 'timeout'])('allows polling on the next opening after %s', message => {
    const h = fixture(); h.fire('connect_error', new Error(message));
    expect(h.socket.io.opts.transports).toEqual(['polling', 'websocket']);
    h.fire('connect_error', new Error('polling error'));
    expect(h.socket.io.opts.transports).toEqual(['polling', 'websocket']);
    h.fire('connect'); expect(h.socket.io.opts.transports).toEqual(['websocket']);
  });
  it('does not treat a structured authority denial as transport failure', () => {
    const h = fixture(); h.fire('connect_error', { data: { code: 'UNAUTHORIZED', message: 'Denied' } });
    expect(h.socket.io.opts.transports).toEqual(['websocket']);
  });
});
