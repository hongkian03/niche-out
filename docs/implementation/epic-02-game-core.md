# Epic 2 Deterministic game rules

Tunnel baseline updated November 14, 2026. Current story status is maintained only in the [master backlog](../IMPLEMENTATION-PLAN.md#story-tracker); these cards define scope and evidence rather than claiming completion.

Implementation evidence: [Epic 2 core handoff](evidence/EPIC-2.md), including per-story verification and the server adapter boundary.

## Outcome

Implement and prove the game independently of browsers, sockets, OS clocks, and runtime packaging.

## Entry and required reading

Entry requires historical E1 contracts/harness and the revised E1-S15 session-hosting contract gate. Carry unresolved platform investigations forward only to the features that depend on them.

- [PRD game configuration and rules](../PRD.md#game-configuration)
- [Architecture engine and timing](../ARCHITECTURE.md#game-state-and-transitions)
- [Projection boundaries](../ARCHITECTURE.md#snapshot-and-information-boundaries)

## Story dependencies

All stories also inherit the previous epic's gate in the normal linear path. The explicit dependencies below describe the technical prerequisites and optional parallel opportunities.

| Story | Size | Direct prerequisites |
| --- | --- | --- |
| E2-S01 | 2 | E1-S02, E1-S03, E1-S06 |
| E2-S02 | 1 | E2-S01 |
| E2-S03 | 2 | E2-S02, E1-S03 |
| E2-S04 | 2 | E2-S03, E1-S06 |
| E2-S05 | 2 | E2-S04, E2-S01 |
| E2-S06 | 2 | E2-S05 |
| E2-S07 | 2 | E2-S06 |
| E2-S08 | 2 | E2-S07, E1-S05, E1-S12, E1-S15 |
| E2-S09 | 2 | E2-S08 |

## E2 S01 Compile canonical answer indexes

**Outcome:** A valid pack has efficient canonical matching and deterministic scoring references.

**Size:** 2. **Depends on:** E1-S02, E1-S03, E1-S06.

**Planned areas:** packages/game-core pack compiler and immutable private game definition.

### Work

- Compile per-prompt canonical/alias maps and validate tier/prompt ID uniqueness and cross-references.
- Reject conflicting normalized canonical answers or aliases; deduplicate equivalent aliases for the same answer.
- Calculate safe maximum total points and preserve answer/file order for deterministic unused-answer ties.

### Acceptance

1. Fall and Autumn can score/count as the same configured canonical answer.
2. A normalized variant cannot map to two answers, and a missing tier cannot compile.
3. Unsafe total maxima fail even when each individual tier value is a safe integer.

**Verification:** Compiler tests use normal, duplicate, collision, dangling-reference, zero-point, and total-overflow fixtures.

## E2 S02 Game identity and committed lobby state

**Outcome:** Only an explicit commit creates a fresh game and lobby.

**Size:** 1. **Depends on:** E2-S01.

**Planned areas:** Core game creation/replacement state and injected IDs.

### Work

- Create Setup/Lobby state with a private definition, unique game/phase IDs, revision, and setup generation.
- Replace a committed Lobby/Finished game atomically; discard old memberships/results only on successful commit.
- Keep validation/staging outside the engine commit so a preview or failed file cannot open a partial lobby.

### Acceptance

1. A new commit has a new game identity and empty roster/results.
2. Active timed phases reject replacement.
3. A failed commit leaves the old committed state unchanged.

**Verification:** Compare before/after state for valid, rejected, stale-generation, and active-phase commits with deterministic IDs.

## E2 S03 Admission and roster invariants

**Outcome:** One membership occupies one slot and identities cannot bypass roster limits.

**Size:** 2. **Depends on:** E2-S02, E1-S03.

**Planned areas:** Core roster, nicknames, capacity, and admission history.

### Work

- Admit unique fixed nicknames in Lobby and recover duplicate joins without another membership.
- Count disconnected admitted players toward 100 and distinct successful memberships toward the 1,000 history ceiling.
- Close new entry on Start and preserve valid existing-member resumes when full.

### Acceptance

1. The 101st concurrent newcomer fails without displacing someone.
2. Duplicate/retried/failed joins do not increment history, but a genuinely new membership does.
3. History exhaustion preserves existing players and requires a fresh lobby for new admission.

**Verification:** Atomic admission/uniqueness tests include competing joins, normalized names, full-roster recovery, and history-boundary behavior.

## E2 S04 Phase scheduler and deadline state

**Outcome:** A game advances in order without browser participation.

**Size:** 2. **Depends on:** E2-S03, E1-S06.

**Planned areas:** Pure phase transitions and injected clock/scheduler interfaces.

### Work

- Implement Lobby to Reading to Answering to Results to next Reading/Finished using global durations.
- Guard scheduled callbacks with instance/game/round/phase/deadline identity and finalize transitions once.
- Support the specified resume signal: close at most one expired phase and give the next its full duration; do not implement OS detection here.

### Acceptance

1. Default phase lengths are 3/25/10 seconds and custom valid millisecond durations work.
2. Stale callbacks and duplicate close requests cannot skip or double-complete a round.
3. Zero-player play waits for deadlines; suspension recovery does not consume unplayed rounds.

**Verification:** Fake-clock tests cover all transition boundaries, the last round, stale callbacks, and one-phase recovery with expired and unexpired phases.

## E2 S05 Answer acceptance and early completion

**Outcome:** The first valid in-time answer locks, and group readiness closes the round correctly.

**Size:** 2. **Depends on:** E2-S04, E2-S01.

**Planned areas:** Core submission rules and readiness state.

### Work

- Match through the compiled index, preserve submitted wording, and permit retries after rejection.
- Enforce the complete-handler receipt deadline strictly; retain lock state independently of client retries.
- Close early only when every eligible nonremoved player, including disconnected ones, has an accepted answer and the eligible count is positive.

### Acceptance

1. Receipt at the deadline is expired; immediately before it can qualify.
2. A valid zero-point answer locks and counts as accepted; an unlisted or unsubmitted answer does not.
3. A second answer cannot replace the first accepted answer, and the final acceptance closes once.

**Verification:** Use exact-clock tests for invalid retry, aliases, double submit, deadline equality, zero-point acceptance, all-answered, and empty eligibility.

## E2 S06 Round scoring and grouped results

**Outcome:** Results reflect manual tiers and canonical group counts with deterministic ties.

**Size:** 2. **Depends on:** E2-S05.

**Planned areas:** Core finalization, totals, ranks, canonical statistics, and unused example.

### Work

- Finalize accepted points and zero-point misses once, then accumulate totals.
- Compute shared competition ranks, canonical counts, and the highest-point unused answer with JSON-order tie handling.
- Order grouped answers by assigned points descending, with file order for equal points.

### Acceptance

1. Duplicates never change assigned points and aliases never split a canonical count.
2. Equal totals rank 1, 1, 3 and equal winners receive equal treatment.
3. All-used answers omit the unused panel; no accepted answers still allow the configured unused example.

**Verification:** Deterministic results tests cover misses versus accepted zero, repeated finalization, tied points/ranks, aliases, and unused-answer edge cases.

## E2 S07 Disconnect and removal effects

**Outcome:** Removal and disconnection have their different agreed effects without corrupting statistics.

**Size:** 2. **Depends on:** E2-S06.

**Planned areas:** Core connection status, removal exclusion, and eligibility recalculation.

### Work

- Disconnect without deleting membership, scores, locked answer, or eligibility.
- Remove by stable player ID, exclude from standings/eligibility, retain accepted submissions in statistics, and prohibit that identity resuming.
- Recheck early completion after removal without closing an empty roster early.

### Acceptance

1. Removing the final unanswered player may close an otherwise complete round once.
2. Removing an accepted player changes readiness numerator/denominator but not retained frequency counts.
3. A repeated removal has no additional effect and a new Lobby identity may reuse a freed nickname.

**Verification:** Interleave acceptance, finalization, disconnect, repeated removal, and zero-roster cases in fake-clock tests.

## E2 S08 Live host and player projections

**Outcome:** A permitted live view is complete and contains no hidden internal data.

**Size:** 2. **Depends on:** E2-S07, E1-S05, E1-S12, E1-S15.

**Planned areas:** Core Setup/Lobby/timed/Results serializers.

### Work

- Consume configured public-invitation and sanitized readiness contracts from E1-S12 as revised by E1-S15; keep tunnel availability outside scoring and phase rules.

- Produce explicit tagged role/phase views using published finalized totals rather than internal current scores.
- Include permitted prompt/timing/readiness/roster fields and private submitted wording only for the owning player.
- Populate full Results views with allowed grouped data and public standings but no answer-to-player mapping.

### Acceptance

1. A lock/reload during Answering cannot expose canonical tier metadata, current points, future prompts, or an answer bank.
2. The host receives no live submitted answers or player-private recap.
3. Full views validate against E1-S05 for normal, long-text, removed, and zero-point states.

4. Projection fixtures use public HTTPS links and preserve role secrecy.

**Verification:** Include the new public-origin fixtures.  Inspect serialized JSON and use negative leak assertions, not just frontend visibility tests.

## E2 S09 Final recaps and core integration gate

**Outcome:** Finished supports private player recaps and host aggregate review without historical browsing during play.

**Size:** 2. **Depends on:** E2-S08.

**Planned areas:** Finished serializers and full deterministic game scenario.

### Work

- Build own-player round recap, joint winners/full standings, and host aggregate summaries.
- Provide requested completed-round grouped detail only in Finished, never a complete accepted-answer bank.
- Run a multi-round scenario through commit/admit/start/retry/lock/reveal/removal/finish and verify replacement clears old state.

### Acceptance

1. Players cannot request another player's private answer history; the host has no invented personal score.
2. Earlier-round detail requests during timed play are rejected.
3. The full scenario has correct totals, ranks, retained removed statistics, and fresh-game invalidation.

**Verification:** Run the complete core suite and the multi-round integration scenario; record G2 evidence without claiming transport/UI coverage.

## Epic gate

All nine stories pass their targeted core scenarios, and a fake-clock multi-round game reaches Finished with correct scores and private projections. Core imports no browser, socket, filesystem, real timer, or network APIs.

Record the changed files, actual checks/results, outstanding external evidence, and next eligible story using the master handoff template. Do not start another epic merely because a story's code was written; satisfy the relevant gate and authorization scope.

