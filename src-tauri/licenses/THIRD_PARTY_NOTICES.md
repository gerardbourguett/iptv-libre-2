# Third-Party Notices

OpenTV bundles the following third-party components for native video playback.

## libmpv (mpv)

- License: GNU Lesser General Public License v2.1 or later (LGPL-2.1+). The bundled build is the "lgpl" variant of the mpv-winbuild project, which uses the LGPL-licensed FFmpeg build (no GPL or non-free components).
- File: `lib/libmpv-2.dll`, dynamically loaded at runtime (not statically linked into the application).
- Pinned build: `mpv-dev-lgpl-x86_64-20261018-git-6a262d11f6.7z` from https://github.com/zhongfly/mpv-winbuild/releases/tag/2026-10-18-6a262d11f6
- mpv source: https://github.com/mpv-player/mpv
- FFmpeg source: https://github.com/FFmpeg/FFmpeg
- Build recipes and corresponding source for the exact binary: https://github.com/zhongfly/mpv-winbuild

## libmpv-wrapper

- License: GNU Lesser General Public License v2.1 (LGPL-2.1).
- File: `lib/libmpv-wrapper.dll`, dynamically loaded at runtime.
- Pinned release: v0.1.1, https://github.com/nini22P/libmpv-wrapper/releases/tag/v0.1.1
- Source: https://github.com/nini22P/libmpv-wrapper

## tauri-plugin-libmpv

- License: Mozilla Public License 2.0 (MPL-2.0).
- Linked into the application (Rust crate `tauri-plugin-libmpv` 0.3.2 and npm package `tauri-plugin-libmpv-api` 0.3.2).
- Source: https://github.com/nini22P/tauri-plugin-libmpv

## Replacing the LGPL libraries

In accordance with the LGPL, you may replace the bundled libraries with your own modified or rebuilt versions:

1. Build or obtain a compatible `libmpv-2.dll` (and, if needed, `libmpv-wrapper.dll`).
2. Place the files next to the application executable inside the `lib` folder (the same folder that holds the bundled DLLs), overwriting the existing ones.
3. Restart the application.

When building from source, put your DLLs in `src-tauri/lib/` instead of running `pnpm setup:mpv`, or update `scripts/mpv-lib.lock.json` with your own pinned URLs and hashes.

## Source code offer

The source code for the LGPL components listed above is available at the URLs given in each section. The corresponding source for the exact pinned binaries is identified by the release tags above.
