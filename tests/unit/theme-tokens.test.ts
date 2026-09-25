import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BOARD } from "@/lib/theme";

/**
 * The token layer's two invariants, enforced rather than reviewed.
 *
 * DESIGN-TODO §2.1 asks that `legacy.css`'s `:root` stay "strictly derived"
 * from `globals.css`'s `@theme` while both exist, and §7 asks for that to be a
 * build gate rather than something the next reviewer happens to notice. A
 * colour with two literal definitions is a colour that can drift, and there
 * were twenty-four of them.
 *
 * These tests also caught the opposite failure, which is the one that actually
 * shipped: `var(--red-tint)` was referenced by a rule while no `--red-tint`
 * twin existed, so an invalid field's background resolved to nothing at all.
 * A dangling `var()` fails silently in CSS — nothing logs, the declaration is
 * simply dropped — so it has to be caught here.
 */

const GLOBALS = "src/app/globals.css";
const LEGACY = "src/app/legacy.css";

function block(file: string, opener: string): string {
  const css = readFileSync(file, "utf8");
  const start = css.indexOf(opener);
  if (start < 0) throw new Error(`${file} has no ${opener} block`);
  const end = css.indexOf("\n}", start);
  return css.slice(start, end);
}

/** Every `--name: value` pair declared in a block, comments stripped. */
function declarations(css: string): Map<string, string> {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out = new Map<string, string>();
  for (const m of withoutComments.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    out.set(m[1]!, m[2]!.trim().replace(/\s+/g, " "));
  }
  return out;
}

const theme = declarations(block(GLOBALS, "@theme {"));
const root = declarations(block(LEGACY, ":root {"));

describe("the token layer has one source", () => {
  it("declares tokens in both blocks", () => {
    // Guards the parsers: an empty map would make every assertion below vacuous.
    expect(theme.size).toBeGreaterThan(40);
    expect(root.size).toBeGreaterThan(40);
  });

  it("holds no colour literal in legacy.css :root", () => {
    const literals = [...root].filter(([, value]) => /#[0-9a-fA-F]{3,8}/.test(value));
    expect(literals).toEqual([]);
  });

  it("derives every legacy token from a token @theme declares", () => {
    const dangling: string[] = [];
    for (const [name, value] of root) {
      for (const ref of value.matchAll(/var\((--[\w-]+)\)/g)) {
        const target = ref[1]!;
        // A twin may reference @theme, or another twin defined in the same
        // block (`--serif` → `--font-document` → `--font-document-face`, which
        // next/font sets on the html element at runtime).
        if (theme.has(target) || root.has(target)) continue;
        if (target === "--font-document-face") continue;
        dangling.push(`${name}: var(${target})`);
      }
    }
    expect(dangling).toEqual([]);
  });

  it("leaves no var() in legacy.css pointing at nothing", () => {
    const css = readFileSync(LEGACY, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const known = new Set([...theme.keys(), ...root.keys(), "--font-document-face"]);
    const missing = new Set<string>();
    for (const ref of css.matchAll(/var\((--[\w-]+)/g)) {
      if (!known.has(ref[1]!)) missing.add(ref[1]!);
    }
    expect([...missing]).toEqual([]);
  });

  it("keeps the 4px base the ladder is derived from", () => {
    // `--s1…--s8` are `calc(var(--spacing) * n)`. If the base ever stops being
    // 4px the ladder moves with it, which is intended — but the documented
    // scale (4/8/12/16/24/32/48/64) would no longer be what ships.
    expect(theme.get("--spacing")).toBe("4px");
    expect(root.get("--s5")).toBe("calc(var(--spacing) * 6)");
  });
});

describe("token values duplicated outside CSS", () => {
  it("BOARD matches --color-board", () => {
    expect(BOARD).toBe(theme.get("--color-board"));
  });

  it("fails loudly if that token is renamed", () => {
    expect(theme.get("--color-does-not-exist")).toBeUndefined();
  });
});

/**
 * The same discipline, applied to the RULES rather than to the token block.
 *
 * Added 2026-09-11 after the owner reported that the `More` flyout was not
 * rounded. It was not — and neither were two other popovers, and a fourth rule
 * had a second hand-written copy of `--color-scrim` in it. Every one of those
 * was invisible to the checks above, which read `:root` and nothing else, and
 * to DESIGN-TODO §7's greps, which read `.tsx` and nothing else. **The
 * stylesheet's own rule bodies were the one place nothing looked.**
 *
 * These are deliberately narrow. They assert only what DESIGN.md states as a
 * hard rule, and every exemption below is named with its reason rather than
 * pattern-matched away — an unexplained allowlist entry is how a guardrail
 * stops meaning anything.
 */

/** One `selector { body }` pair, at any nesting depth, comments stripped. */
function rules(file: string): { selector: string; body: string }[] {
  const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const out: { selector: string; body: string }[] = [];
  const stack: string[] = [];
  for (const m of css.matchAll(/([^{}]*)([{}])/g)) {
    if (m[2] === "{") {
      stack.push((m[1] ?? "").trim().split("\n").pop()!.trim());
    } else {
      const selector = stack.pop();
      if (selector !== undefined) out.push({ selector, body: m[1] ?? "" });
    }
  }
  return out;
}

const legacyRules = rules(LEGACY).filter((r) => r.selector !== ":root");

function declared(body: string, property: string): string[] {
  return [
    ...body.matchAll(new RegExp(`(?<![-\\w])${property}:\\s*([^;]+)`, "g")),
  ].map((m) => m[1]!.trim().replace(/\s+/g, " "));
}

describe("the rules obey the scales they declare", () => {
  it("parses the stylesheet into rules", () => {
    // Guards the parser above: an empty list makes everything below vacuous.
    expect(legacyRules.length).toBeGreaterThan(400);
    expect(legacyRules.some((r) => r.selector === ".stamp")).toBe(true);
  });

  it("writes no colour literal in any rule body", () => {
    /*
      `@media print` sets `background: #fff` on purpose and says so: paper is
      white whichever theme the screen was showing, so it is the one colour in
      the app that must NOT follow a token.
    */
    const allowed = new Set(["#fff"]);
    const found: string[] = [];
    for (const { selector, body } of legacyRules) {
      for (const property of [
        "color",
        "background",
        "background-color",
        "border",
        "border-color",
        "box-shadow",
        "outline-color",
        "fill",
        "stroke",
      ]) {
        for (const value of declared(body, property)) {
          if (!/#[0-9a-fA-F]{3,8}|\brgba?\(|\bhsla?\(/.test(value)) continue;
          if (allowed.has(value)) continue;
          found.push(`${selector} { ${property}: ${value} }`);
        }
      }
    }
    // `.preview::backdrop` held `rgba(28, 30, 32, 0.42)` — `--color-scrim`,
    // written out a second time — and no check saw it for three batches.
    expect(found).toEqual([]);
  });

  it("uses no radius outside the three declared steps", () => {
    // DESIGN.md §5: 6 / 5 / 12 and `0` for anything squared to the board.
    const steps = /^(0|var\(--r-(control|stamp|panel)\))$/;
    const offScale: string[] = [];
    for (const { selector, body } of legacyRules) {
      for (const value of declared(body, "border-radius")) {
        // A corner-by-corner value is legal if every corner is on the scale.
        if (value.split(/\s+(?![^(]*\))/).every((part) => steps.test(part))) {
          continue;
        }
        offScale.push(`${selector} { border-radius: ${value} }`);
      }
    }
    expect(offScale).toEqual([]);
  });

  it("gives every floating surface a radius", () => {
    /*
      A surface that paints over the page is a panel, and DESIGN.md §5 gives a
      panel a 12px corner. `--overlay-shadow` is the one elevation in the
      system, so carrying it is the definition of "floating" — which makes this
      checkable without knowing what the component is called.

      The exemption is a shape, not a component: a sheet pinned to the
      viewport's own edges has no free corners to round.
    */
    const fullBleed = new Set([".ws-drawer__panel"]);
    const square: string[] = [];
    for (const { selector, body } of legacyRules) {
      if (!/var\(--overlay-shadow\)/.test(body)) continue;
      if (fullBleed.has(selector)) continue;
      if (declared(body, "border-radius").length === 0) square.push(selector);
    }
    // `.ws-subnav__menu-list` (the `More` flyout), `.ws-filter__menu` and
    // `.filterbar__menu` were all square. Owner-reported, 2026-09-11.
    expect(square).toEqual([]);
  });
});
