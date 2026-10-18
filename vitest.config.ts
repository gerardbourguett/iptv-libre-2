import { defineConfig } from "vitest/config";

// Kept separate from vite.config.ts so the Tauri dev-server settings stay untouched.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
