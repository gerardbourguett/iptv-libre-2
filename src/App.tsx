import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "./store";
import { CreateProfileForm } from "./features/profiles/components/CreateProfileForm";
import { CategoryTabs } from "./features/channels/components/CategoryTabs";
import { ChannelList } from "./features/channels/components/ChannelList";
import { ALL_CHANNELS_CATEGORY } from "./features/channels/constants";
import { VideoPlayer } from "./features/player/components/VideoPlayer";
import { StatusBadge, type ChannelStatus } from "./features/channels/components/ChannelCard";

const NOTICE_AUTO_DISMISS_MS = 4000;

function BrandMark() {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent-soft">
        <svg
          className="h-4 w-4 text-accent-text"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"
          />
        </svg>
      </span>
      <h1 className="truncate text-base font-extrabold text-text">
        Open<span className="text-accent-text">TV</span>
      </h1>
    </div>
  );
}

function StatusBanner({
  tone,
  message,
  onClose,
}: {
  tone: "error" | "notice";
  message: string;
  onClose: () => void;
}) {
  const tones = {
    error: "border-danger/40 bg-danger-soft text-danger",
    notice: "border-accent/30 bg-accent-soft text-accent-text",
  };

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      className={["flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur", tones[tone]].join(" ")}
    >
      <p className="font-medium">{message}</p>
      <button
        className="flex-shrink-0 text-xs font-bold uppercase tracking-wider opacity-70 transition-opacity hover:opacity-100"
        onClick={onClose}
      >
        Close
      </button>
    </div>
  );
}

function WelcomeScreen() {
  const createProfile = useAppStore((s) => s.createProfile);
  const isLoading = useAppStore((s) => s.isLoading);
  const error = useAppStore((s) => s.error);

  return (
    <main className="app-ground relative flex min-h-screen flex-col items-center justify-center px-6">
      <div className="relative z-10 w-full max-w-md animate-scale-in">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft">
            <svg
              className="h-7 w-7 text-accent-text"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.6}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"
              />
            </svg>
          </div>

          <h1 className="text-4xl font-extrabold text-text">
            Open<span className="text-accent-text">TV</span>
          </h1>

          <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-text-secondary">
            Load your M3U playlist and start watching — your channels, your source, right away.
          </p>
        </div>

        <div className="app-panel rounded-2xl p-6">
          <CreateProfileForm
            isLoading={isLoading}
            error={error}
            onSubmit={createProfile}
          />
        </div>

        <p className="mt-6 text-center text-[11px] text-text-muted">
          v0.2 alpha — No content included. OpenTV plays sources you supply.
        </p>
      </div>
    </main>
  );
}

function MainScreen() {
  const profile = useAppStore((s) => s.profile);
  const channels = useAppStore((s) => s.channels);
  const selectedCategory = useAppStore((s) => s.selectedCategory);
  const selectedChannel = useAppStore((s) => s.selectedChannel);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const isLoading = useAppStore((s) => s.isLoading);
  const error = useAppStore((s) => s.error);
  const notice = useAppStore((s) => s.notice);
  const clearError = useAppStore((s) => s.clearError);
  const clearNotice = useAppStore((s) => s.clearNotice);
  const setSelectedCategory = useAppStore((s) => s.setSelectedCategory);
  const setSelectedChannel = useAppStore((s) => s.setSelectedChannel);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const resetProfile = useAppStore((s) => s.resetProfile);
  const refreshPlaylist = useAppStore((s) => s.refreshPlaylist);

  // Real connection status of the currently playing channel, reported up by
  // the video player's own <video> element events. This is transient UI
  // state, not persisted.
  const [playerStatus, setPlayerStatus] = useState<ChannelStatus>("idle");

  const categories = useMemo(() => {
    const uniqueCategories = new Set(
      channels.map((c) => c.groupTitle || "No category"),
    );
    return [ALL_CHANNELS_CATEGORY, ...Array.from(uniqueCategories).sort()];
  }, [channels]);

  // Category filtering is real navigation — it removes non-matching
  // channels from the strip. Search is different: it's a "find in the
  // list" filter that dims non-matching cards without unmounting them, so
  // this set stays independent of searchQuery.
  const visibleChannels = useMemo(() => {
    return selectedCategory === ALL_CHANNELS_CATEGORY
      ? channels
      : channels.filter((c) => (c.groupTitle || "No category") === selectedCategory);
  }, [channels, selectedCategory]);

  // Notices are transient confirmations: auto-dismiss after a few seconds.
  // Errors stay until the user closes them.
  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(clearNotice, NOTICE_AUTO_DISMISS_MS);
    return () => window.clearTimeout(timeout);
  }, [notice, clearNotice]);

  const headerStatus: ChannelStatus | "syncing" = isLoading ? "syncing" : playerStatus;

  return (
    <main className="app-ground relative flex h-screen flex-col">
      <header className="app-topbar">
        <BrandMark />

        <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1.5">
          <div className="app-stat hidden min-w-0 sm:flex">
            <span className="app-stat__label">Profile</span>
            <span className="app-stat__value truncate">{profile?.name}</span>
          </div>
          <div className="app-stat hidden min-w-0 md:flex">
            <span className="app-stat__label">Source</span>
            <span className="mono app-stat__value truncate max-w-56">
              {profile?.playlistUrl}
            </span>
          </div>
          <div className="app-stat">
            <span className="app-stat__label">Status</span>
            <span className="app-stat__value">
              <StatusBadge status={headerStatus === "syncing" ? "connecting" : headerStatus} />
            </span>
          </div>
          <div className="app-stat">
            <span className="app-stat__label">Channels</span>
            <span className="app-stat__value">{channels.length}</span>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            className="btn-secondary"
            onClick={refreshPlaylist}
            disabled={isLoading}
          >
            {isLoading ? "Refreshing..." : "Refresh"}
          </button>
          <button
            className="btn-secondary btn-secondary--danger"
            onClick={resetProfile}
          >
            Switch profile
          </button>
        </div>
      </header>

      {(error || notice) && (
        <div className="pointer-events-none fixed right-4 top-16 z-50 flex w-full max-w-sm flex-col gap-2">
          {error && (
            <div className="pointer-events-auto">
              <StatusBanner tone="error" message={error} onClose={clearError} />
            </div>
          )}
          {notice && (
            <div className="pointer-events-auto">
              <StatusBanner tone="notice" message={notice} onClose={clearNotice} />
            </div>
          )}
        </div>
      )}

      <CategoryTabs
        categories={categories}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-2 md:flex-row">
        <aside className="h-64 min-h-0 flex-shrink-0 md:h-auto md:w-72">
          <ChannelList
            channels={visibleChannels}
            totalChannels={channels.length}
            selectedChannelId={selectedChannel?.id}
            searchQuery={searchQuery}
            playerStatus={playerStatus}
            onSelectChannel={setSelectedChannel}
            onSearchQueryChange={setSearchQuery}
          />
        </aside>

        <section className="min-h-0 min-w-0 flex-1">
          <VideoPlayer
            url={selectedChannel?.url}
            channelName={selectedChannel?.name}
            onStatusChange={setPlayerStatus}
          />
        </section>
      </div>
    </main>
  );
}

export default function App() {
  const hasHydrated = useAppStore((s) => s.hasHydrated);
  const profile = useAppStore((s) => s.profile);

  if (!hasHydrated) {
    return (
      <main className="app-ground flex min-h-screen items-center justify-center">
        <div className="app-panel rounded-2xl px-6 py-5 text-sm font-medium text-text-secondary">
          Restoring session...
        </div>
      </main>
    );
  }

  return profile ? <MainScreen /> : <WelcomeScreen />;
}
