# Repository Guidelines

## Project Structure & Architecture
OpenTV (`libre-iptv-2`) is a Tauri v2 IPTV desktop app with a React 19, TypeScript, Vite 7, and Tailwind 4 frontend.

- `src/` contains the WebView application, the app shell (`App.tsx`), and the single Zustand store (`store.ts`).
- `src/features/` groups domains: `channels/`, `player/`, `playlists/`, and `profiles/`. Keep UI in `components/`, parsing in `parser/`, and network access in `services/` where those folders exist.
- `src/features/playlists/` owns M3U parsing, playlist fetching, validation, and shared domain types.
- `src-tauri/` is currently close to the default Rust scaffold. Do not assume a feature has Rust backend support without checking.
- `public/` and `src/assets/` contain static assets. Never edit generated `dist/` or `src-tauri/target/` output.

The app has no router: `App.tsx` switches between welcome and main screens after Zustand hydration. Persistent data uses `localStorage`; playlist networking uses WebView `fetch`. Playback uses `hls.js` with native HLS fallback.

## Build, Test, and Development Commands
Use **pnpm** exclusively because `pnpm-lock.yaml` is authoritative.

- `pnpm install` — install dependencies.
- `pnpm dev` — run only the Vite frontend.
- `pnpm tauri dev` — run the complete desktop app and exercise Tauri capabilities.
- `pnpm build` — run strict TypeScript checks, then build the frontend.
- `pnpm tauri build` — package the desktop application.

No test runner or linter is configured. Do not claim test coverage or invent test commands. TypeScript compiler checks are the current automated validation.

## Coding Style & Naming Conventions
Use 2-space indentation for TypeScript/React and `rustfmt` defaults for Rust. Name React component files in `PascalCase` (`VideoPlayer.tsx`); use `camelCase` for functions, variables, and Zustand actions; keep feature directories lowercase. Imports are relative because no path aliases exist.

Place frontend tests beside their modules as `*.test.ts` or `*.test.tsx`; place Rust unit tests under `#[cfg(test)]`. Add and document a runner before introducing frontend test commands.

## Configuration & Security
Keep playlist URL and response validation in `src/features/playlists/services/fetchPlaylist.ts`; never hardcode IPTV sources, secrets, or machine-specific paths. Review `src-tauri/capabilities/` and `tauri.conf.json` carefully because they control desktop permissions. Preserve Vite port `1420`, which must match Tauri's `build.devUrl`. Tailwind tokens belong in `src/App.css` under `@theme`.

## Commits & Pull Requests
Use Conventional Commits, such as `feat: add playlist refresh` or `fix: reject invalid M3U content`. Pull requests should summarize behavior, identify affected frontend or Tauri areas, link the issue, and include screenshots or recordings for UI changes.
