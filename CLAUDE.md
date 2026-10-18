# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`libre-iptv-2` (product name "OpenTV") is a Tauri v2 desktop IPTV player: a React 19 + TypeScript frontend (Vite 7, Tailwind 4) inside a Rust-hosted WebView shell (`src-tauri/`). Users load an M3U playlist URL, browse channels, and play streams.

## Commands

Package manager is **pnpm** (`pnpm-lock.yaml` is the tracked lockfile — don't use npm/yarn).

- `pnpm install` — install dependencies
- `pnpm setup:mpv` — download and SHA-256-verify the pinned libmpv DLLs into `src-tauri/lib/` (required once after a fresh clone; the DLLs are gitignored)
- `pnpm dev` — run the Vite frontend only (browser, no desktop shell)
- `pnpm tauri dev` — run the full desktop app (Rust shell + frontend); this is how you actually exercise Tauri commands/capabilities
- `pnpm build` — type-check (`tsc`, `noEmit`) then build the frontend bundle to `dist/`
- `pnpm tauri build` — produce a packaged desktop build

There is no test runner configured in `package.json`. Do not claim test coverage exists; if you add tests, place frontend tests beside the module as `*.test.ts`/`*.test.tsx` and Rust unit tests in `src-tauri/src/` under `#[cfg(test)]` — but no runner is wired up yet, so a test command must be added first.

There is no linter configured either — `tsconfig.json` strictness flags (`strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`) are the only enforced checks, surfaced via `tsc` during `pnpm build`.

## Architecture

**The app is almost entirely frontend/WebView-side; the Rust backend is the Tauri scaffold plus plugins.** `src-tauri/src/lib.rs` registers `tauri-plugin-opener`, `tauri-plugin-http` and `tauri-plugin-libmpv`, and exposes exactly one custom command, the default `greet(name) -> String`, which nothing in the frontend calls. `src-tauri/capabilities/default.json` grants `core:default`, `opener:default`, `libmpv:default`, `core:window:allow-set-fullscreen`, and `http:default` scoped to `http://*:*` and `https://*:*` — no filesystem or shell permissions. Playlist fetching uses the WebView's native `fetch`; channel logos go through `@tauri-apps/plugin-http` (`src/features/channels/hooks/useChannelLogo.ts`) to bypass CORS. Video playback is native: libmpv, driven from the WebView through `tauri-plugin-libmpv-api`. Don't assume backend logic exists in Rust for a feature until you've checked — it almost certainly lives in `src/` instead.

**No router, no multi-store.** `src/App.tsx` is a two-screen state machine gated on Zustand hydration: `WelcomeScreen` (no profile yet) vs. `MainScreen` (profile exists) — there is no URL-based routing. `src/store.ts` is a single flat Zustand store (`useAppStore`) holding both state and actions together (no per-feature slices, no `combine`).

- **Persistence**: `zustand/middleware`'s `persist`, backed by `localStorage` (key `"libre-iptv-2-app-storage"`) — not Tauri's fs plugin. `partialize` persists only `profile`, `channels`, `lastLoadedAt`; transient UI state (loading/error/notice/selection/search) is excluded. `App.tsx` gates rendering on `hasHydrated` to avoid a flash of the welcome screen before persisted data loads.
- Channel filtering by category/search happens in `App.tsx`'s `MainScreen` via `useMemo`, not in the store.
- Components read the store field-by-field (`useAppStore((s) => s.field)`), not with `useShallow` or combined selectors.

**Feature folders** (`src/features/`) loosely follow a `components/` (UI) / `parser/` (parsing) / `services/` (network) split per feature, though it's not applied uniformly — check what actually exists in a feature before assuming a subfolder is there:

- `channels/` — category sidebar + channel list UI, shared constants (`ALL_CHANNELS_CATEGORY`), `hooks/useChannelLogo.ts`
- `player/` — native playback through **libmpv** (Windows only; no `<video>` element and no hls.js). Layout: `services/mpvPlayer.ts` (app-lifetime singleton: lazy `init` on the first `acquire()`, every call serialized through an `enqueue()` promise chain, never destroyed from React — unmount only issues `stop`; also exposes pause/mute/volume setters and an external-store API for control state), `services/mpvStatus.ts` (pure reducer mapping mpv events to `connecting`/`live`/`offline`, 3 retries with 1/2/4s backoff, budget refilled after 30s of healthy playback), `hooks/useMpvPlayback.ts` (URL lifecycle, reducer wiring, adds `html.mpv-surface` once mpv is alive), `hooks/useVideoRegionSync.ts` (rAF-coalesced mapping of the player area to mpv `video-margin-ratio-*` and the `--hole-*` CSS vars), `hooks/usePlayerFullscreen.ts` (Tauri window fullscreen, Esc to exit, window-to-store reconciliation), `components/VideoPlayer.tsx` and `components/PlayerControls.tsx` (play/pause, mute, volume, fullscreen).
  - **Hole/mask approach**: mpv renders into the main window handle (`wid`) *beneath* a transparent WebView (`transparent: true` in `tauri.conf.json`). While a stream is active the page turns transparent and the ground gradient moves to a fixed `::before` layer with a CSS mask hole over the player area (`src/App.css`, `.app-ground--video`). Anything over the video (live chip, controls, toasts) must use a solid background — no `backdrop-filter` or alpha, because the WebView cannot blend with mpv's pixels. If mpv fails to init, the surface classes are never added and the player shows an error card.
  - **Input isolation**: mpv is initialised with `osc=no`, `input-default-bindings=no`, `input-vo-keyboard=no`, etc., so the HTML UI owns keys and the cursor. Network options (desktop User-Agent from `src/shared/network/desktopUserAgent.ts`, lavf reconnect keys on both `stream-lavf-o` and `demuxer-lavf-o`) live in `MPV_CONFIG` in `mpvPlayer.ts`.
  - **Fullscreen**: transient `isPlayerFullscreen` in the store (not persisted). While set, `MainScreen` hides (not unmounts) header/category tabs/sidebar and region sync forces margins to 0.
  - **libmpv DLLs**: `pnpm setup:mpv` is a prerequisite after a fresh clone. It downloads the pinned LGPL `libmpv-2.dll` and `libmpv-wrapper.dll` (`scripts/setup-mpv-lib.mjs`, pins and SHA-256 hashes in `scripts/mpv-lib.lock.json`, checked by `scripts/verify-mpv-lib.mjs`) into the gitignored `src-tauri/lib/`. They are bundled via `bundle.resources` (`lib/**/*`, `licenses/**/*`), which adds roughly 100 MB to the installer. Licenses: `src-tauri/licenses/THIRD_PARTY_NOTICES.md`. Only LGPL builds may be used.
  - **Spike-verified constraints**: mpv draws beneath a transparent WebView2 on this app; plugin `0.3.2` is pinned exactly; `tauri-plugin-libmpv` issue #2 ("instance for window label main not found") comes from commands issued before/without a live instance, which is why all calls go through `enqueue()`.
- `playlists/` — the core IPTV logic: `parser/parseM3u.ts` (hand-rolled `#EXTINF` line parser, no external M3U library) and `services/fetchPlaylist.ts` (fetch + validation + English-language user-facing error messages). Domain types (`Channel`, `Profile`, `Playlist`) live in `playlists/types.ts`.
- `profiles/` — profile creation form

## Conventions

(From `AGENTS.md`, which remains the source of truth for repo-wide guidelines — read it directly for anything not covered here.)

- React components: `PascalCase` filenames (e.g. `CreateProfileForm.tsx`); functions/variables/Zustand actions: `camelCase`; feature folders: lowercase domain names
- TypeScript/React: 2-space indentation; Rust in `src-tauri/src/`: `rustfmt` defaults (4 spaces)
- Keep UI in `components/`, parsing in `parser/`, network access in `services/`
- Do not hardcode IPTV sources, secrets, or local-only paths; keep playlist URLs validated in the playlist service layer (`fetchPlaylist.ts` already validates http/https and content shape — extend there, don't bypass it)
- Review changes to `src-tauri/capabilities/` and `tauri.conf.json` carefully — they affect desktop permissions (currently `core:default`, `opener:default`, `http:default` allowing any http/https URL, `libmpv:default`, and `core:window:allow-set-fullscreen`; `security.csp` is `null`).
- Commit convention: Conventional Commits (`feat:`, `fix:`, etc.)

## Config notes

- `vite.config.ts` pins the dev server to port `1420` (`strictPort: true`) to match `tauri.conf.json`'s `build.devUrl`; `clearScreen: false` so Rust build errors stay visible; `src-tauri/**` is excluded from Vite's watcher. No path aliases are configured — imports are relative.
- Tailwind 4 is wired via `@tailwindcss/vite` (no separate `tailwind.config.js`); theme tokens live in `src/App.css`'s `@theme` block.
- `dist/` and `src-tauri/target/` are generated build artifacts — do not edit or commit changes there.
