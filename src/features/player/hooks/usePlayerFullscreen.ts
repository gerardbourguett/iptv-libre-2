import { useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppStore } from "../../../store";

// Window toggles are serialized through one promise chain. `pending` counts
// unresolved steps (reconcile ignores window events meanwhile); `generation`
// lets superseded steps skip, since the latest step applies the latest value.
const transition = { chain: Promise.resolve(), pending: 0, generation: 0 };

// Keeps the Tauri window fullscreen state and the transient store flag in
// sync, in both directions. Mount once, from the main screen.
export function usePlayerFullscreen() {
  const fullscreen = useAppStore((s) => s.isPlayerFullscreen);
  const mounted = useRef(false);

  // Store -> window.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const generation = ++transition.generation;
    transition.pending += 1;
    transition.chain = transition.chain
      .then(() => {
        if (generation !== transition.generation) return undefined;
        return getCurrentWindow().setFullscreen(useAppStore.getState().isPlayerFullscreen);
      })
      .catch(() => useAppStore.getState().setPlayerFullscreen(false))
      .finally(() => {
        transition.pending = Math.max(0, transition.pending - 1);
      });
  }, [fullscreen]);

  // Esc leaves fullscreen. mpv ignores keys (input isolation), so the window
  // keydown handler is authoritative.
  useEffect(() => {
    if (!fullscreen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") useAppStore.getState().setPlayerFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreen]);

  // Window -> store: the user can leave fullscreen by other means (Win+Down,
  // Alt+Enter...). Ignored while our own toggle is still in flight.
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    let frame = 0;
    const appWindow = getCurrentWindow();
    // rAF-coalesced so a manual window drag issues at most one IPC per frame,
    // and none while one of our own toggles is in flight.
    const reconcile = () => {
      frame = 0;
      if (disposed || transition.pending > 0) return;
      void appWindow.isFullscreen().then((actual) => {
        if (disposed || transition.pending > 0) return;
        if (actual !== useAppStore.getState().isPlayerFullscreen) {
          useAppStore.getState().setPlayerFullscreen(actual);
        }
      });
    };
    appWindow
      .onResized(() => {
        if (transition.pending > 0 || frame) return;
        frame = window.requestAnimationFrame(reconcile);
      })
      .then(
        (fn) => {
          if (disposed) fn();
          else unlisten = fn;
        },
        () => {},
      );
    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      unlisten?.();
    };
  }, []);

  // Leaving the main screen (e.g. switching profile) always exits fullscreen.
  useEffect(
    () => () => {
      transition.generation += 1;
      transition.pending = 0;
      if (useAppStore.getState().isPlayerFullscreen) {
        useAppStore.getState().setPlayerFullscreen(false);
        transition.chain = transition.chain
          .then(() => getCurrentWindow().setFullscreen(false))
          .catch(() => undefined);
      }
    },
    [],
  );
}
