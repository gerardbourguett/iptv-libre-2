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

**The app is almost entirely frontend/WebView-side; the Rust backend is just the Tauri scaffold plus plugins.** `src-tauri/src/lib.rs` registers `tauri-plugin-opener` and `tauri-plugin-http` and exposes exactly one custom command, the default `greet(name) -> String`, which nothing in the frontend calls. `src-tauri/capabilities/default.json` grants `core:default`, `opener:default`, and `http:default` scoped to `http://*:*` and `https://*:*` — no filesystem or shell permissions. Playlist fetching uses the WebView's native `fetch`, but all HLS traffic (manifest + segments) goes through `TauriFetchLoader` (`src/features/player/services/hlsTauriLoader.ts`), which uses `@tauri-apps/plugin-http` to bypass CORS and sends a shared User-Agent to avoid anti-bot blocking. Don't assume backend logic exists in Rust for a feature until you've checked — it almost certainly lives in `src/` instead.

**No router, no multi-store.** `src/App.tsx` is a two-screen state machine gated on Zustand hydration: `WelcomeScreen` (no profile yet) vs. `MainScreen` (profile exists) — there is no URL-based routing. `src/store.ts` is a single flat Zustand store (`useAppStore`) holding both state and actions together (no per-feature slices, no `combine`).

- **Persistence**: `zustand/middleware`'s `persist`, backed by `localStorage` (key `"libre-iptv-2-app-storage"`) — not Tauri's fs plugin. `partialize` persists only `profile`, `channels`, `lastLoadedAt`; transient UI state (loading/error/notice/selection/search) is excluded. `App.tsx` gates rendering on `hasHydrated` to avoid a flash of the welcome screen before persisted data loads.
- Channel filtering by category/search happens in `App.tsx`'s `MainScreen` via `useMemo`, not in the store.
- Components read the store field-by-field (`useAppStore((s) => s.field)`), not with `useShallow` or combined selectors.

**Feature folders** (`src/features/`) loosely follow a `components/` (UI) / `parser/` (parsing) / `services/` (network) split per feature, though it's not applied uniformly — check what actually exists in a feature before assuming a subfolder is there:

- `channels/` — category sidebar + channel list UI, shared constants (`ALL_CHANNELS_CATEGORY`), `hooks/useChannelLogo.ts`
- `player/` — `components/VideoPlayer.tsx` (a `<video>` element backed by **hls.js**) and `services/hlsTauriLoader.ts` (custom hls.js loader over the Tauri HTTP plugin). hls.js is preferred whenever MSE is available, even if `canPlayType('application/vnd.apple.mpegurl')` claims native HLS: recent WebView2 builds report native support, but that path uses the WebView's own network stack (blocked by CORS on most IPTV hosts) and bypasses `TauriFetchLoader`, so playback hangs on "connecting". Native `video.src` is only used when hls.js is unsupported. The `Hls` instance is created/destroyed per channel-URL change and on unmount; fatal network/media errors are retried per hls.js's recommended pattern (status shows `offline` immediately and returns to `live` if recovery works), other fatal errors tear the instance down.
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
