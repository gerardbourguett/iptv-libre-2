import { useLayoutEffect, type RefObject } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { mpvPlayer } from "../services/mpvPlayer";

const HOLE_VARS = ["--hole-x", "--hole-y", "--hole-w", "--hole-h"] as const;

// Margin ratios of an element relative to the window inner size (CSS px).
export function computeRegionRatio(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (width === 0 || height === 0) return null;
  return {
    left: rect.left / width,
    right: (width - rect.right) / width,
    top: rect.top / height,
    bottom: (height - rect.bottom) / height,
  };
}

// Keeps mpv's video area and the CSS "hole" in the opaque app ground aligned
// with the player element. Margins are ratios of the window inner size in CSS
// pixels, so they do not depend on the display scale factor.
export function useVideoRegionSync(target: RefObject<HTMLElement | null>, enabled: boolean) {
  useLayoutEffect(() => {
    const element = target.current;
    if (!enabled || !element) return undefined;

    const root = document.documentElement;
    let lastKey = "";
    let frame = 0;
    let disposed = false;

    const measure = () => {
      const rect = element.getBoundingClientRect();
      const width = window.innerWidth;
      const height = window.innerHeight;
      if (width === 0 || height === 0) return;

      root.style.setProperty("--hole-x", `${rect.left}px`);
      root.style.setProperty("--hole-y", `${rect.top}px`);
      root.style.setProperty("--hole-w", `${rect.width}px`);
      root.style.setProperty("--hole-h", `${rect.height}px`);

      const ratio = {
        left: rect.left / width,
        right: (width - rect.right) / width,
        top: rect.top / height,
        bottom: (height - rect.bottom) / height,
      };
      const key = [ratio.left, ratio.right, ratio.top, ratio.bottom].map((n) => n.toFixed(4)).join(",");
      if (key === lastKey) return;
      lastKey = key;
      void mpvPlayer.setRegion(ratio);
    };

    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };

    // Synchronous first pass so the hole exists before the surface classes
    // make the page transparent.
    measure();

    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    window.addEventListener("resize", schedule);

    const unlisteners: Array<() => void> = [];
    const track = (pending: Promise<() => void>) => {
      pending.then(
        (unlisten) => {
          if (disposed) unlisten();
          else unlisteners.push(unlisten);
        },
        () => {},
      );
    };
    const appWindow = getCurrentWindow();
    track(appWindow.onResized(schedule));
    track(appWindow.onScaleChanged(schedule));

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      unlisteners.forEach((unlisten) => unlisten());
      HOLE_VARS.forEach((name) => root.style.removeProperty(name));
    };
  }, [target, enabled]);
}
