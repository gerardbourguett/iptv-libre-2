// Verifies the libmpv DLLs in src-tauri/lib against scripts/mpv-lib.lock.json.
// Usage: node scripts/verify-mpv-lib.mjs [--lock <path>]
// Exit code 0 = all files present and matching; 1 = missing or mismatched.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const LIB_DIR = join(root, "src-tauri", "lib");
export const DEFAULT_LOCK = join(root, "scripts", "mpv-lib.lock.json");

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function readLock(lockPath = DEFAULT_LOCK) {
  return JSON.parse(readFileSync(lockPath, "utf8"));
}

/** Returns a list of human-readable problems; empty means verified. */
export function verifyLib(lock = readLock()) {
  const problems = [];
  for (const [name, expected] of Object.entries(lock.files)) {
    const path = join(LIB_DIR, name);
    if (!existsSync(path)) {
      problems.push(`${name}: missing (run "pnpm setup:mpv")`);
      continue;
    }
    const size = statSync(path).size;
    if (size !== expected.size) {
      problems.push(`${name}: size ${size} != expected ${expected.size}`);
      continue;
    }
    const actual = sha256File(path);
    if (actual !== expected.sha256) {
      problems.push(`${name}: sha256 ${actual} != expected ${expected.sha256}`);
    }
  }
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf("--lock");
  const lockPath = i > -1 ? resolve(process.argv[i + 1]) : DEFAULT_LOCK;
  const problems = verifyLib(readLock(lockPath));
  if (problems.length > 0) {
    console.error("libmpv verification FAILED:");
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log("libmpv DLLs verified against scripts/mpv-lib.lock.json");
}
