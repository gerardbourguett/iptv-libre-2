import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppStore } from "../../../store";

// Module-level flag: true while a setFullscreen call is unresolved.
const transition = { pending: false };

// Keeps the Tauri window fullscreen state and the transient store flag in
// sync, in both directions. Mount once, from the main screen.
export function usePlayerFullscreen() {
  const fullscreen = useAppStore((s) => s.isPlayerFullscreen);

  // Store -> window.
  useEffect(() => {
    let cancelled = false;
    const appWindow = getCurrentWindow();
    transition.pending = true;
    appWindow
      .isFullscreen()
      // Only touch the window when it differs (no-op on mount).
      .then((actual) => (actual === fullscreen ? undefined : appWindow.setFullscreen(fullscreen)))
      .catch(() => useAppStore.getState().setPlayerFullscreen(false))
      .finally(() => {
        if (!cancelled) transition.pending = false;
      });
    return () => {
      cancelled = true;
    };
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
    const appWindow = getCurrentWindow();
    appWindow
      .onResized(() => {
        if (transition.pending) return;
        void appWindow.isFullscreen().then((actual) => {
          if (disposed || transition.pending) return;
          if (actual !== useAppStore.getState().isPlayerFullscreen) {
            useAppStore.getState().setPlayerFullscreen(actual);
          }
        });
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
      unlisten?.();
    };
  }, []);

  // Leaving the main screen (e.g. switching profile) always exits fullscreen.
  useEffect(
    () => () => {
      if (useAppStore.getState().isPlayerFullscreen) {
        useAppStore.getState().setPlayerFullscreen(false);
        void getCurrentWindow().setFullscreen(false);
      }
    },
    [],
  );
}
