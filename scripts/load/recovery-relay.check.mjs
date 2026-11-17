import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, connect } from 'node:net';
import { once } from 'node:events';
import { createRecoveryRelay } from './recovery-relay.mjs';

test('owned relay forwards, cuts both sides, rejects while offline and restores same listener', async () => {
  const upstream=createServer(socket=>socket.pipe(socket));upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
  const relay=await createRecoveryRelay(upstream.address().port);let client;
  const open=async()=>{const s=connect(relay.port,'127.0.0.1');s.on('error',()=>{});await once(s,'connect');return s;};
  try {
    client=await open();const data=once(client,'data');client.write('before');assert.equal((await data)[0].toString(),'before');assert.equal(relay.activeSockets,2);
    const closed=once(client,'close');relay.setOnline(false);await closed;
    client=await open();await once(client,'close');
    relay.setOnline(true);client=await open();const again=once(client,'data');client.write('after');assert.equal((await again)[0].toString(),'after');
  } finally {client?.destroy();await relay.close();await new Promise(resolve=>upstream.close(resolve));}
  assert.equal(relay.activeSockets,0);
});
