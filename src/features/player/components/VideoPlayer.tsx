import { memo, useEffect, useRef, useState } from "react";
import { StatusBadge, type ChannelStatus } from "../../channels/components/ChannelCard";
import { useMpvPlayback } from "../hooks/useMpvPlayback";
import { useVideoRegionSync } from "../hooks/useVideoRegionSync";

type VideoPlayerProps = {
  url?: string;
  channelName?: string;
  onStatusChange?: (status: ChannelStatus) => void;
  // Reports whether the page is currently see-through over the video area, so
  // the app shell can switch its ground to the masked variant.
  onSurfaceChange?: (active: boolean) => void;
};

function PlayerMessage({
  tone,
  title,
  channelName,
  description,
}: {
  tone: "idle" | "error";
  title: string;
  channelName?: string;
  description: string;
}) {
  return (
    <div className="player-frame flex h-full flex-col">
      <div className="player-frame__screen flex flex-1 flex-col items-center justify-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border-strong bg-surface">
          <svg
            className={["h-7 w-7", tone === "error" ? "text-danger" : "text-accent"].join(" ")}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={tone === "error" ? 1.4 : 1.6}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d={
                tone === "error"
                  ? "M12 9v3.75m0 3.75h.008v.008H12v-.008ZM21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                  : "M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"
              }
            />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-text">{title}</p>
          {channelName && <p className="mt-1 truncate text-sm font-medium text-text-muted">{channelName}</p>}
          <p className="mt-1 max-w-xs text-sm text-text-secondary">{description}</p>
        </div>
      </div>
    </div>
  );
}

function VideoPlayerComponent({ url, channelName, onStatusChange, onSurfaceChange }: VideoPlayerProps) {
  const screenRef = useRef<HTMLDivElement | null>(null);
  const { status, surfaceActive, initFailed } = useMpvPlayback(url, onStatusChange, screenRef);
  const wasActive = useRef(false);
  const [pulse, setPulse] = useState(false);

  useVideoRegionSync(screenRef, surfaceActive);

  useEffect(() => {
    onSurfaceChange?.(surfaceActive);
  }, [surfaceActive, onSurfaceChange]);

  // Leaving the player (e.g. switching profile) must always hand the page back
  // to the opaque ground.
  useEffect(() => () => onSurfaceChange?.(false), [onSurfaceChange]);

  useEffect(() => {
    const active = status === "live";
    if (active && !wasActive.current) {
      setPulse(true);
      const timeout = window.setTimeout(() => setPulse(false), 280);
      wasActive.current = true;
      return () => window.clearTimeout(timeout);
    }
    wasActive.current = active;
    return undefined;
  }, [status]);

  if (!url) {
    return (
      <PlayerMessage
        tone="idle"
        title="Nothing playing yet"
        description="Pick a channel to start watching."
      />
    );
  }

  // Developers: a missing libmpv DLL is fixed with `pnpm setup:mpv`.
  if (initFailed) {
    return (
      <PlayerMessage
        tone="error"
        title="Player engine unavailable"
        channelName={channelName}
        description="The video engine could not start. Reinstall the app or restore its libmpv files."
      />
    );
  }

  return (
    <div className={["player-frame flex h-full flex-col", pulse ? "player-frame--pulse" : ""].join(" ")}>
      {/* No media element: mpv paints into the window behind this transparent area. */}
      <div ref={screenRef} className="player-frame__screen relative flex-1">
        <div className="player-live-chip">
          <p className="min-w-0 truncate text-sm font-semibold text-text">{channelName}</p>
          <StatusBadge status={status} />
        </div>
      </div>
    </div>
  );
}

export const VideoPlayer = memo(VideoPlayerComponent);
