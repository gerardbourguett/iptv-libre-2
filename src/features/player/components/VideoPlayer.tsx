import { memo, useCallback, useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { StatusBadge, type ChannelStatus } from "../../channels/components/ChannelCard";
import { TauriFetchLoader } from "../services/hlsTauriLoader";

type VideoPlayerProps = {
  url?: string;
  channelName?: string;
  onStatusChange?: (status: ChannelStatus) => void;
};

// Playback capability is a fixed property of the runtime (browser/WebView),
// not of any individual channel — safe to resolve once at module load
// rather than re-checking (or worse, deriving from render/effect state,
// which would race against the video element mounting) on every channel
// change. Safari/WebKit report native HLS support via canPlayType; every
// other engine (including Windows' WebView2, which is Chromium-based and
// what this Tauri app runs on) has no native .m3u8 support and needs
// hls.js's MSE-based implementation instead.
const NATIVE_HLS_SUPPORTED =
  typeof document !== "undefined" &&
  document.createElement("video").canPlayType("application/vnd.apple.mpegurl") !== "";
const HLS_JS_SUPPORTED = Hls.isSupported();
const HLS_PLAYBACK_SUPPORTED = NATIVE_HLS_SUPPORTED || HLS_JS_SUPPORTED;

// Neither hls.js's startLoad() nor recoverMediaError() apply any internal
// retry limit — that's explicitly left to the caller. Without a cap, a
// permanently broken stream (dead/geoblocked/expired) keeps re-emitting the
// same fatal error forever, leaving the UI stuck oscillating on
// "Connecting" instead of ever settling to "Offline".
const MAX_FATAL_ERROR_ATTEMPTS = 3;

// MANIFEST_PARSED fires exactly once per channel selection (at the very
// start of playback) and is never re-triggered by hls.startLoad() or
// hls.recoverMediaError() — the two recovery calls the error handler below
// makes. That means a channel which plays fine for hours but hits three
// isolated, individually-recovered transient errors (momentary network
// hiccups, brief decoder stalls, minutes or hours apart, with healthy
// playback in between) would get permanently killed on the 3rd blip even
// though the stream was never actually broken. FRAG_BUFFERED fires
// repeatedly for as long as the stream keeps healthily buffering fragments,
// so debounce-resetting the counter after a sustained stretch of continuous
// buffering distinguishes "3 fatal errors in quick succession" (genuinely
// dead — still gives up, since there's never enough gap between errors for
// this timer to fire) from "3 isolated fatal errors spread over a long
// healthy session" (flaky but alive — the budget refills between blips).
const HEALTHY_PLAYBACK_RESET_MS = 30_000;

function VideoPlayerComponent({
  url,
  channelName,
  onStatusChange,
}: VideoPlayerProps) {
  const [status, setStatus] = useState<ChannelStatus>("idle");
  const wasActive = useRef(false);
  const [pulse, setPulse] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const fatalErrorCount = useRef(0);

  const reportStatus = useCallback(
    (next: ChannelStatus) => {
      setStatus(next);
      onStatusChange?.(next);
    },
    [onStatusChange],
  );

  useEffect(() => {
    if (!url) {
      reportStatus("idle");
      return undefined;
    }

    if (!HLS_PLAYBACK_SUPPORTED) {
      // Neither native HLS nor hls.js's MSE-based playback is available in
      // this runtime — surface that plainly instead of mounting a <video>
      // that would sit on "Connecting" forever.
      reportStatus("offline");
      return undefined;
    }

    const video = videoRef.current;
    if (!video) return undefined;

    reportStatus("connecting");

    // These five handlers are wired imperatively (rather than as static JSX
    // props on the <video> element) and scoped to this effect run so they
    // can be detached in this same run's cleanup. hls.destroy(),
    // hls.recoverMediaError() (which internally detaches/reattaches media),
    // and the native-path `video.load()` below all trigger native
    // error/emptied/waiting events on the real DOM node ASYNCHRONOUSLY —
    // after cleanup has already returned and the next effect run has
    // already attached its own instance for the newly-selected channel. If
    // these listeners were still attached when those stale events arrive,
    // they'd call reportStatus() with the OLD channel's teardown status and
    // corrupt the NEW channel's just-set "connecting"/"live" status. Cleanup
    // below removes these listeners first, before any teardown call, so by
    // the time the async stale events fire the listeners are already gone.
    const handleLoadStart = () => reportStatus("connecting");
    const handleWaiting = () => reportStatus("connecting");
    const handlePlaying = () => reportStatus("live");
    const handleCanPlay = () => reportStatus("live");
    const handleError = () => reportStatus("offline");

    video.addEventListener("loadstart", handleLoadStart);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("error", handleError);

    const removeVideoListeners = () => {
      video.removeEventListener("loadstart", handleLoadStart);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("error", handleError);
    };

    // Prefer hls.js whenever MSE is available: recent Chromium/WebView2
    // builds report native HLS via canPlayType, but the native path loads
    // through the WebView's own network stack (blocked by CORS on most IPTV
    // hosts) and bypasses TauriFetchLoader, so it hangs on "connecting".
    if (NATIVE_HLS_SUPPORTED && !HLS_JS_SUPPORTED) {
      video.src = url;
      video.load();
      video.play().catch(() => {
        // Autoplay can be blocked by the platform; the visible <video
        // controls> let the viewer start playback manually, and the
        // waiting/playing listeners above keep status accurate either way.
      });

      return () => {
        removeVideoListeners();
        video.removeAttribute("src");
        video.load();
      };
    }

    // Fresh attempt budget for this channel/effect run — see
    // MAX_FATAL_ERROR_ATTEMPTS above.
    fatalErrorCount.current = 0;

    // Most third-party IPTV stream servers don't send
    // Access-Control-Allow-Origin, so the WebView blocks hls.js's default
    // fetch/XHR loader from reading manifest/segment responses even when the
    // underlying network request succeeds. TauriFetchLoader routes every
    // request hls.js makes through @tauri-apps/plugin-http's native Rust
    // HTTP client instead, which isn't subject to WebView CORS enforcement.
    const hls = new Hls({ loader: TauriFetchLoader });
    hlsRef.current = hls;

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      // A real recovery succeeded (or this is the first successful load) —
      // give future errors on this same channel a fresh retry budget rather
      // than letting one early transient error eat into it.
      fatalErrorCount.current = 0;
      video.play().catch(() => {});
    });

    // Debounced reset: each successfully buffered fragment (re)starts a
    // timer, and only an uninterrupted HEALTHY_PLAYBACK_RESET_MS stretch of
    // continuous healthy buffering actually clears the fatal-error budget.
    // This is additive to the MANIFEST_PARSED reset above, not a
    // replacement — a fresh channel selection still starts with a clean
    // budget from that one-time event.
    let healthyPlaybackResetTimeout: number | undefined;
    hls.on(Hls.Events.FRAG_BUFFERED, () => {
      window.clearTimeout(healthyPlaybackResetTimeout);
      healthyPlaybackResetTimeout = window.setTimeout(() => {
        fatalErrorCount.current = 0;
      }, HEALTHY_PLAYBACK_RESET_MS);
    });

    // Fatal-error recovery follows hls.js's own recommended pattern:
    // network errors retry the load, media errors attempt in-place
    // recovery, anything else is unrecoverable and tears the instance down.
    // Non-fatal errors are internal hiccups hls.js already handles — no
    // status change needed. Neither startLoad() nor recoverMediaError()
    // limit retries internally, so a small attempt counter caps how many
    // times we'll retry before giving up and reporting offline — otherwise
    // a permanently broken stream would retry forever.
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return;

      switch (data.type) {
        case Hls.ErrorTypes.NETWORK_ERROR:
        case Hls.ErrorTypes.MEDIA_ERROR:
          fatalErrorCount.current += 1;
          if (fatalErrorCount.current > MAX_FATAL_ERROR_ATTEMPTS) {
            removeVideoListeners();
            hls.destroy();
            hlsRef.current = null;
            reportStatus("offline");
            break;
          }
          // Reflect the failure immediately; the status returns to "live"
          // via the video element's playing/canplay events if the recovery
          // attempt actually works, so a dead stream no longer sits on
          // "connecting" through the retries.
          reportStatus("offline");
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
          } else {
            hls.recoverMediaError();
          }
          break;
        default:
          removeVideoListeners();
          hls.destroy();
          hlsRef.current = null;
          reportStatus("offline");
          break;
      }
    });

    hls.loadSource(url);
    hls.attachMedia(video);

    return () => {
      removeVideoListeners();
      window.clearTimeout(healthyPlaybackResetTimeout);
      hls.destroy();
      hlsRef.current = null;
    };
  }, [url, reportStatus]);

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
      <div className="player-frame flex h-full flex-col">
        <div className="player-frame__screen flex flex-1 flex-col items-center justify-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border-strong bg-surface">
            <svg
              className="h-7 w-7 text-accent"
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
          <div className="text-center">
            <p className="text-lg font-semibold text-text">Nothing playing yet</p>
            <p className="mt-1 text-sm text-text-secondary">Pick a channel to start watching.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!HLS_PLAYBACK_SUPPORTED) {
    return (
      <div className="player-frame flex h-full flex-col">
        <div className="player-frame__screen flex flex-1 flex-col items-center justify-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border-strong bg-surface">
            <svg
              className="h-7 w-7 text-danger"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.4}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m0 3.75h.008v.008H12v-.008ZM21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-text">Playback unsupported</p>
            {channelName && <p className="mt-1 truncate text-sm font-medium text-text-muted">{channelName}</p>}
            <p className="mt-1 max-w-xs text-sm text-text-secondary">
              This runtime has no native or MSE-based HLS support — this stream can&apos;t be played here.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={["player-frame flex h-full flex-col", pulse ? "player-frame--pulse" : ""].join(" ")}>
      <div className="player-frame__screen relative flex-1">
        <video
          ref={videoRef}
          controls
          className="h-full w-full bg-black object-contain"
        />
        <div className="player-live-chip">
          <p className="min-w-0 truncate text-sm font-semibold text-text">{channelName}</p>
          <StatusBadge status={status} />
        </div>
      </div>
    </div>
  );
}

export const VideoPlayer = memo(VideoPlayerComponent);
