import { defineConfig } from "vitest/config";

// Test unitari della card: girano in happy-dom (un finto browser, veloce).
export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["tests/card/unit/**/*.test.mjs"],
  },
});
