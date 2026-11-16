// A deterministic demonstration, not a server: no tunnel, browser or real waiting.
import assert from 'node:assert/strict';
import { compilePack, GameEngine, projectHost, projectPlayer } from '@rarity/game-core';
import { invitationForOrigin } from '@rarity/contracts';

let time = 0;
let sequence = 0;
let code = 123455;
const engine = new GameEngine({
  now: () => time,
  newId: kind => `${kind}-${++sequence}`,
  newGameCode: () => String(++code),
});
const pack = compilePack({
  schemaVersion: 1, title: 'Two-round core demonstration',
  tiers: [{ id: 'rare', name: 'Rare', points: 100 }, { id: 'common', name: 'Common', points: 10 }, { id: 'zero', name: 'Zero', points: 0 }],
  prompts: [
    { id: 'seasons', text: 'Name a season.', answers: [
      { text: 'Autumn', tierId: 'rare', aliases: ['Fall'] },
      { text: 'Summer', tierId: 'common' }, { text: 'Spring', tierId: 'zero' }, { text: 'Winter', tierId: 'rare' },
    ] },
    { id: 'colours', text: 'Name a colour.', answers: [
      { text: 'Amber', tierId: 'rare' }, { text: 'Blue', tierId: 'common' },
      { text: 'Magenta', tierId: 'zero' }, { text: 'Crimson', tierId: 'rare' },
    ] },
  ],
});
function success(result) { assert.equal(result.ok, true, JSON.stringify(result)); return result; }
const game = success(engine.commit(pack, engine.state().setupGeneration));
const players = ['Ada', 'Ben', 'Cy', 'Drew'].map(nickname => success(engine.admit({ gameId: game.gameId, identityId: nickname, nickname })));
const hosting = { status: 'ready', publicOrigin: 'https://demo.example.com' };
function host(requestedRoundId) {
  return projectHost(engine.state(), { hosting, serverNowMs: time, requestedRoundId,
    invitation: invitationForOrigin(hosting.publicOrigin, engine.state().gameCode) });
}
function advance() {
  const token = engine.timerToken();
  assert(token);
  time = token.deadlineMs;
  assert.equal(engine.wake(token), true);
  console.log(`At ${time} ms: ${engine.state().phase}`);
}
function submit(index, text) {
  const result = success(engine.submit({ gameId: game.gameId, roundId: engine.state().roundId,
    playerId: players[index].playerId, text, receivedAtMs: time }));
  console.log(`${players[index].nickname}: ${result.outcome}`);
  return result;
}
console.log('Lobby:', host().packSummary.title, '— 4 players');
success(engine.start(game.gameId, { hostingReady: true }));
advance();
assert.equal(submit(0, 'Not a season').outcome, 'REJECTED');
submit(0, 'Fall');
submit(1, 'AUTUMN');
submit(2, 'Spring');
assert.equal(engine.state().phase, 'Answering');
assert.equal(projectPlayer(engine.state(), { playerId: players[0].playerId, controlGeneration: 1, serverNowMs: time }).publishedTotal, 0);
advance(); // Drew misses. Accepted zero points are still distinct from a miss.
console.log('Round 1 groups:', host().results.groups);
console.log('Unused example:', host().results.unused);
assert.equal(host().results.groups[0].count, 2);
success(engine.remove(game.gameId, players[3].playerId));
advance();
advance();
submit(0, 'Amber');
submit(1, 'AMBER');
submit(2, 'Magenta'); // All remaining players answered: immediate Results.
assert.equal(engine.state().phase, 'Results');
console.log('Round 2 closed early after all 3 remaining players locked.');
advance();
const final = host();
assert.equal(final.phase, 'Finished');
assert.deepEqual(final.standings.map(row => row.rank), [1, 1, 3]);
assert.deepEqual(final.standings.map(row => row.publishedTotal), [200, 200, 0]);
console.table(final.standings.map(({ nickname, rank, publishedTotal }) => ({ nickname, rank, points: publishedTotal })));
console.log('Joint winners:', final.standings.filter(row => final.winnerIds.includes(row.playerId)).map(row => row.nickname).join(', '));
console.log('Ada’s private recap:', projectPlayer(engine.state(), { playerId: players[0].playerId, controlGeneration: 1, serverNowMs: time }).rounds.map(round => round.ownResult));
const next = success(engine.commit(pack, engine.state().setupGeneration));
assert.notEqual(next.gameId, game.gameId);
assert.equal(engine.state().players.length, 0);
assert.equal(engine.state().rounds.length, 0);
console.log('Replacement created a fresh lobby with no old members or results.');
console.log('PASS: deterministic core demonstration completed.');
