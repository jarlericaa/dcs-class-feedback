import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

/**
 * Screenshot the affected routes at the widths DESIGN.md §10 names.
 *
 * Not a test: it produces evidence a human can look at. The dev environment
 * cannot install Chromium's system libraries with sudo, so run it with
 * LD_LIBRARY_PATH pointing at a locally-extracted libnss3/libnspr4 — see
 * docs/UI-WORKFLOW-RECOVERY.md §5.
 */

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT ?? "docs/qa/shots";
const WIDTHS = [1440, 1280, 1024, 768, 390, 320];

const routes = JSON.parse(process.env.ROUTES ?? "[]");

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

async function session(email) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/signin`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', email);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/signin"), { timeout: 15000 }),
    page.click('form:has(input[name="email"]) button[type="submit"]'),
  ]);
  return { ctx, page };
}

const sessions = {
  teacher: await session("teacher@up.edu.ph"),
  student: await session("student@up.edu.ph"),
};

const report = [];
for (const { name, path, who } of routes) {
  const { page } = sessions[who];
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: width < 500 ? 780 : 900 });
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    await page.waitForTimeout(200);
    const metrics = await page.evaluate(() => {
      const d = document.documentElement;
      const overflowing = [...document.querySelectorAll("body *")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.right > d.clientWidth + 1;
        })
        .slice(0, 4)
        .map((el) => `${el.tagName.toLowerCase()}.${(el.className || "").toString().split(" ")[0]}`);
      return {
        bodyOverflow: d.scrollWidth > d.clientWidth + 1,
        scrollWidth: d.scrollWidth,
        clientWidth: d.clientWidth,
        overflowing,
      };
    });
    await page.screenshot({
      path: `${OUT}/${name}-${width}.png`,
      fullPage: width >= 500,
    });
    report.push({ name, who, path, width, ...metrics });
  }
}
console.log(JSON.stringify(report, null, 1));
await browser.close();
