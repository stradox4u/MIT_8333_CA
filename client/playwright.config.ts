import { defineConfig, devices } from "@playwright/test";

const appUrl = process.env.BROWSER_APP_URL ?? "http://127.0.0.1:5173";
const port = new URL(appUrl).port;

export default defineConfig({
  testDir: "./test/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: appUrl,
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
      command: `npm run dev -- --port ${port}`,
      url: appUrl,
      env: { API_PROXY_TARGET: "http://127.0.0.1:4174" },
      timeout: 60_000,
      reuseExistingServer: false,
    },
  ],
});
