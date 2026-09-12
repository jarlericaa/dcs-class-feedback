import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Where the build output goes, overridable by the environment.
   *
   * This exists to defuse a documented footgun rather than to configure
   * anything: `npm run build` and `npm run dev` share `.next`, so building
   * while the dev server is up replaces the module graph underneath it and
   * every route starts returning 500 — which reads exactly like a code defect
   * and is not one. It has already cost this project one debugging session
   * (AGENTS.md records the rule that came out of it).
   *
   * With this, a verification build can be sent somewhere else entirely:
   *
   *   NEXT_DIST_DIR=.next-verify npm run build
   *
   * Unset, the default `.next` is used, so nothing about a normal build or
   * deploy changes.
   */
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
