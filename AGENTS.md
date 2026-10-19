# Repository Guidelines

## Project Structure & Architecture
OpenTV (`libre-iptv-2`) is a Tauri v2 IPTV desktop app with a React 19, TypeScript, Vite 7, and Tailwind 4 frontend.

- `src/` contains the WebView application, the app shell (`App.tsx`), and the single Zustand store (`store.ts`).
- `src/features/` groups domains: `channels/`, `player/`, `playlists/`, and `profiles/`. Keep UI in `components/`, parsing in `parser/`, and network access in `services/` where those folders exist.
- `src/features/playlists/` owns M3U parsing, playlist fetching, validation, and shared domain types.
- `src-tauri/` is the default Tauri scaffold plus plugins (`opener`, `http`, `libmpv`); it has no custom backend logic beyond the unused `greet` command. `src-tauri/lib/` holds gitignored libmpv DLLs fetched by `pnpm setup:mpv`; `src-tauri/licenses/` ships third-party notices. Do not assume a feature has Rust backend support without checking.
- `public/` and `src/assets/` contain static assets. Never edit generated `dist/` or `src-tauri/target/` output.

The app has no router: `App.tsx` switches between welcome and main screens after Zustand hydration. Persistent data uses `localStorage`; playlist networking uses WebView `fetch`. Playback is native: libmpv renders into the window beneath a transparent WebView (`src/features/player/`: `services/mpvPlayer.ts`, `services/mpvStatus.ts`, `hooks/`, `components/PlayerControls.tsx`). There is no `<video>` element and no hls.js. Anything drawn over the video must use a solid background (no `backdrop-filter`/alpha). See `CLAUDE.md` for the full architecture.

## Build, Test, and Development Commands
Use **pnpm** exclusively because `pnpm-lock.yaml` is authoritative.

- `pnpm install` — install dependencies.
- `pnpm setup:mpv` — download and SHA-256-verify the pinned libmpv DLLs into `src-tauri/lib/` (required once after a fresh clone; the DLLs are gitignored)
- `pnpm dev` — run only the Vite frontend.
- `pnpm tauri dev` — run the complete desktop app and exercise Tauri capabilities.
- `pnpm build` — run strict TypeScript checks, then build the frontend.
- `pnpm tauri build` — package the desktop application.

No linter is configured. Run `pnpm test` (Vitest) for unit tests; only the mpv status reducer is covered so far, so do not claim broader coverage. TypeScript compiler checks (`pnpm build`) remain the other automated validation.

## Coding Style & Naming Conventions
Use 2-space indentation for TypeScript/React and `rustfmt` defaults for Rust. Name React component files in `PascalCase` (`VideoPlayer.tsx`); use `camelCase` for functions, variables, and Zustand actions; keep feature directories lowercase. Imports are relative because no path aliases exist.

Place frontend tests beside their modules as `*.test.ts` (the runner includes `src/**/*.test.ts`; extend `vitest.config.ts` before adding `*.test.tsx`). Import `describe`/`it`/`expect` explicitly from `vitest`. Place Rust unit tests under `#[cfg(test)]` (no Rust test setup exists yet).

## Configuration & Security
Keep playlist URL and response validation in `src/features/playlists/services/fetchPlaylist.ts`; never hardcode IPTV sources, secrets, or machine-specific paths. Review `src-tauri/capabilities/` and `tauri.conf.json` carefully because they control desktop permissions. Preserve Vite port `1420`, which must match Tauri's `build.devUrl`. Tailwind tokens belong in `src/App.css` under `@theme`.

## Commits & Pull Requests
Use Conventional Commits, such as `feat: add playlist refresh` or `fix: reject invalid M3U content`. Pull requests should summarize behavior, identify affected frontend or Tauri areas, link the issue, and include screenshots or recordings for UI changes.
