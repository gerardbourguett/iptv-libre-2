// Downloads the pinned libmpv artifacts listed in scripts/mpv-lib.lock.json into
// src-tauri/lib and verifies them. tauri-plugin-libmpv-api's own `setup-lib`
// cannot pin a version (it always fetches "latest" and does not check hashes),
// so this script replaces it. 7z extraction reuses the 7z-wasm package that
// ships with tauri-plugin-libmpv-api, so no system 7z is needed.
// Usage: node scripts/setup-mpv-lib.mjs [--force] [--lock <path>]
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync, copyFileSync, renameSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { DEFAULT_LOCK, LIB_DIR, readLock, sha256File, verifyLib } from "./verify-mpv-lib.mjs";

const force = process.argv.includes("--force");
const li = process.argv.indexOf("--lock");
const lockPath = li > -1 ? resolve(process.argv[li + 1]) : DEFAULT_LOCK;
const lock = readLock(lockPath);

async function download(url, dest) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`download ${url} -> HTTP ${res.status} (release assets may have expired; update the pin)`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

async function extract(archivePath, outDir) {
  // realpath is required: pnpm links packages via junctions and 7z-wasm lives beside the real location.
  const pluginPkg = realpathSync(join(process.cwd(), "node_modules", "tauri-plugin-libmpv-api", "package.json"));
  const require = createRequire(pluginPkg);
  const SevenZip = require("7z-wasm");
  const sevenZip = await SevenZip({ print: () => {}, printErr: () => {} });
  sevenZip.FS.mkdir("/src");
  sevenZip.FS.mkdir("/dst");
  sevenZip.FS.mount(sevenZip.NODEFS, { root: dirname(archivePath) }, "/src");
  sevenZip.FS.mount(sevenZip.NODEFS, { root: outDir }, "/dst");
  try {
    sevenZip.callMain(["x", `/src/${basename(archivePath)}`, "-o/dst", "-y"]);
  } catch (err) {
    if (!(err && err.status === 0)) throw new Error(`7z extraction failed: ${err}`);
  } finally {
    try {
      sevenZip.FS.unmount("/src");
      sevenZip.FS.unmount("/dst");
    } catch {}
  }
}

function findFile(dir, name) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      const hit = findFile(full, name);
      if (hit) return hit;
    } else if (entry === name) {
      return full;
    }
  }
  return null;
}

function assertLock(lock) {
  const names = [...lock.archives.flatMap((a) => a.extract), ...Object.keys(lock.files)];
  for (const name of names) {
    if (basename(name) !== name) throw new Error(`lock file name must be a plain file name: ${name}`);
  }
  for (const a of lock.archives) {
    if (basename(a.name) !== a.name) throw new Error(`lock archive name must be a plain file name: ${a.name}`);
    if (new URL(a.url).protocol !== "https:") throw new Error(`lock url must be https: ${a.url}`);
    for (const f of a.extract) {
      if (!lock.files[f]) throw new Error(`${f} has no entry in lock.files`);
    }
  }
}

async function main() {
  assertLock(lock);
  if (!force && verifyLib(lock).length === 0) {
    console.log("libmpv DLLs already present and verified; nothing to do (use --force to re-download).");
    return;
  }

  const work = mkdtempSync(join(tmpdir(), "mpv-lib-"));
  try {
    // Stage and verify everything in the temp dir first; src-tauri/lib is untouched on any failure.
    const staged = [];
    for (const archive of lock.archives) {
      const archivePath = join(work, archive.name);
      console.log(`Downloading ${archive.name} ...`);
      await download(archive.url, archivePath);
      const actual = sha256File(archivePath);
      if (actual !== archive.sha256) throw new Error(`${archive.name}: sha256 ${actual} != pinned ${archive.sha256}`);
      const outDir = join(work, `${archive.name}.out`);
      mkdirSync(outDir, { recursive: true });
      await extract(archivePath, outDir);
      for (const file of archive.extract) {
        const found = findFile(outDir, file);
        if (!found) throw new Error(`${file} not found inside ${archive.name}`);
        const pin = lock.files[file];
        const size = statSync(found).size;
        const hash = sha256File(found);
        if (size !== pin.size || hash !== pin.sha256) {
          throw new Error(`${file}: extracted size/sha256 (${size}, ${hash}) != pinned (${pin.size}, ${pin.sha256})`);
        }
        staged.push({ file, path: found });
      }
    }

    // Install: copy to a temporary name inside lib, then rename, so an interruption never leaves a truncated DLL.
    mkdirSync(LIB_DIR, { recursive: true });
    for (const { file, path } of staged) {
      const tmp = join(LIB_DIR, `${file}.tmp`);
      copyFileSync(path, tmp);
      renameSync(tmp, join(LIB_DIR, file));
      console.log(`  installed ${file}`);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }

  const problems = verifyLib(lock);
  if (problems.length > 0) throw new Error(`post-install verification: ${problems.join("; ")}`);
  console.log("libmpv DLLs installed and verified.");
}

try {
  await main();
} catch (err) {
  console.error(`setup:mpv FAILED: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
