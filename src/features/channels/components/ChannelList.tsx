import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Grid, useGridRef, type CellComponentProps } from "react-window";
import type { Channel } from "../../playlists/types";
import { ChannelCard, type ChannelStatus } from "./ChannelCard";

type ChannelListProps = {
  /** Category-filtered channels — the full list contents, stable while the
   * viewer types a search (search filters visually, it never unmounts a
   * card). */
  channels: Channel[];
  totalChannels: number;
  selectedChannelId?: string;
  searchQuery: string;
  /** Real connection status of the currently playing channel. */
  playerStatus: ChannelStatus;
  onSelectChannel: (channel: Channel) => void;
  onSearchQueryChange: (value: string) => void;
};

// Above this count, render the list through react-window instead of a
// plain flex column — large M3U playlists can carry thousands of channels.
// This is measured against the category-filtered set, not the
// search-filtered one, so typing a search never toggles virtualization
// on/off mid-keystroke.
const VIRTUALIZE_THRESHOLD = 150;

// The channel list is a vertical, scrolling sidebar pinned to the left of
// the video player so the player keeps the full remaining height. Rows use a
// compact horizontal card (see `.channel-sidebar .channel-card` in App.css).
// Row geometry is fixed so react-window can compute offsets.
const TILE_HEIGHT = 76;
const GAP = 10;
const ROW_HEIGHT = TILE_HEIGHT + GAP;

function matchesQuery(channel: Channel, normalizedQuery: string) {
  if (!normalizedQuery) return true;
  const searchable = [channel.name, channel.groupTitle, channel.tvgName, channel.tvgId]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return searchable.includes(normalizedQuery);
}

type ListRowProps = {
  channels: Channel[];
  selectedChannelId?: string;
  normalizedQuery: string;
  playerStatus: ChannelStatus;
  focusedIndex: number;
  onSelectChannel: (channel: Channel, index: number) => void;
  onTileFocus: (index: number) => void;
  registerTileRef: (index: number, el: HTMLButtonElement | null) => void;
};

function ListRow({
  rowIndex,
  style,
  channels,
  selectedChannelId,
  normalizedQuery,
  playerStatus,
  focusedIndex,
  onSelectChannel,
  onTileFocus,
  registerTileRef,
}: CellComponentProps<ListRowProps>) {
  const channel = channels[rowIndex];
  if (!channel) return null;

  return (
    <div style={{ ...style, paddingBottom: GAP, boxSizing: "border-box" }}>
      <ChannelCard
        channel={channel}
        index={rowIndex}
        active={selectedChannelId === channel.id}
        dimmed={!matchesQuery(channel, normalizedQuery)}
        status={selectedChannelId === channel.id ? playerStatus : "idle"}
        tabIndex={focusedIndex === rowIndex ? 0 : -1}
        onFocus={() => onTileFocus(rowIndex)}
        registerRef={(el) => registerTileRef(rowIndex, el)}
        onSelect={() => onSelectChannel(channel, rowIndex)}
      />
    </div>
  );
}

function ChannelListComponent({
  channels,
  totalChannels,
  selectedChannelId,
  searchQuery,
  playerStatus,
  onSelectChannel,
  onSearchQueryChange,
}: ChannelListProps) {
  const [focusedIndex, setFocusedIndex] = useState(() =>
    Math.max(0, channels.findIndex((c) => c.id === selectedChannelId)),
  );
  const gridRef = useGridRef(null);
  const tileRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  // Keep the roving-focus index valid (and, ideally, parked on the playing
  // channel) whenever the list's contents change — a category switch or a
  // fresh playlist load can shrink or reorder the array underneath it.
  useEffect(() => {
    setFocusedIndex((prev) => {
      if (channels.length === 0) return 0;
      const activeIndex = selectedChannelId ? channels.findIndex((c) => c.id === selectedChannelId) : -1;
      if (activeIndex >= 0) return activeIndex;
      return Math.min(prev, channels.length - 1);
    });
  }, [channels, selectedChannelId]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const matchCount = useMemo(
    () => channels.filter((c) => matchesQuery(c, normalizedQuery)).length,
    [channels, normalizedQuery],
  );

  const isVirtualized = channels.length > VIRTUALIZE_THRESHOLD;

  const registerTileRef = useCallback((index: number, el: HTMLButtonElement | null) => {
    if (el) tileRefs.current.set(index, el);
  }, []);

  const focusTile = useCallback((index: number) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        tileRefs.current.get(index)?.focus();
      });
    });
  }, []);

  const moveFocus = useCallback(
    (nextIndex: number) => {
      if (channels.length === 0) return;
      const clamped = Math.max(0, Math.min(channels.length - 1, nextIndex));
      setFocusedIndex(clamped);
      if (isVirtualized) {
        gridRef.current?.scrollToRow({ index: clamped, align: "auto" });
      } else {
        tileRefs.current.get(clamped)?.scrollIntoView({ block: "nearest" });
      }
      focusTile(clamped);
    },
    [channels.length, isVirtualized, gridRef, focusTile],
  );

  // Vertical list: up/down (plus Home/End) move the roving focus.
  // Left/right are intentionally left unhandled so they fall through to
  // normal browser behavior.
  const handleListKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          moveFocus(focusedIndex + 1);
          break;
        case "ArrowUp":
          event.preventDefault();
          moveFocus(focusedIndex - 1);
          break;
        case "Home":
          event.preventDefault();
          moveFocus(0);
          break;
        case "End":
          event.preventDefault();
          moveFocus(channels.length - 1);
          break;
        default:
          break;
      }
    },
    [focusedIndex, moveFocus, channels.length],
  );

  const handleSelect = useCallback(
    (channel: Channel, index: number) => {
      setFocusedIndex(index);
      onSelectChannel(channel);
    },
    [onSelectChannel],
  );

  return (
    <section className="channel-sidebar app-panel flex h-full min-h-0 w-full flex-col">
      <div className="flex flex-shrink-0 flex-col gap-2.5 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-text">Channels</h2>
          <span className="text-xs text-text-muted">
            {searchQuery ? `${matchCount} of ${channels.length} matching` : `${channels.length} of ${totalChannels}`}
          </span>
        </div>

        <label className="relative block w-full">
          <span className="sr-only">Search channels</span>
          <input
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder="Search channels..."
            className="app-input w-full py-2 pl-9 pr-3 text-xs"
          />
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
        </label>
      </div>

      <div
        className="relative min-h-0 w-full flex-1"
        role="group"
        aria-label="Channel list"
        onKeyDown={handleListKeyDown}
      >
        {channels.length === 0 ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 overflow-hidden p-4">
            <div className="channel-card flex h-10 w-10 flex-shrink-0 items-center justify-center">
              <svg
                className="h-4 w-4 text-text-muted"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 6.878V6a2.25 2.25 0 012.25-2.25h7.5A2.25 2.25 0 0118 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 004.5 9v.878m13.5-3A2.25 2.25 0 0119.5 9v.878m0 0a2.246 2.246 0 00-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0121 12v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6c0-.98.626-1.813 1.5-2.122"
                />
              </svg>
            </div>
            <p className="text-center text-[11px] text-text-muted">No channels in this category — try another one.</p>
          </div>
        ) : isVirtualized ? (
          <Grid
            gridRef={gridRef}
            className="absolute inset-0 p-3 pb-0"
            style={{ height: "100%", width: "100%" }}
            rowCount={channels.length}
            rowHeight={ROW_HEIGHT}
            columnCount={1}
            columnWidth="100%"
            cellComponent={ListRow}
            cellProps={{
              channels,
              selectedChannelId,
              normalizedQuery,
              playerStatus,
              focusedIndex,
              onSelectChannel: handleSelect,
              onTileFocus: setFocusedIndex,
              registerTileRef,
            }}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col gap-2.5 overflow-y-auto overflow-x-hidden p-3">
            {channels.map((channel, index) => (
              <div key={channel.id} style={{ height: TILE_HEIGHT, flexShrink: 0 }}>
                <ChannelCard
                  channel={channel}
                  index={index}
                  active={selectedChannelId === channel.id}
                  dimmed={!matchesQuery(channel, normalizedQuery)}
                  status={selectedChannelId === channel.id ? playerStatus : "idle"}
                  tabIndex={focusedIndex === index ? 0 : -1}
                  onFocus={() => setFocusedIndex(index)}
                  registerRef={(el) => registerTileRef(index, el)}
                  onSelect={() => handleSelect(channel, index)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export const ChannelList = memo(ChannelListComponent);
