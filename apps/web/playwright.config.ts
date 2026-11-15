import { defineConfig } from "@playwright/test";

// End-to-end test of the complete workflow against a running PaperTrail
// (npm run dev or the Docker image). Needs network access to arXiv and Python 3.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "off",
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
});
