# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are IPTV power users / tinkerers: technically comfortable people who manage one or more IPTV playlists/providers themselves (M3U URLs, and eventually Xtream Codes accounts) and expect features power users take for granted — EPG, favorites, multi-playlist/profile switching. They already understand terms like "M3U", "tvg-id", "EPG/XMLTV", and are not looking for a dumbed-down consumer experience.

## Product Purpose

OpenTV is a free, open-source desktop IPTV player (Tauri-based, Windows/macOS/Linux) that lets users load their own M3U (and eventually Xtream Codes) playlists and watch live TV streams, organized and navigated like a professional broadcast control room. Success means reliable playback, fast navigation across large channel lists, and trustworthy, transparent handling of user-supplied sources — not just a pretty UI.

## Positioning

Leans fully into a "professional control room" mechanism: a dense, information-rich UI (live status, channel counts, technical metadata/labels) that lightweight players (VLC standalone, IPTVnator) don't offer, without the plugin-configuration overhead of Kodi + PVR IPTV Simple Client. The claim a neighboring product could not truthfully copy: power-user depth with zero plugin setup.

## Operating Context

Desktop app, single resizable window. Today: one profile/playlist per session (multi-playlist management not yet built), user pastes an M3U URL, browses categories/channels, and plays inside the app. No EPG data ingested yet. No favorites/watch history yet. These are named user expectations, not yet shipped — see Capabilities and Constraints.

## Capabilities and Constraints

**Confirmed / shipped:**
- React 19 + TypeScript frontend, Rust/Tauri v2 shell (backend is currently a minimal scaffold — no real business logic in Rust yet)
- Zustand single-store state, persisted to `localStorage`
- Hand-rolled M3U parser (`#EXTINF`-based, no external library)
- `<video>` playback backed by **hls.js** (MSE-based HLS) with a native-HLS fallback for Safari/WebKit — closes the reliability gap a prior technical audit flagged for `.m3u8` sources on engines (including Windows' WebView2) with no native HLS support
- WCAG AA accessibility baseline established via a dedicated technical-audit remediation pass (Aug 2026): associated form labels, `aria-live` error/notice regions, corrected heading hierarchy, `prefers-reduced-motion` on the primary pulse animation (coverage is partial — a couple of secondary animations are not yet guarded), required-field indicators, `color-scheme: dark`
- Virtualized channel list (`react-window`) above 150 items for large-playlist performance; a residual keyboard-reachability gap exists for lists beyond that threshold (not yet fixed)

**Confirmed as NOT yet built** (named directly by the user as expected of this product; do not assume they're out of scope for future work, but do not treat them as already existing either):
- EPG / XMLTV ingestion and display
- Xtream Codes API login/support
- Multi-playlist / multi-profile management
- Favorites and watch history

**Terminology:** channel, playlist, profile (a saved playlist connection), category (channel group), M3U/EXTINF, tvg-id, EPG/XMLTV, Xtream Codes.

## Brand Commitments

Product is currently named "OpenTV" (package/repo name `libre-iptv-2`). Naming was not explicitly locked or freed in the product interview — do not invent a new name unprompted, but the redesign is not blocked from proposing one if the direction calls for it; confirm with the user before finalizing a name change. No existing logo or visual assets beyond the current in-app CSS theme. The app has now been through two visual identities: an initial "MCR Video Wall" broadcast-console theme, and (current, Aug 2026) a "Familiar Streaming App" replacement — rounded channel cards, a committed violet accent, dark ground — adopted after user testing showed the broadcast-console vocabulary read as unfamiliar/off-putting next to mainstream IPTV/streaming apps. Any future redesign should treat the current in-app CSS theme (see DESIGN.md) as what it is replacing, not as a fixed brand asset.

**Binding constraint:** regardless of visual direction, it must remain explicit (even if handled subtly, e.g. in welcome-screen copy or an about/disclaimer area) that OpenTV is a neutral, content-agnostic player. It does not provide, host, bundle, endorse, or curate any playlist or content source — users supply their own. This framing exists for legal-safety reasons and must survive the redesign.

## Evidence on Hand

None. No real playlists, screenshots, testimonials, or case studies exist to draw on. Future work must not fabricate any of these.

## Product Principles

1. Power-user density over consumer simplicity — surface real information (status, counts, technical metadata) rather than hiding it for a "cleaner" look.
2. Zero-friction onboarding for technical users — paste a URL, get channels; no plugin/config ecosystem to learn.
3. Radical transparency about being a neutral player — never imply the app is a content source itself.
4. Reliability of core playback is non-negotiable — visual ambition must not come at the cost of actual stream compatibility (HLS playback is now backed by hls.js; real-world stream compatibility still needs ongoing verification as new sources are tried).
5. Accessibility is a floor, not an afterthought — carry forward the WCAG AA baseline established in the prior technical-audit pass into any new visual system; do not regress it.

## Accessibility & Inclusion

WCAG AA baseline established via a dedicated technical audit (contrast tokens, `aria-live` regions, semantic headings, reduced-motion, keyboard-accessible controls). The redesign must preserve or improve on this, not regress it. Known residual gaps at time of writing that should inform the new interaction design rather than be ignored: incomplete `prefers-reduced-motion` coverage on some secondary animations, and a keyboard-reachability edge case in the virtualized channel list beyond 150 items.
