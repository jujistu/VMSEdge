import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  use: {
    baseURL: "http://localhost:3010",
    actionTimeout: 10000,
    channel: process.env.PLAYWRIGHT_CHANNEL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node test/browser-server.cjs",
      cwd: "../backend",
      url: "http://127.0.0.1:4010/api/v1/health/live",
      timeout: 60000,
      reuseExistingServer: false,
    },
    {
      command: "pnpm dev --host 127.0.0.1 --port 3010 --strictPort",
      url: "http://localhost:3010",
      env: { VITE_API_URL: "http://localhost:4010/api/v1" },
      timeout: 30000,
      reuseExistingServer: false,
    },
  ],
});
