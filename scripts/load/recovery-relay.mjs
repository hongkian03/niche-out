import { createServer, connect } from 'node:net';
import { once } from 'node:events';
/** Owned loopback boundary. Cutting it never changes the computer's network. */
export async function createRecoveryRelay(port) {
  let online = true;
  const sockets = new Set();
  const server = createServer(downstream => {
    if (!online) { downstream.destroy(); return; }
    const upstream = connect(port, '127.0.0.1');
    for (const socket of [downstream, upstream]) {
      sockets.add(socket);
      socket.on('error', () => { downstream.destroy(); upstream.destroy(); });
      socket.on('close', () => { sockets.delete(socket); downstream.destroy(); upstream.destroy(); });
    }
    downstream.pipe(upstream); upstream.pipe(downstream);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return { port: server.address().port,
    get activeSockets() { return sockets.size; },
    setOnline(value) { online = value; if (!online) for (const socket of sockets) socket.destroy(); },
    async close() { online = false; for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); },
  };
}
