import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["node_modules/**", "tests/e2e/**"],
  },
  resolve: {
    // Same "@" alias as tsconfig.json, so route modules (which import
    // "@/lib/...") can be tested directly.
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
