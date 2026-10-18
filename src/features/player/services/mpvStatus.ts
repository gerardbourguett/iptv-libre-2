import type { ChannelStatus } from "../../channels/components/ChannelCard";

// A permanently broken stream (dead, geoblocked, expired) would otherwise
// retry forever and never settle on "offline".
export const MAX_RETRY_ATTEMPTS = 3;

// A stream that stays healthy this long gets its retry budget back, so a few
// isolated blips spread over a long session do not add up to a permanent
// failure. Three failures in quick succession never leave enough gap for the
// timer to fire, so a genuinely dead stream still gives up.
export const HEALTHY_PLAYBACK_RESET_MS = 30_000;

// Delay before retry number 1, 2 and 3.
export const RETRY_BACKOFF_MS = [1_000, 2_000, 4_000] as const;

export type MpvStatusState = {
  status: ChannelStatus;
  attempts: number;
  // Incremented on every load/stop/reload so timers and events from an
  // earlier request can be recognised as stale.
  generation: number;
  // True once mpv reported `start-file` for the current generation. Until
  // then end-file / core-idle events may still belong to the previous file.
  startSeen: boolean;
  // playlist_entry_id of the current file, when mpv reports it.
  entryId: number | null;
};

export type MpvStatusAction =
  | { type: "load" }
  | { type: "stop" }
  | { type: "load-failed"; generation: number }
  | { type: "retry-fire"; generation: number }
  | { type: "healthy-timeout"; generation: number }
  | { type: "start-file"; entryId?: number }
  | { type: "playback-restart" }
  | { type: "core-idle"; value: boolean }
  | { type: "paused-for-cache"; value: boolean }
  | { type: "end-file"; reason: string; entryId?: number };

export type MpvStatusEffect =
  | { kind: "load" }
  | { kind: "stop" }
  | { kind: "schedule-retry"; delayMs: number; generation: number }
  | { kind: "start-healthy-timer"; generation: number }
  | { kind: "clear-retry-timer" }
  | { kind: "clear-healthy-timer" };

export type MpvStatusResult = {
  state: MpvStatusState;
  effects: MpvStatusEffect[];
};

export const INITIAL_MPV_STATUS_STATE: MpvStatusState = {
  status: "idle",
  attempts: 0,
  generation: 0,
  startSeen: false,
  entryId: null,
};

const NO_EFFECTS: MpvStatusEffect[] = [];

export function reduceMpvStatus(state: MpvStatusState, action: MpvStatusAction): MpvStatusResult {
  switch (action.type) {
    case "load":
      return {
        state: {
          status: "connecting",
          attempts: 0,
          generation: state.generation + 1,
          startSeen: false,
          entryId: null,
        },
        effects: [{ kind: "clear-retry-timer" }, { kind: "clear-healthy-timer" }, { kind: "load" }],
      };

    case "stop":
      return {
        state: { ...INITIAL_MPV_STATUS_STATE, generation: state.generation + 1 },
        effects: [{ kind: "clear-retry-timer" }, { kind: "clear-healthy-timer" }, { kind: "stop" }],
      };

    case "load-failed":
      // The loadfile command itself was rejected: same budget as a failed stream.
      if (action.generation !== state.generation || state.status !== "connecting") {
        return { state, effects: NO_EFFECTS };
      }
      return failCurrent(state);

    case "retry-fire":
      if (action.generation !== state.generation || state.status !== "connecting") {
        return { state, effects: NO_EFFECTS };
      }
      return {
        state: { ...state, generation: state.generation + 1, startSeen: false, entryId: null },
        effects: [{ kind: "load" }],
      };

    case "healthy-timeout":
      if (action.generation !== state.generation || state.status !== "live") {
        return { state, effects: NO_EFFECTS };
      }
      return { state: { ...state, attempts: 0 }, effects: NO_EFFECTS };

    case "start-file":
      if (state.status !== "connecting") return { state, effects: NO_EFFECTS };
      return { state: { ...state, startSeen: true, entryId: action.entryId ?? null }, effects: NO_EFFECTS };

    case "paused-for-cache":
      if (!state.startSeen || state.status !== "live" || !action.value) {
        return { state, effects: NO_EFFECTS };
      }
      return {
        state: { ...state, status: "connecting" },
        effects: [{ kind: "clear-healthy-timer" }],
      };

    case "core-idle":
      if (action.value) return { state, effects: NO_EFFECTS };
      return markLive(state);

    case "playback-restart":
      return markLive(state);

    case "end-file": {
      // Our own stop/load and redirects are not failures. For a live stream
      // both "error" and "eof" mean the stream is gone.
      if (action.reason !== "error" && action.reason !== "eof") return { state, effects: NO_EFFECTS };
      if (state.status === "idle" || state.status === "offline" || !state.startSeen) {
        return { state, effects: NO_EFFECTS };
      }
      if (action.entryId !== undefined && state.entryId !== null && action.entryId !== state.entryId) {
        return { state, effects: NO_EFFECTS };
      }

      return failCurrent(state);
    }
  }
}

function failCurrent(state: MpvStatusState): MpvStatusResult {
  if (state.attempts < MAX_RETRY_ATTEMPTS) {
    const delayMs = RETRY_BACKOFF_MS[state.attempts] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1];
    return {
      state: { ...state, status: "connecting", attempts: state.attempts + 1, startSeen: false, entryId: null },
      effects: [{ kind: "clear-healthy-timer" }, { kind: "schedule-retry", delayMs, generation: state.generation }],
    };
  }

  return {
    state: { ...state, status: "offline", startSeen: false, entryId: null },
    effects: [{ kind: "clear-healthy-timer" }, { kind: "clear-retry-timer" }, { kind: "stop" }],
  };
}

function markLive(state: MpvStatusState): MpvStatusResult {
  if (!state.startSeen || state.status !== "connecting") return { state, effects: NO_EFFECTS };
  return {
    state: { ...state, status: "live" },
    effects: [{ kind: "start-healthy-timer", generation: state.generation }],
  };
}
