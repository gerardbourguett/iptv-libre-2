import { useEffect, useState } from "react";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { DESKTOP_USER_AGENT } from "../../../shared/network/desktopUserAgent";

// Channel logos (tvg-logo URLs from the M3U playlist) used to load as plain
// <img src={url}>, which never went through the Tauri HTTP proxy at all —
// only the video stream did. Many IPTV/logo hosts hotlink-block on missing
// or unrecognized headers, and the WebView's own <img> request sends the
// app's own origin as Referer, which those hosts reject with 403. Routing
// logo fetches through the same @tauri-apps/plugin-http bridge (with the
// same honest desktop User-Agent — see shared/network/desktopUserAgent.ts)
// as the playback engine (libmpv) uses closes that gap for the same class of provider.

// Resolved blob object URLs, keyed by source logo URL. Module-level so it
// survives virtualization remounts (react-window unmounts/remounts
// ChannelCard as the strip scrolls) and is shared across every card that
// happens to reference the same logo URL — a fetch only ever happens once
// per distinct URL.
const logoCache = new Map<string, string>();

// In-flight fetches, keyed the same way, so two cards mounting for the same
// URL in the same tick (e.g. the same channel appearing twice, or a fast
// scroll mounting several cards before the first fetch resolves) share one
// network request instead of issuing duplicates.
const inFlightFetches = new Map<string, Promise<string>>();

// URLs that have already failed once this session — skipped on subsequent
// mounts so a channel whose logo 403s/404s doesn't get re-fetched on every
// scroll-driven remount. Cleared implicitly on full app reload only.
const knownFailedUrls = new Set<string>();

// Unbounded growth guard: very large M3U playlists can carry thousands of
// channels, and a long browsing session could touch a large fraction of
// them. Cap the cache and revoke the oldest object URL on eviction so
// object URLs don't leak indefinitely; Map preserves insertion order, so
// the first key is always the least-recently-added entry.
const MAX_CACHE_ENTRIES = 500;

function rememberLogo(url: string, objectUrl: string): void {
  logoCache.set(url, objectUrl);
  if (logoCache.size <= MAX_CACHE_ENTRIES) return;

  const oldestUrl = logoCache.keys().next().value;
  if (oldestUrl === undefined || oldestUrl === url) return;

  const evicted = logoCache.get(oldestUrl);
  logoCache.delete(oldestUrl);
  if (evicted) URL.revokeObjectURL(evicted);
}

function fetchChannelLogo(url: string): Promise<string> {
  const cached = logoCache.get(url);
  if (cached) return Promise.resolve(cached);

  const pending = inFlightFetches.get(url);
  if (pending) return pending;

  const request = tauriFetch(url, {
    method: "GET",
    headers: { "User-Agent": DESKTOP_USER_AGENT },
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Logo fetch failed with status ${response.status}`);
      }
      return response.blob();
    })
    .then((blob) => {
      const objectUrl = URL.createObjectURL(blob);
      rememberLogo(url, objectUrl);
      return objectUrl;
    })
    .finally(() => {
      inFlightFetches.delete(url);
    });

  inFlightFetches.set(url, request);
  return request;
}

export type ChannelLogoState = {
  /** Resolved object URL, or null while loading or when there's no logo URL. */
  logoSrc: string | null;
  /** True on any failure (403/404/network error/non-2xx) — caller falls back to the monogram placeholder. */
  failed: boolean;
};

/**
 * Resolves a channel logo URL to a locally-cached blob object URL, fetched
 * through @tauri-apps/plugin-http's native Rust HTTP client (bypassing the
 * WebView's own request, which is what triggers hotlink-protection 403s on
 * many IPTV/logo hosts).
 */
export function useChannelLogo(url: string | undefined): ChannelLogoState {
  const [logoSrc, setLogoSrc] = useState<string | null>(() => (url ? (logoCache.get(url) ?? null) : null));
  const [failed, setFailed] = useState(() => Boolean(url && knownFailedUrls.has(url)));

  useEffect(() => {
    if (!url) {
      setLogoSrc(null);
      setFailed(false);
      return undefined;
    }

    const cached = logoCache.get(url);
    if (cached) {
      setLogoSrc(cached);
      setFailed(false);
      return undefined;
    }

    if (knownFailedUrls.has(url)) {
      setLogoSrc(null);
      setFailed(true);
      return undefined;
    }

    let cancelled = false;
    setLogoSrc(null);
    setFailed(false);

    fetchChannelLogo(url)
      .then((objectUrl) => {
        if (!cancelled) setLogoSrc(objectUrl);
      })
      .catch(() => {
        knownFailedUrls.add(url);
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return { logoSrc, failed };
}
