import { describe, expect, it } from "vitest";
import { completeView, serverEvents } from "../../packages/contracts/src/views.js";
import { allViews, lobby, setup } from "./view-fixtures.js";

describe("complete role-filtered views", () => {
  it.each(allViews.map(view => [view.phase + " " + view.viewRole, view] as const))("permits %s", (_, view) => {
    expect(serverEvents["state.snapshot"].parse(view)).toEqual(view);
    expect(serverEvents["state.changed"].parse(view)).toEqual(view);
  });
  it("rejects partial changes, mismatched nullability, wrong role and extra properties", () => {
    for (const bad of [
      { revision: 8 }, { ...setup, roundIndex: 0 }, { ...setup, viewRole: "player" },
      { ...lobby, phaseDeadlineMs: 0 }, { ...lobby, futurePrompt: "next" },
      { ...lobby, packSummary: { ...lobby.packSummary, answers: [] } },
      { ...lobby, invitation: { ...lobby.invitation, qrPayload: "http://192.168.1.50/host#secret" } },
      { ...lobby, invitation: { ...lobby.invitation, joinUrl: "broken" } },
    ]) expect(completeView.safeParse(bad).success).toBe(false);
  });
  it("permits a 4,096-code-point prompt and bounds the zero-based round index", () => {
    const live = allViews.find(v => v.phase === "Reading")!;
    expect(completeView.safeParse({ ...live, prompt: "🐟".repeat(4096) }).success).toBe(true);
    for (const bad of [{ prompt: "🐟".repeat(4097) }, { roundIndex: -1 }, { roundIndex: 1 }, { phaseDeadlineMs: null }])
      expect(completeView.safeParse({ ...live, ...bad }).success).toBe(false);
  });
  it("rejects pre-reveal mappings, current scoring, roster leaks and past-round browsing", () => {
    for (const view of allViews) {
      if (view.phase !== "Reading" && view.phase !== "Answering") continue;
      for (const extra of [
        { futurePrompt: "next" }, { currentRoundPoints: 100 }, { answers: [] },
        { requestedDetail: null }, { ownResult: { tierName: "Secret" } }, { packSummary: lobby.packSummary },
        { publishedStandings: view.publishedStandings.map(s => ({ ...s, roundPoints: 100 })) },
        { readiness: { accepted: 2, eligible: 1 } },
      ]) expect(completeView.safeParse({ ...view, ...extra }).success).toBe(false);
      if (view.viewRole === "player") {
        expect(completeView.safeParse({ ...view, ownAnswer: { ...view.ownAnswer, canonicalText: "Secret" } }).success).toBe(false);
        expect(completeView.safeParse({ ...view, roster: lobby.roster }).success).toBe(false);
      } else expect(completeView.safeParse({ ...view, roster: [{ ...lobby.roster[0], submittedText: "secret" }] }).success).toBe(false);
    }
  });
  it("separates a miss from an accepted zero and keeps revealed answer groups unattributed", () => {
    for (const view of allViews) {
      if (view.phase !== "Results") continue;
      const groups = view.results.groups.map(group => ({ ...group, players: ["p-1"] }));
      expect(completeView.safeParse({ ...view, results: { ...view.results, groups } }).success).toBe(false);
      if (view.viewRole === "player") {
        expect(completeView.safeParse({ ...view, ownResult: { outcome: "miss", points: 0 } }).success).toBe(true);
        expect(completeView.safeParse({ ...view, ownResult: { outcome: "miss", points: 2 } }).success).toBe(false);
      } else expect(completeView.safeParse({ ...view, ownResult: { outcome: "miss", points: 0 } }).success).toBe(false);
    }
  });
  it("limits expanded round tables to one completed round and preserves ties and empty standings", () => {
    for (const v of allViews) {
      if (v.phase !== "Finished") continue;
      expect(completeView.safeParse({ ...v, requestedDetail: null }).success).toBe(true);
      expect(completeView.safeParse({ ...v, standings: [], winnerIds: [] }).success).toBe(true);
      for (const change of [{ requestedDetail: { ...v.requestedDetail, roundId: "unplayed" } },
        { winnerIds: ["p-1"] }, { rounds: [] }, { rounds: [{ ...v.rounds[0], roundIndex: 1 }] }])
        expect(completeView.safeParse({ ...v, ...change }).success).toBe(false);
      if (v.viewRole === "host") expect(completeView.safeParse({
        ...v, rounds: [{ ...v.rounds[0], ownResult: { outcome: "miss", points: 0 } }],
      }).success).toBe(false);
    }
  });
});
