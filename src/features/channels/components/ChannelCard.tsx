import { memo, useEffect, useRef, useState } from "react";
import type { Channel } from "../../playlists/types";
import { useChannelLogo } from "../hooks/useChannelLogo";

export type ChannelStatus = "live" | "connecting" | "offline" | "idle";

const STATUS_LABEL: Record<ChannelStatus, string> = {
  live: "Live",
  connecting: "Connecting",
  offline: "Offline",
  idle: "Standby",
};

/** Status class variant — dot + label share one modifier, per the
 * Dot-Plus-Label rule carried over from the previous system: a status is
 * never conveyed by color alone. */
const STATUS_BADGE_CLASS: Record<ChannelStatus, string> = {
  live: "status-badge status-badge--live",
  connecting: "status-badge status-badge--connecting",
  offline: "status-badge status-badge--offline",
  idle: "status-badge status-badge--idle",
};

export function StatusBadge({ status }: { status: ChannelStatus }) {
  return (
    <span className={STATUS_BADGE_CLASS[status]}>
      <span className="status-dot" aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}

function ChannelArt({ channel }: { channel: Channel }) {
  // The logo is fetched through the same native Tauri HTTP proxy the video
  // stream uses (see hooks/useChannelLogo) instead of a plain <img src>,
  // since many IPTV logo hosts 403 hotlink-protected WebView requests.
  const { logoSrc, failed } = useChannelLogo(channel.logo);
  // Belt-and-suspenders: the fetch can succeed (200, valid bytes fetched)
  // while the <img> element still fails to decode them (e.g. a host that
  // returns an HTML error page with a 200 status). onError below catches
  // that case the fetch layer can't.
  const [decodeFailed, setDecodeFailed] = useState(false);

  useEffect(() => {
    setDecodeFailed(false);
  }, [logoSrc]);

  const showLogo = Boolean(channel.logo) && Boolean(logoSrc) && !failed && !decodeFailed;

  return (
    <div className="channel-card__art">
      {showLogo ? (
        <img
          src={logoSrc ?? undefined}
          alt=""
          loading="lazy"
          className="channel-card__logo"
          onError={() => setDecodeFailed(true)}
        />
      ) : (
        <span className="channel-card__monogram" aria-hidden="true">
          {channel.name.slice(0, 2)}
        </span>
      )}
    </div>
  );
}

type ChannelCardProps = {
  channel: Channel;
  index: number;
  active: boolean;
  dimmed: boolean;
  status: ChannelStatus;
  onSelect: (channel: Channel) => void;
  tabIndex: number;
  onFocus: () => void;
  registerRef: (el: HTMLButtonElement | null) => void;
};

function ChannelCardComponent({
  channel,
  index,
  active,
  dimmed,
  status,
  onSelect,
  tabIndex,
  onFocus,
  registerRef,
}: ChannelCardProps) {
  const wasActive = useRef(active);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (active && !wasActive.current) {
      setPulse(true);
      const timeout = window.setTimeout(() => setPulse(false), 280);
      wasActive.current = active;
      return () => window.clearTimeout(timeout);
    }
    wasActive.current = active;
    return undefined;
  }, [active]);

  return (
    <button
      ref={registerRef}
      type="button"
      tabIndex={tabIndex}
      onFocus={onFocus}
      onClick={() => onSelect(channel)}
      aria-pressed={active}
      aria-label={`Channel ${index + 1}: ${channel.name} — ${STATUS_LABEL[status]}`}
      className={[
        "channel-card h-full w-full",
        active ? "channel-card--active" : "",
        pulse ? "channel-card--pulse" : "",
        dimmed ? "channel-card--dimmed" : "",
      ].join(" ")}
    >
      <ChannelArt channel={channel} />

      <div className="channel-card__body">
        <p className="channel-card__name">{channel.name}</p>
        <div className="channel-card__meta-row">
          <span className="channel-card__category">
            {channel.groupTitle || "Uncategorized"}
          </span>
          <StatusBadge status={status} />
        </div>
      </div>
    </button>
  );
}

export const ChannelCard = memo(ChannelCardComponent);
