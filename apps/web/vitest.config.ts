import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    passWithNoTests: true,
    env: {
      DATABASE_URL: process.env["DATABASE_URL"] ?? "postgres://campaign:campaign_dev@localhost:5432/campaign_db",
      AUTH_SECRET: process.env["AUTH_SECRET"] ?? "dev-secret-change-in-production-min-32-chars",
    },
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
