import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      ".next/**",
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
