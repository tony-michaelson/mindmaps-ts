import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  use: {
    baseURL: "http://localhost:5180", // Vite test port
    browserName: "chromium",
    viewport: { width: 1280, height: 800 },
    screenshot: "on",
    video: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 5180",
    port: 5180,
    reuseExistingServer: !process.env.CI,
  },
});
