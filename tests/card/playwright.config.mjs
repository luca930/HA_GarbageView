import { defineConfig } from "@playwright/test";

// Test nel browser vero (Chromium). Se Chromium è altrove, imposta
// PW_CHROMIUM_PATH=/percorso/di/chrome.
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/test-results",
  reporter: "list",
  use: {
    viewport: { width: 520, height: 700 },
    deviceScaleFactor: 2, // screenshot nitidi
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
});
