import {
  command,
  init,
  listenEvents,
  observeProperties,
  setProperty,
  setVideoMarginRatio,
  type MpvConfig,
  type MpvObservableProperty,
  type VideoMarginRatio,
} from "tauri-plugin-libmpv-api";
import { DESKTOP_USER_AGENT } from "../../../shared/network/desktopUserAgent";

// App-lifetime libmpv service. The mpv instance is created lazily on the
// first acquire() and is never destroyed from React: the plugin tears it down
// itself when the window closes. Destroying it per mount races init against
// destroy under StrictMode and fast channel switches ("instance for window
// label main not found"). Unmounting a player therefore only issues `stop`.
//
// Every command goes through enqueue(), a promise chain that waits for init,
// so calls are strictly ordered and never run before the instance exists.

export type MpvSignal =
  | { type: "start-file"; entryId?: number }
  | { type: "end-file"; reason: string; entryId?: number }
  | { type: "playback-restart" }
  | { type: "core-idle"; value: boolean }
  | { type: "paused-for-cache"; value: boolean };

type MpvSignalListener = (signal: MpvSignal) => void;

// User-facing playback controls, mirrored from mpv's own properties. Kept apart
// from MpvSignal so the status reducer never sees them: a user pause must not
// change the channel status.
export type MpvControls = { paused: boolean; muted: boolean; volume: number };

const OBSERVED_PROPERTIES = [
  ["core-idle", "flag"],
  ["paused-for-cache", "flag"],
  ["pause", "flag"],
  ["mute", "flag"],
  ["volume", "double"],
] as const satisfies MpvObservableProperty[];

// The ffmpeg HLS demuxer does not reliably inherit these from the stream
// options, so they are set on both.
const LAVF_RECONNECT =
  "reconnect=1,reconnect_streamed=1,reconnect_on_network_error=1,reconnect_delay_max=5";

const MPV_CONFIG: MpvConfig = {
  initialOptions: {
    vo: "gpu",
    hwdec: "auto-safe",
    "force-window": "yes",
    idle: "yes",
    "keep-open": "no",
    "user-agent": DESKTOP_USER_AGENT,
    "stream-lavf-o": LAVF_RECONNECT,
    "demuxer-lavf-o": LAVF_RECONNECT,
    "network-timeout": 15,
    // Input isolation: the HTML UI owns keys, cursor and on-screen controls.
    osc: "no",
    "osd-level": 0,
    "input-default-bindings": "no",
    "input-vo-keyboard": "no",
    "input-cursor": "no",
    "cursor-autohide": "no",
  },
  observedProperties: OBSERVED_PROPERTIES,
};

type ServiceState = {
  initPromise: Promise<void> | null;
  initFailed: boolean;
  ready: Promise<void> | null;
  queue: Promise<void>;
  listeners: Set<MpvSignalListener>;
  controls: MpvControls;
  controlListeners: Set<() => void>;
  unlisten: Array<() => void>;
};

// Kept in import.meta.hot.data so a hot reload re-attaches to the surviving
// mpv instance instead of trying to init a second one.
const state: ServiceState = (import.meta.hot?.data.mpvService as ServiceState | undefined) ?? {
  initPromise: null,
  initFailed: false,
  ready: null,
  queue: Promise.resolve(),
  listeners: new Set(),
  controls: { paused: false, muted: false, volume: 100 },
  controlListeners: new Set(),
  unlisten: [],
};

if (import.meta.hot) {
  import.meta.hot.data.mpvService = state;
  import.meta.hot.dispose(() => {
    detachListeners();
    state.listeners.clear();
    state.controlListeners.clear();
    state.ready = null;
    const queued = state.queue;
    state.queue = queued.then(() => command("stop")).then(
      () => undefined,
      () => undefined,
    );
  });
}

function emit(signal: MpvSignal) {
  state.listeners.forEach((listener) => listener(signal));
}

function updateControls(patch: Partial<MpvControls>) {
  const prev = state.controls;
  const next = { ...prev, ...patch };
  if (next.paused === prev.paused && next.muted === prev.muted && next.volume === prev.volume) return;
  state.controls = next;
  state.controlListeners.forEach((listener) => listener());
}

function detachListeners() {
  state.unlisten.forEach((fn) => fn());
  state.unlisten = [];
}

async function attachListeners(): Promise<void> {
  try {
    await registerListeners();
  } catch (error) {
    // Roll back a half-attached set so a retry does not deliver events twice.
    detachListeners();
    throw error;
  }
}

async function registerListeners(): Promise<void> {
  state.unlisten.push(
    await listenEvents((event) => {
      switch (event.event) {
        case "start-file":
          emit({ type: "start-file", entryId: event.playlist_entry_id });
          break;
        case "end-file":
          emit({ type: "end-file", reason: event.reason, entryId: event.playlist_entry_id });
          break;
        case "playback-restart":
          emit({ type: "playback-restart" });
          break;
        default:
          break;
      }
    }),
  );
  state.unlisten.push(
    await observeProperties(OBSERVED_PROPERTIES, (event) => {
      switch (event.name) {
        case "core-idle":
        case "paused-for-cache":
          if (typeof event.data === "boolean") emit({ type: event.name, value: event.data });
          break;
        case "pause":
          if (typeof event.data === "boolean") updateControls({ paused: event.data });
          break;
        case "mute":
          if (typeof event.data === "boolean") updateControls({ muted: event.data });
          break;
        case "volume":
          if (typeof event.data === "number") updateControls({ volume: event.data });
          break;
      }
    }),
  );
}

function ensureReady(): Promise<void> {
  if (!state.ready) {
    const ready = (async () => {
      if (!state.initPromise) state.initPromise = init(MPV_CONFIG).then(() => undefined);
      try {
        await state.initPromise;
      } catch (error) {
        state.initPromise = null;
        throw error;
      }
      await attachListeners();
    })();
    state.ready = ready;
    ready.catch(() => {
      state.initFailed = true;
      if (state.ready === ready) state.ready = null;
    });
  }
  return state.ready;
}

// Resolves true when the task ran successfully, false when it failed or was skipped.
function enqueue(task: () => Promise<unknown>): Promise<boolean> {
  if (state.initFailed) return Promise.resolve(false);
  const run = state.queue
    .then(() => ensureReady())
    .then(task)
    .then(
      () => true,
      () => false,
    );
  state.queue = run.then(() => undefined);
  return run;
}

export const mpvPlayer = {
  /** Resolves once mpv is initialised and listening; rejects if init failed. */
  acquire(): Promise<void> {
    state.initFailed = false;
    return ensureReady();
  },

  subscribe(listener: MpvSignalListener): () => void {
    state.listeners.add(listener);
    return () => {
      state.listeners.delete(listener);
    };
  },

  /** Resolves false when the loadfile command was rejected. */
  load(url: string): Promise<boolean> {
    // `pause` outlives a file: clear it so a new channel never starts frozen.
    return enqueue(async () => {
      await setProperty("pause", false);
      await command("loadfile", [url, "replace"]);
    });
  },

  // External-store API for the controls UI (useSyncExternalStore).
  subscribeControls(listener: () => void): () => void {
    state.controlListeners.add(listener);
    return () => {
      state.controlListeners.delete(listener);
    };
  },

  getControls(): MpvControls {
    return state.controls;
  },

  setPaused(paused: boolean): Promise<boolean> {
    return enqueue(() => setProperty("pause", paused));
  },

  setMuted(muted: boolean): Promise<boolean> {
    return enqueue(() => setProperty("mute", muted));
  },

  setVolume(volume: number): Promise<boolean> {
    return enqueue(() => setProperty("volume", Math.min(100, Math.max(0, Math.round(volume)))));
  },

  stop(): Promise<boolean> {
    // Nothing to stop before the first acquire(); do not initialise libmpv
    // (and its window surface) just to issue a stop.
    if (!state.initPromise && !state.ready) return Promise.resolve(true);
    return enqueue(() => command("stop"));
  },

  setRegion(ratio: Required<VideoMarginRatio>): Promise<boolean> {
    return enqueue(() => setVideoMarginRatio(ratio));
  },
};
