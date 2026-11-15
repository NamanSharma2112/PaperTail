import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": resolve(__dirname), "server-only": resolve(__dirname, "tests/server-only-stub.ts") } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 30000,
    fileParallelism: false,
    // The pool connects lazily; pure tests never reach this address. Integration tests
    // replace it with TEST_DATABASE_URL before importing the database module.
    env: { DATABASE_URL: process.env.DATABASE_URL ?? "postgres://unused:unused@127.0.0.1:1/unused", BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-00" },
  },
});
