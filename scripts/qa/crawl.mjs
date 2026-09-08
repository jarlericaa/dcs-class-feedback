import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const WHO = process.argv[2] ?? "teacher@up.edu.ph";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

// Development sign-in is a server action, not a plain POST endpoint, so this
// drives the real form rather than posting to a URL.
await page.goto(`${BASE}/signin`, { waitUntil: "networkidle" });
const emailField = await page.$('input[name="email"]');
if (!emailField) {
  console.error("NO DEV LOGIN FIELD — is DEV_AUTH_ENABLED=true?");
  process.exit(1);
}
await emailField.fill(WHO);
await Promise.all([
  page.waitForURL((u) => !u.pathname.startsWith("/signin"), { timeout: 15000 }),
  page.click('form:has(input[name="email"]) button[type="submit"]'),
]);

const seen = new Set();
const queue = ["/"];
const results = [];
const serverErrors = [];

page.on("console", (m) => {
  if (m.type() === "error") serverErrors.push(`console: ${m.text().slice(0, 140)}`);
});
page.on("pageerror", (e) => serverErrors.push(`pageerror: ${String(e).slice(0, 140)}`));

const norm = (href) => {
  try {
    const u = new URL(href, BASE);
    if (u.origin !== new URL(BASE).origin) return null;
    if (u.pathname.startsWith("/api/")) return null;
    // A file download is not a page: navigating to it aborts the navigation,
    // which would be reported as a broken route on every run. The CSV exports
    // are covered by scripts/verify/http-matrix.sh, which asserts their status
    // code and their header row.
    if (u.pathname.endsWith("/export")) return null;
    return u.pathname + u.search;
  } catch {
    return null;
  }
};

while (queue.length && seen.size < 120) {
  const path = queue.shift();
  if (seen.has(path)) continue;
  seen.add(path);
  const before = serverErrors.length;
  let status = 0;
  try {
    // networkidle + a beat: hydration errors only surface after React has run,
    // so domcontentloaded would report a clean page that breaks a moment later.
    const resp = await page.goto(BASE + path, { waitUntil: "networkidle" });
    status = resp?.status() ?? 0;
    await page.waitForTimeout(250);
  } catch (e) {
    results.push({ path, status: "NAV_FAIL", note: String(e).slice(0, 80) });
    continue;
  }
  const finalPath = norm(page.url());
  const info = await page.evaluate(() => {
    const h1 = [...document.querySelectorAll("h1")].map((n) => n.textContent.trim());
    const denied = document.body.innerText.includes("You do not have access");
    const errText = document.body.innerText.includes("Application error")
      || document.body.innerText.includes("Unhandled Runtime Error")
      || document.body.innerText.includes("This page could not be found");
    // horizontal overflow of the document
    const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    const links = [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href"));
    const buttons = [...document.querySelectorAll("button")].map((b) => b.textContent.trim()).filter(Boolean);
    return { h1, denied, errText, overflow, links, buttons, text: document.body.innerText.slice(0, 0) };
  });
  results.push({
    path,
    status,
    redirected: finalPath !== path ? finalPath : null,
    h1: info.h1,
    denied: info.denied,
    err: info.errText,
    overflow: info.overflow,
    newErrors: serverErrors.slice(before),
  });
  for (const href of info.links) {
    const n = norm(href);
    if (n && !seen.has(n)) queue.push(n);
  }
}

console.log(JSON.stringify({ who: WHO, count: results.length, results }, null, 1));
await browser.close();
