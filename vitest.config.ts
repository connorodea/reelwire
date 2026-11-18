import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "worker/**/*.test.ts"],
    globals: false,
    testTimeout: 10_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      // The 100% gate applies to unit-testable business logic only. Framework
      // shells (Next.js app, Remotion compositions, worker entrypoint) and pure
      // config/infra (env validation, prisma client singleton) are integration
      // concerns, exercised end-to-end rather than unit-covered.
      include: ["src/lib/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "**/__fixtures__/**",
        "**/index.ts", // re-export barrels
        "**/types.ts", // type-only declarations
        "src/lib/env.ts", // env validation (infra)
        "src/lib/db.ts", // prisma client singleton (infra)
      ],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
