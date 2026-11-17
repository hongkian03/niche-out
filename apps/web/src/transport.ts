import { io, type Socket } from 'socket.io-client';
import { failure } from '@rarity/contracts';

/** One manager, application-owned retry budget. A Manager timeout is also a
 * transport opening failure: the next scheduled opening uses polling. */
export function createPreferredSocket(auth: { protocolVersion: 2; serverInstanceId: string; tabId: string }, create: typeof io = io): Socket {
  const socket = create({ auth, autoConnect: false, reconnection: false,
    transports: ['websocket'], timeout: 10000 });
  socket.on('connect_error', (error: { data?: unknown }) => {
    if (!failure.safeParse(error.data).success) socket.io.opts.transports = ['polling', 'websocket'];
  });
  socket.on('connect', () => {
    // This changes the next Engine.IO opening, never the established connection.
    socket.io.opts.transports = ['websocket'];
  });
  return socket;
}
