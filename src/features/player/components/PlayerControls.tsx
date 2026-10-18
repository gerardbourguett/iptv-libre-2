import { useEffect, useState, useSyncExternalStore } from "react";
import { useAppStore } from "../../../store";
import { mpvPlayer } from "../services/mpvPlayer";

const FULLSCREEN_IDLE_HIDE_MS = 3000;
const UNMUTE_FALLBACK_VOLUME = 50;

const ICON_PATHS = {
  play: "M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z",
  pause: "M15.75 5.25v13.5m-7.5-13.5v13.5",
  volume:
    "M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z",
  muted:
    "M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z",
  enterFullscreen:
    "M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15",
  exitFullscreen:
    "M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25",
} as const;

function ControlButton({
  label,
  icon,
  pressed,
  onClick,
}: {
  label: string;
  icon: keyof typeof ICON_PATHS;
  pressed?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="player-controls__btn" aria-label={label} aria-pressed={pressed} onClick={onClick}>
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS[icon]} />
      </svg>
    </button>
  );
}

// Minimal transport controls drawn over the native video. They sit inside the
// player area with a solid background: the WebView cannot blend with mpv's
// pixels, so translucency or backdrop blur would render wrong.
export function PlayerControls() {
  const { paused, muted, volume } = useSyncExternalStore(mpvPlayer.subscribeControls, mpvPlayer.getControls);
  const fullscreen = useAppStore((s) => s.isPlayerFullscreen);
  const setFullscreen = useAppStore((s) => s.setPlayerFullscreen);
  const [awake, setAwake] = useState(true);

  // In fullscreen the bar hides after a short idle; any pointer/key activity
  // brings it back. In a window it stays visible.
  useEffect(() => {
    if (!fullscreen) {
      setAwake(true);
      return undefined;
    }
    let timer = 0;
    const wake = () => {
      setAwake(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setAwake(false), FULLSCREEN_IDLE_HIDE_MS);
    };
    wake();
    window.addEventListener("pointermove", wake);
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
    };
  }, [fullscreen]);

  // Optimistic value while dragging so the thumb does not fight mpv's echo.
  const [dragVolume, setDragVolume] = useState<number | null>(null);
  const effectiveVolume = dragVolume ?? (muted ? 0 : Math.round(volume));

  return (
    <div
      role="group"
      aria-label="Player controls"
      className={["player-controls", awake ? "" : "player-controls--idle"].join(" ")}
    >
      <ControlButton
        label={paused ? "Play" : "Pause"}
        icon={paused ? "play" : "pause"}
        onClick={() => void mpvPlayer.setPaused(!paused)}
      />
      <ControlButton
        label={muted ? "Unmute" : "Mute"}
        icon={muted ? "muted" : "volume"}
        pressed={muted}
        onClick={() => {
          // Unmuting at volume 0 would stay silent: restore a sensible level.
          if (muted && Math.round(volume) === 0) void mpvPlayer.setVolume(UNMUTE_FALLBACK_VOLUME);
          void mpvPlayer.setMuted(!muted);
        }}
      />
      <input
        type="range"
        className="player-controls__volume"
        aria-label="Volume"
        min={0}
        max={100}
        step={1}
        value={effectiveVolume}
        onChange={(event) => {
          const next = Number(event.target.value);
          setDragVolume(next);
          void mpvPlayer.setVolume(next);
          if (muted && next > 0) void mpvPlayer.setMuted(false);
        }}
        onPointerUp={() => setDragVolume(null)}
        onKeyUp={() => setDragVolume(null)}
        onBlur={() => setDragVolume(null)}
      />
      <span className="flex-1" />
      <ControlButton
        label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        icon={fullscreen ? "exitFullscreen" : "enterFullscreen"}
        onClick={() => setFullscreen(!fullscreen)}
      />
    </div>
  );
}
