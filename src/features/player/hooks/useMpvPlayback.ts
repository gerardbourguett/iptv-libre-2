import { useEffect, useRef, useState, type RefObject } from "react";
import type { ChannelStatus } from "../../channels/components/ChannelCard";
import { computeRegionRatio } from "./useVideoRegionSync";
import { mpvPlayer, type MpvSignal } from "../services/mpvPlayer";
import {
  HEALTHY_PLAYBACK_RESET_MS,
  INITIAL_MPV_STATUS_STATE,
  reduceMpvStatus,
  type MpvStatusAction,
  type MpvStatusEffect,
  type MpvStatusState,
} from "../services/mpvStatus";

type EngineState = "pending" | "ready" | "failed";

function signalToAction(signal: MpvSignal): MpvStatusAction {
  return signal;
}

// Drives one channel URL through mpv: stop old, load new, map mpv events to a
// ChannelStatus (with retries) and expose whether the transparent video
// surface may be shown.
export function useMpvPlayback(
  url: string | undefined,
  onStatusChange?: (status: ChannelStatus) => void,
  regionTarget?: RefObject<HTMLElement | null>,
) {
  const [status, setStatus] = useState<ChannelStatus>("idle");
  const [engine, setEngine] = useState<EngineState>("pending");

  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  });

  useEffect(() => {
    const report = (next: ChannelStatus) => {
      setStatus(next);
      onStatusChangeRef.current?.(next);
    };

    if (!url) {
      setEngine("pending");
      report("idle");
      void mpvPlayer.stop();
      return undefined;
    }

    let disposed = false;
    let machine: MpvStatusState = INITIAL_MPV_STATUS_STATE;
    let retryTimer: number | undefined;
    let healthyTimer: number | undefined;
    let unsubscribe: (() => void) | undefined;

    const dispatch = (action: MpvStatusAction) => {
      if (disposed) return;
      const result = reduceMpvStatus(machine, action);
      const previousStatus = machine.status;
      machine = result.state;
      result.effects.forEach(run);
      if (machine.status !== previousStatus) report(machine.status);
    };

    const run = (effect: MpvStatusEffect) => {
      switch (effect.kind) {
        case "load":
          {
            const generation = machine.generation;
            void mpvPlayer.load(url).then((ok) => {
              if (!ok) dispatch({ type: "load-failed", generation });
            });
          }
          break;
        case "stop":
          void mpvPlayer.stop();
          break;
        case "schedule-retry":
          window.clearTimeout(retryTimer);
          retryTimer = window.setTimeout(
            () => dispatch({ type: "retry-fire", generation: effect.generation }),
            effect.delayMs,
          );
          break;
        case "start-healthy-timer":
          window.clearTimeout(healthyTimer);
          healthyTimer = window.setTimeout(
            () => dispatch({ type: "healthy-timeout", generation: effect.generation }),
            HEALTHY_PLAYBACK_RESET_MS,
          );
          break;
        case "clear-retry-timer":
          window.clearTimeout(retryTimer);
          break;
        case "clear-healthy-timer":
          window.clearTimeout(healthyTimer);
          break;
      }
    };

    report("connecting");

    mpvPlayer.acquire().then(
      () => {
        if (disposed) return;
        setEngine("ready");
        unsubscribe = mpvPlayer.subscribe((signal) => dispatch(signalToAction(signal)));
        // Place the video area before the first frame, when the screen element exists.
        const ratio = regionTarget?.current ? computeRegionRatio(regionTarget.current) : null;
        if (ratio) void mpvPlayer.setRegion(ratio);
        dispatch({ type: "load" });
      },
      () => {
        if (disposed) return;
        setEngine("failed");
        report("offline");
      },
    );

    return () => {
      disposed = true;
      unsubscribe?.();
      window.clearTimeout(retryTimer);
      window.clearTimeout(healthyTimer);
      // Never destroy the instance from here; stop only. The next effect run
      // (new URL) enqueues its load strictly after this stop.
      void mpvPlayer.stop();
    };
  }, [url]);

  const surfaceActive = Boolean(url) && engine === "ready";

  // The page only becomes transparent once mpv is confirmed alive. If init
  // fails the classes are never added, so nothing turns see-through.
  useEffect(() => {
    if (!surfaceActive) return undefined;
    const root = document.documentElement;
    root.classList.add("mpv-surface");
    return () => root.classList.remove("mpv-surface");
  }, [surfaceActive]);

  return { status, surfaceActive, initFailed: Boolean(url) && engine === "failed" };
}
