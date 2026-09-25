import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      ".next/**",
      // A verification build run while the dev server holds `.next`
      // (`NEXT_DIST_DIR=.next-verify npm run build` — see `next.config.ts`).
      // Build output is generated code and linting it reports 1,795 problems
      // that belong to Next, not to this repository.
      ".next-verify/**",
      "node_modules/**",
      "drizzle/**",
      "next-env.d.ts",
      // Agent skill packs, installed per machine and not part of this codebase
      // (.gitignore keeps them untracked for the same reason).
      ".agents/**",
      ".claude/**",
      ".codex/**",
      "agent/**",
    ],
  },
];

export default config;
