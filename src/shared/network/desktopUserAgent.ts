// Shared across every request routed through @tauri-apps/plugin-http (the
// HLS loader in features/player and the channel-logo fetcher in
// features/channels) — both hit the same class of gray-market IPTV/logo
// hosts, and both need the same fix for the same reason.
//
// Confirmed by reading tauri-plugin-http 2.5.9's Rust source
// (commands.rs::fetch): when the caller doesn't set a User-Agent header,
// the plugin appends its own — literally `tauri-plugin-http/2.5.9`
// (HTTP_USER_AGENT = concat!(CARGO_PKG_NAME, "/", CARGO_PKG_VERSION)). Any
// anti-bot/anti-hotlink check on the server sees a non-browser client name
// and can reject it outright, which plausibly explains both the logo 403s
// and the stream fragments hanging even after switching to the native
// fetch bridge for CORS. `User-Agent` is NOT one of the headers
// tauri-plugin-http filters out (see `is_unsafe_header` in the same file),
// so setting it via `fetch(url, { headers: {...} })` on the JS side is
// honored as-is and overrides the plugin's default — no Rust/Cargo changes
// needed.
//
// `Referer`, by contrast, IS in that forbidden-header list and is silently
// dropped server-side unless the `unsafe-headers` Cargo feature is enabled
// on tauri-plugin-http (it isn't, in src-tauri/Cargo.toml). So there is
// currently no way to set a custom Referer through this plugin at all —
// which is fine here, since omitting Referer (rather than sending the
// app's own tauri://localhost / http://localhost:1420 origin, which is
// what a plain WebView <img>/<video> request would send) is the safer
// choice against hosts that reject unrecognized referrers.
//
// Rather than hardcoding a Chrome/Edge version number (which would drift
// stale as WebView2 auto-updates), this reads the WebView's own real
// `navigator.userAgent`. This app genuinely runs inside a Chromium-based
// WebView2 on Windows, so the browser's self-reported identity is both
// honest and always current — it's standard client information most HTTP
// libraries (including tauri-plugin-http, per the above) omit by default,
// not a spoofed one. The hardcoded fallback only matters if `navigator` is
// ever unavailable, which isn't expected in this Tauri WebView context.
const FALLBACK_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0";

export const DESKTOP_USER_AGENT: string =
  typeof navigator !== "undefined" && navigator.userAgent ? navigator.userAgent : FALLBACK_USER_AGENT;
