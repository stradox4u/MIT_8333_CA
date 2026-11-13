import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./test/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm --prefix ../server run test:browser",
      url: "http://127.0.0.1:4175/health",
      timeout: 60_000,
      reuseExistingServer: false,
    },
    {
      command: "npm run dev",
      url: "http://127.0.0.1:5173",
      env: { API_PROXY_TARGET: "http://127.0.0.1:4174" },
      timeout: 60_000,
      reuseExistingServer: false,
    },
  ],
});
