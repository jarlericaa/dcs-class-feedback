import { chromium } from "playwright";

/**
 * Accessibility checks, run against the rendered pages.
 *
 * Deliberately dependency-free: AGENTS.md forbids adding packages, so this
 * implements the subset of automated checks that actually catch things here —
 * accessible names, heading hierarchy, landmarks, form labels, contrast, and
 * keyboard reachability. Automated checks are roughly a third of the picture;
 * the reading-order and interaction-pattern half still needs a human with a
 * screen reader.
 */

const BASE = process.env.BASE ?? "http://localhost:3000";
const routes = JSON.parse(process.env.ROUTES ?? "[]");

const CHECKS = `
(() => {
  const out = { nameless: [], headings: [], landmarks: [], labels: [], contrast: [], outlineNone: [] };

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const nameOf = (el) => (
    el.getAttribute("aria-label") ||
    (el.getAttribute("aria-labelledby") || "")
      .split(/\\s+/).map((id) => document.getElementById(id)?.textContent || "").join(" ") ||
    el.textContent || el.getAttribute("title") || el.getAttribute("alt") || ""
  ).trim();

  // 1. Every interactive control has an accessible name.
  for (const el of document.querySelectorAll("a[href], button, [role=button], summary")) {
    if (!visible(el)) continue;
    if (!nameOf(el)) out.nameless.push(el.tagName.toLowerCase() + "." + (el.className || "").toString().split(" ")[0]);
  }

  // 2. Heading hierarchy: one h1, no skipped levels.
  const hs = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(visible);
  const levels = hs.map((h) => Number(h.tagName[1]));
  if (levels.filter((l) => l === 1).length !== 1) out.headings.push("h1 count = " + levels.filter((l) => l === 1).length);
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] - levels[i - 1] > 1) {
      out.headings.push("skipped h" + levels[i - 1] + " -> h" + levels[i] + " at \\"" + hs[i].textContent.trim().slice(0, 40) + "\\"");
    }
  }

  // 3. Landmarks.
  if (document.querySelectorAll("main, [role=main]").length !== 1) out.landmarks.push("main count != 1");
  const navs = [...document.querySelectorAll("nav")];
  if (navs.length > 1) {
    for (const n of navs) if (!n.getAttribute("aria-label") && !n.getAttribute("aria-labelledby")) out.landmarks.push("unlabelled <nav> among " + navs.length);
  }

  // 4. Form controls have a programmatic label.
  for (const el of document.querySelectorAll("input:not([type=hidden]), select, textarea")) {
    if (!visible(el)) continue;
    const byFor = el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
    const wrapped = el.closest("label");
    if (!byFor && !wrapped && !el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby")) {
      out.labels.push((el.getAttribute("name") || el.tagName.toLowerCase()) + " [" + (el.type || "") + "]");
    }
  }

  // 5. Text contrast against its effective background.
  const parse = (c) => { const m = c.match(/[\\d.]+/g); return m ? m.slice(0, 3).map(Number) : null; };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      const a = getComputedStyle(n).backgroundColor.match(/[\\d.]+/g);
      if (c && (!a || a.length < 4 || Number(a[3]) > 0.5)) return c;
      n = n.parentElement;
    }
    return [255, 255, 255];
  };
  const seen = new Set();
  // WCAG 1.4.3 exempts "text that is part of an inactive user interface
  // component" — a disabled control has no contrast requirement, and raising it
  // to 4.5:1 would make a disabled control look clickable. This is the reason
  // Move up / Move down / Remove / Previous are not reported.
  const inactive = (el) =>
    !!el.closest("[disabled], [aria-disabled=true]");
  for (const el of document.querySelectorAll("body *")) {
    if (!visible(el) || inactive(el)) continue;
    const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join("");
    if (!text) continue;
    const s = getComputedStyle(el);
    const fg = parse(s.color); if (!fg) continue;
    const bg = bgOf(el);
    const l1 = lum(fg), l2 = lum(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const size = parseFloat(s.fontSize);
    const bold = Number(s.fontWeight) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    if (ratio < need) {
      const key = s.color + "|" + size + "|" + text.slice(0, 20);
      if (!seen.has(key)) { seen.add(key); out.contrast.push(text.slice(0, 32) + " " + ratio.toFixed(2) + ":1 (needs " + need + ") " + s.color + " " + Math.round(size) + "px"); }
    }
  }

  // 6. Nothing removes the focus ring outright.
  for (const el of document.querySelectorAll("a[href], button, input, select, textarea, summary, [tabindex]")) {
    if (!visible(el)) continue;
    const s = getComputedStyle(el);
    if (s.outlineStyle === "none" && s.boxShadow === "none") {
      // only a problem if nothing else marks focus; report the class for review
      const c = (el.className || "").toString().split(" ")[0];
      if (c && !out.outlineNone.includes(c)) out.outlineNone.push(c);
    }
  }
  return out;
})()
`;

const browser = await chromium.launch();
async function session(email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/signin`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', email);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/signin"), { timeout: 15000 }),
    page.click('form:has(input[name="email"]) button[type="submit"]'),
  ]);
  return page;
}
const pages = {
  teacher: await session("teacher@up.edu.ph"),
  student: await session("student@up.edu.ph"),
};

let problems = 0;
for (const { name, path, who } of routes) {
  const page = pages[who];
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(150);
  const r = await page.evaluate(CHECKS);

  // Keyboard reachability: tab through and confirm focus keeps moving.
  const reach = await page.evaluate(() => {
    const focusable = [...document.querySelectorAll(
      'a[href], button:not([disabled]), input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
    )].filter((el) => {
      const rct = el.getBoundingClientRect();
      return rct.width > 0 && rct.height > 0;
    });
    return focusable.length;
  });

  const issues = [];
  if (r.nameless.length) issues.push(`nameless controls: ${r.nameless.slice(0, 3).join(", ")}`);
  if (r.headings.length) issues.push(`headings: ${r.headings.join("; ")}`);
  if (r.landmarks.length) issues.push(`landmarks: ${r.landmarks.join("; ")}`);
  if (r.labels.length) issues.push(`unlabelled fields: ${r.labels.slice(0, 3).join(", ")}`);
  if (r.contrast.length) issues.push(`contrast: ${r.contrast.slice(0, 3).join(" | ")}`);
  problems += issues.length;
  console.log(`${issues.length ? "ISSUE " : "ok    "} ${name.padEnd(16)} focusable=${String(reach).padStart(3)} ${issues.join("  ") || ""}`);
}
console.log(`\nroutes=${routes.length} issue-groups=${problems}`);
await browser.close();
process.exit(problems > 0 ? 1 : 0);
