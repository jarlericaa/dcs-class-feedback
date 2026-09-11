import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  /* `automatic`, so a `.test.tsx` needs no `import React`. The app's own files
     rely on the same transform via `tsconfig.json`'s `"jsx": "preserve"` plus
     the Next compiler; vitest uses esbuild and has to be told separately. */
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Resolved by the Next bundler at build time; stubbed for tests so a
      // server-only module stays importable from a unit test.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
          setupFiles: ["tests/setup-domains.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: [
            "tests/setup-domains.ts",
            "tests/integration/setup-env.ts",
          ],
          // Integration tests share one Postgres database; run serially.
          maxConcurrency: 1,
          pool: "forks",
          poolOptions: { forks: { singleFork: true } },
        },
      },
    ],
  },
});
