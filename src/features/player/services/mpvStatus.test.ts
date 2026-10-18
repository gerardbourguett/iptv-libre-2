import { describe, expect, it } from "vitest";
import {
  HEALTHY_PLAYBACK_RESET_MS,
  INITIAL_MPV_STATUS_STATE,
  MAX_RETRY_ATTEMPTS,
  RETRY_BACKOFF_MS,
  reduceMpvStatus,
  type MpvStatusAction,
  type MpvStatusEffect,
  type MpvStatusResult,
  type MpvStatusState,
} from "./mpvStatus";

// --- helpers ---------------------------------------------------------------

function step(state: MpvStatusState, action: MpvStatusAction): MpvStatusResult {
  return reduceMpvStatus(state, action);
}

/** Applies actions in order and returns the last result. */
function run(state: MpvStatusState, ...actions: MpvStatusAction[]): MpvStatusResult {
  let result: MpvStatusResult = { state, effects: [] };
  for (const action of actions) result = reduceMpvStatus(result.state, action);
  return result;
}

/** Freshly loaded: connecting, start-file not seen yet. */
function loaded(): MpvStatusState {
  return step(INITIAL_MPV_STATUS_STATE, { type: "load" }).state;
}

/** Connecting with start-file seen for the current generation. */
function started(entryId?: number): MpvStatusState {
  return step(loaded(), { type: "start-file", entryId }).state;
}

/** Playing: start-file + playback-restart. */
function live(entryId?: number): MpvStatusState {
  return step(started(entryId), { type: "playback-restart" }).state;
}

const END_ERROR: MpvStatusAction = { type: "end-file", reason: "error" };

/** Fails the current stream (end-file error) after making it "started". */
function failOnce(state: MpvStatusState): MpvStatusResult {
  return run({ ...state, startSeen: true }, END_ERROR);
}

function unchanged(state: MpvStatusState, action: MpvStatusAction) {
  const result = step(state, action);
  expect(result.state).toBe(state);
  expect(result.effects).toEqual([]);
}

// --- tests -----------------------------------------------------------------

describe("reduceMpvStatus", () => {
  describe("initial state", () => {
    it("starts idle with no attempts and generation 0", () => {
      expect(INITIAL_MPV_STATUS_STATE).toEqual({
        status: "idle",
        attempts: 0,
        generation: 0,
        startSeen: false,
        entryId: null,
      });
    });
  });

  describe("load and stop", () => {
    it("load moves to connecting, bumps the generation and emits the load effect", () => {
      const { state, effects } = step(INITIAL_MPV_STATUS_STATE, { type: "load" });
      expect(state).toEqual({ status: "connecting", attempts: 0, generation: 1, startSeen: false, entryId: null });
      expect(effects).toEqual([{ kind: "clear-retry-timer" }, { kind: "clear-healthy-timer" }, { kind: "load" }]);
    });

    it("a new load resets attempts, start-file and entry id", () => {
      const dirty: MpvStatusState = { status: "live", attempts: 2, generation: 5, startSeen: true, entryId: 9 };
      const { state } = step(dirty, { type: "load" });
      expect(state).toEqual({ status: "connecting", attempts: 0, generation: 6, startSeen: false, entryId: null });
    });

    it("stop returns to idle, bumps the generation and emits the stop effect", () => {
      const { state, effects } = step(live(), { type: "stop" });
      expect(state).toEqual({ ...INITIAL_MPV_STATUS_STATE, generation: 2 });
      expect(effects).toEqual([{ kind: "clear-retry-timer" }, { kind: "clear-healthy-timer" }, { kind: "stop" }]);
    });
  });

  describe("start-file gating", () => {
    it("start-file records the entry id and unlocks later events", () => {
      const { state, effects } = step(loaded(), { type: "start-file", entryId: 7 });
      expect(state).toMatchObject({ status: "connecting", startSeen: true, entryId: 7 });
      expect(effects).toEqual([]);
    });

    it("start-file without an entry id stores null", () => {
      expect(started().entryId).toBeNull();
    });

    it("start-file is ignored when not connecting", () => {
      unchanged(INITIAL_MPV_STATUS_STATE, { type: "start-file", entryId: 1 });
      unchanged(live(), { type: "start-file", entryId: 1 });
    });

    it.each<[string, MpvStatusAction]>([
      ["end-file error", { type: "end-file", reason: "error" }],
      ["end-file eof", { type: "end-file", reason: "eof" }],
      ["core-idle=false", { type: "core-idle", value: false }],
      ["playback-restart", { type: "playback-restart" }],
    ])("%s before start-file is ignored", (_name, action) => {
      unchanged(loaded(), action);
    });

    it("paused-for-cache before start-file is ignored", () => {
      unchanged(loaded(), { type: "paused-for-cache", value: true });
    });
  });

  describe("going live", () => {
    it.each<[string, MpvStatusAction]>([
      ["playback-restart", { type: "playback-restart" }],
      ["core-idle=false", { type: "core-idle", value: false }],
    ])("%s after start-file goes live and arms the healthy timer", (_name, action) => {
      const before = started();
      const { state, effects } = step(before, action);
      expect(state.status).toBe("live");
      expect(effects).toEqual([{ kind: "start-healthy-timer", generation: before.generation }]);
    });

    it("core-idle=true never changes anything", () => {
      unchanged(started(), { type: "core-idle", value: true });
      unchanged(live(), { type: "core-idle", value: true });
    });

    it("an event while already live does not re-arm the timer", () => {
      unchanged(live(), { type: "playback-restart" });
      unchanged(live(), { type: "core-idle", value: false });
    });

    it("playback-restart is ignored while idle", () => {
      unchanged(INITIAL_MPV_STATUS_STATE, { type: "playback-restart" });
    });
  });

  describe("buffering (paused-for-cache)", () => {
    it("moves live back to connecting and cancels the healthy timer", () => {
      const { state, effects } = step(live(), { type: "paused-for-cache", value: true });
      expect(state.status).toBe("connecting");
      expect(effects).toEqual([{ kind: "clear-healthy-timer" }]);
    });

    it("paused-for-cache=false changes nothing", () => {
      unchanged(live(), { type: "paused-for-cache", value: false });
    });

    it("is ignored when not live", () => {
      unchanged(started(), { type: "paused-for-cache", value: true });
      unchanged(INITIAL_MPV_STATUS_STATE, { type: "paused-for-cache", value: true });
    });

    it("recovers to live afterwards via playback-restart", () => {
      const result = run(live(), { type: "paused-for-cache", value: true }, { type: "playback-restart" });
      expect(result.state.status).toBe("live");
      expect(result.effects).toEqual([{ kind: "start-healthy-timer", generation: result.state.generation }]);
    });
  });

  describe("end-file", () => {
    it.each(["stop", "quit", "redirect"])("reason '%s' is ignored", (reason) => {
      unchanged(live(), { type: "end-file", reason });
      unchanged(started(), { type: "end-file", reason });
    });

    it("is ignored while idle", () => {
      unchanged({ ...INITIAL_MPV_STATUS_STATE, startSeen: true }, END_ERROR);
    });

    it("is ignored once offline", () => {
      const offline: MpvStatusState = { ...INITIAL_MPV_STATUS_STATE, status: "offline", startSeen: true };
      unchanged(offline, END_ERROR);
    });

    it.each(["error", "eof"])("reason '%s' is a failure that schedules a 1s retry", (reason) => {
      const before = live();
      const { state, effects } = step(before, { type: "end-file", reason });
      expect(state).toMatchObject({ status: "connecting", attempts: 1, startSeen: false, entryId: null });
      expect(effects).toEqual([
        { kind: "clear-healthy-timer" },
        { kind: "schedule-retry", delayMs: 1_000, generation: before.generation },
      ]);
    });

    it("a failure while still connecting (after start-file) also retries", () => {
      expect(step(started(), END_ERROR).state).toMatchObject({ status: "connecting", attempts: 1 });
    });
  });

  describe("stale events", () => {
    it("ignores an end-file whose entry id differs from the current one", () => {
      unchanged(live(3), { type: "end-file", reason: "error", entryId: 2 });
    });

    it("accepts an end-file whose entry id matches", () => {
      expect(step(live(3), { type: "end-file", reason: "error", entryId: 3 }).state.attempts).toBe(1);
    });

    it("falls back to the generation check when the end-file has no entry id", () => {
      expect(step(live(3), END_ERROR).state.attempts).toBe(1);
    });

    it("falls back to the generation check when mpv never reported an entry id", () => {
      expect(step(live(), { type: "end-file", reason: "error", entryId: 99 }).state.attempts).toBe(1);
    });

    it("end-file from the previous file is ignored after a newer load", () => {
      // Old file ends after the new load but before the new start-file.
      const result = run(live(1), { type: "load" }, { type: "end-file", reason: "error", entryId: 1 });
      expect(result.state).toMatchObject({ status: "connecting", attempts: 0, startSeen: false });
      expect(result.effects).toEqual([]);
    });

    it("end-file from the previous file is ignored after start-file of the new one", () => {
      const result = run(
        live(1),
        { type: "load" },
        { type: "start-file", entryId: 2 },
        { type: "end-file", reason: "eof", entryId: 1 },
      );
      expect(result.state).toMatchObject({ status: "connecting", attempts: 0, startSeen: true, entryId: 2 });
    });

    it("a stale retry-fire does nothing after a newer load", () => {
      const failed = failOnce(started()); // schedules a retry for generation 1
      const staleGeneration = failed.state.generation;
      const afterLoad = step(failed.state, { type: "load" }).state;
      unchanged(afterLoad, { type: "retry-fire", generation: staleGeneration });
    });

    it("a stale healthy-timeout does nothing after a newer load", () => {
      const before = live();
      const afterReload = run({ ...before, attempts: 2 }, { type: "load" }, { type: "start-file" }, { type: "playback-restart" });
      const stale = { type: "healthy-timeout", generation: before.generation } as const;
      expect(step(afterReload.state, stale).state).toBe(afterReload.state);
    });

    it("a stale load-failed does nothing", () => {
      const state = loaded();
      unchanged(state, { type: "load-failed", generation: state.generation - 1 });
    });
  });

  describe("retry and backoff", () => {
    it("uses 1s, 2s and 4s backoff and stays connecting in between", () => {
      expect(HEALTHY_PLAYBACK_RESET_MS).toBe(30_000);
      expect(RETRY_BACKOFF_MS).toEqual([1_000, 2_000, 4_000]);

      let state = started();
      const delays: number[] = [];
      for (let i = 0; i < MAX_RETRY_ATTEMPTS; i++) {
        const result = step(state, END_ERROR);
        expect(result.state.status).toBe("connecting");
        const retry = result.effects.find((e): e is Extract<MpvStatusEffect, { kind: "schedule-retry" }> => e.kind === "schedule-retry");
        expect(retry).toBeDefined();
        delays.push(retry!.delayMs);
        // Fire the timer, then let the next attempt start.
        state = run(result.state, { type: "retry-fire", generation: retry!.generation }, { type: "start-file" }).state;
      }
      expect(delays).toEqual([1_000, 2_000, 4_000]);
    });

    it("retry-fire bumps the generation, emits load and clears start-file", () => {
      const failed = failOnce(started());
      const { state, effects } = step(failed.state, { type: "retry-fire", generation: failed.state.generation });
      expect(state).toMatchObject({ status: "connecting", attempts: 1, startSeen: false, entryId: null });
      expect(state.generation).toBe(failed.state.generation + 1);
      expect(effects).toEqual([{ kind: "load" }]);
    });

    it("the 4th failure goes offline and stops playback", () => {
      let state = started();
      for (let i = 0; i < MAX_RETRY_ATTEMPTS; i++) {
        const failed = step(state, END_ERROR);
        state = run(failed.state, { type: "retry-fire", generation: failed.state.generation }, { type: "start-file" }).state;
      }
      const { state: final, effects } = step(state, END_ERROR);
      expect(final).toMatchObject({ status: "offline", attempts: MAX_RETRY_ATTEMPTS, startSeen: false, entryId: null });
      expect(effects).toEqual([{ kind: "clear-healthy-timer" }, { kind: "clear-retry-timer" }, { kind: "stop" }]);
    });

    it("retry-fire is ignored when not connecting", () => {
      const state = live();
      unchanged(state, { type: "retry-fire", generation: state.generation });
    });

    it("an offline stream ignores further events", () => {
      const offline: MpvStatusState = { status: "offline", attempts: 3, generation: 4, startSeen: false, entryId: null };
      unchanged(offline, { type: "retry-fire", generation: 4 });
      unchanged(offline, { type: "playback-restart" });
      unchanged(offline, { type: "core-idle", value: false });
      unchanged(offline, END_ERROR);
    });

    it("a new load after offline starts a fresh budget", () => {
      const offline: MpvStatusState = { status: "offline", attempts: 3, generation: 4, startSeen: false, entryId: null };
      const { state } = step(offline, { type: "load" });
      expect(state).toMatchObject({ status: "connecting", attempts: 0, generation: 5 });
      expect(step({ ...state, startSeen: true }, END_ERROR).effects).toContainEqual({
        kind: "schedule-retry",
        delayMs: 1_000,
        generation: 5,
      });
    });
  });

  describe("healthy timer", () => {
    it("refills the retry budget when still live in the same generation", () => {
      const before = { ...live(), attempts: 2 };
      const { state, effects } = step(before, { type: "healthy-timeout", generation: before.generation });
      expect(state.attempts).toBe(0);
      expect(state.status).toBe("live");
      expect(effects).toEqual([]);
    });

    it("after a refill the next failure starts again at 1s", () => {
      const before = { ...live(), attempts: 2 };
      const refilled = step(before, { type: "healthy-timeout", generation: before.generation }).state;
      expect(step(refilled, END_ERROR).effects).toContainEqual({
        kind: "schedule-retry",
        delayMs: 1_000,
        generation: refilled.generation,
      });
    });

    it("is ignored when the stream is no longer live (buffering)", () => {
      const buffering = step({ ...live(), attempts: 2 }, { type: "paused-for-cache", value: true }).state;
      unchanged(buffering, { type: "healthy-timeout", generation: buffering.generation });
    });
  });

  describe("load-failed", () => {
    it("behaves like an error end-file while connecting", () => {
      const before = loaded(); // note: start-file has NOT been seen
      const { state, effects } = step(before, { type: "load-failed", generation: before.generation });
      expect(state).toMatchObject({ status: "connecting", attempts: 1 });
      expect(effects).toEqual([
        { kind: "clear-healthy-timer" },
        { kind: "schedule-retry", delayMs: 1_000, generation: before.generation },
      ]);
    });

    it("goes offline once the budget is exhausted", () => {
      const before = { ...loaded(), attempts: MAX_RETRY_ATTEMPTS };
      const { state, effects } = step(before, { type: "load-failed", generation: before.generation });
      expect(state.status).toBe("offline");
      expect(effects).toContainEqual({ kind: "stop" });
    });

    it("is ignored when not connecting", () => {
      const state = live();
      unchanged(state, { type: "load-failed", generation: state.generation });
    });
  });

  describe("user-facing sanity", () => {
    it("full happy path: load -> start -> live -> buffering -> live", () => {
      const statuses: string[] = [];
      let state = INITIAL_MPV_STATUS_STATE;
      const actions: MpvStatusAction[] = [
        { type: "load" },
        { type: "start-file", entryId: 1 },
        { type: "playback-restart" },
        { type: "paused-for-cache", value: true },
        { type: "core-idle", value: false },
      ];
      for (const action of actions) {
        state = step(state, action).state;
        statuses.push(state.status);
      }
      expect(statuses).toEqual(["connecting", "connecting", "live", "connecting", "live"]);
    });
  });
});
