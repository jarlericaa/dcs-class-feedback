import { chromium } from "@playwright/test";

/**
 * The design system's invariants, asserted against the RENDERED page.
 *
 * Why this exists, and why it is not another grep. On 2026-09-11 the owner
 * reported that the `More` flyout was not rounded. It was not — and the same
 * sweep turned up three more faults of the same kind, every one of which had
 * survived a clean `typecheck`, a clean `lint`, 233 passing tests and several
 * rounds of review:
 *
 *   - `--spacing-control` declared **38px** and every button in the app drew
 *     **41**, because `min-height` is a floor and the padding overshot it. The
 *     token, the DESIGN.md prose and the component comment all said 38.
 *   - an input drew 39 beside a select drawing 38, one pixel apart in the same
 *     row.
 *   - `EmptyState` built `class="button button--primary"` by interpolation, so
 *     DESIGN-TODO §7's `grep '<button'` could not see it: it is an `<a>`, and
 *     the class never appears as a literal string.
 *   - the shared `Dialog` attached no `close` listener at all (a `useEffect`
 *     with `[]` deps running before the portal mounted), so Escape desynced
 *     its state and no dialog in the app could be reopened.
 *
 * **None of those is visible in the source.** Two are arithmetic between a
 * class, a font and a border; one hides inside a template literal; one is a
 * hook dependency. They are all trivially visible once something reads
 * `getComputedStyle` off a real page — which is what this does.
 *
 * It is a script rather than a test because it needs the app running, and
 * `tests/unit/theme-tokens.test.ts` already holds everything that can be
 * decided from the stylesheet alone. Run both:
 *
 *   npm run dev &                 # or against any running instance
 *   npm run design:check
 *
 * Exit code is 0 only when every invariant holds on every route walked.
 */

const BASE = process.env.BASE ?? "http://localhost:3000";
const TEACHER = process.env.QA_TEACHER ?? "teacher@up.edu.ph";

/** The three radius steps DESIGN.md §5 declares, plus `0` for squared edges. */
const RADII = new Set(["0px", "5px", "6px", "12px"]);

/**
 * Elements exempt from the radius rule, by SHAPE rather than by name: a sheet
 * pinned to the viewport's own edges has no free corner to round. Matched on
 * the rendered geometry so a renamed component stays exempt and a repositioned
 * one stops being.
 */
function isFullBleed(rect, viewport) {
  return (
    rect.left <= 0 && Math.round(rect.right) >= viewport.width && rect.height > 0
  );
}

const failures = [];
const checked = { elements: 0, routes: 0 };

function fail(route, message) {
  failures.push(`${route}\n    ${message}`);
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();

/* A page error is itself a failure — a hydration mismatch or a thrown effect
   invalidates every measurement taken after it. */
page.on("pageerror", (error) => fail("(browser)", `page error: ${error}`));
page.on("console", (message) => {
  if (message.type() === "error") fail("(browser)", `console: ${message.text()}`);
});

await page.goto(`${BASE}/signin`, { waitUntil: "networkidle" });
await page.fill('input[name="email"]', TEACHER);
await Promise.all([
  page.waitForURL((url) => !url.pathname.startsWith("/signin"), {
    timeout: 15000,
  }),
  page.click('form:has(input[name="email"]) button[type="submit"]'),
]);

await page.goto(`${BASE}/teach/courses`, { waitUntil: "networkidle" });
const courseId = await page.evaluate(
  () =>
    document
      .querySelector('a[href^="/teach/courses/"]')
      ?.getAttribute("href")
      ?.split("/")[3] ?? null,
);
if (!courseId) {
  console.error("No course to walk — seed the database first (npm run db:seed).");
  process.exit(2);
}

const ROUTES = [
  "/",
  "/teach/courses",
  `/teach/courses/${courseId}`,
  `/teach/courses/${courseId}/responses`,
  `/teach/courses/${courseId}/sections`,
  `/teach/courses/${courseId}/staff`,
  `/teach/courses/${courseId}/forms/new`,
];

/**
 * Everything decidable from one painted page.
 *
 * Runs in the browser and returns plain data, so the assertions stay here and
 * the page only reports. Each finding names the element the way a person would
 * find it again — tag, first class, and its own text.
 */
function audit() {
  const name = (el) =>
    `${el.tagName.toLowerCase()}.${(el.className || "").toString().split(" ")[0] || "—"}` +
    `"${(el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 22)}"`;

  const out = { heights: [], radii: [], floating: [], count: 0 };

  for (const el of document.querySelectorAll("button, a, input, select, summary")) {
    if (!el.getClientRects().length) continue;
    out.count += 1;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();

    /*
      A declared floor that the element overshoots. Only meaningful for a
      single-line control: a label long enough to wrap is SUPPOSED to grow the
      control, which is why the height stays a minimum rather than becoming
      fixed. Line count is measured from the scroll height rather than guessed
      from the text.
    */
    const min = Number.parseFloat(style.minHeight);
    if (Number.isFinite(min) && min >= 20) {
      const leading = Number.parseFloat(style.lineHeight);
      const inner =
        el.scrollHeight -
        Number.parseFloat(style.paddingTop) -
        Number.parseFloat(style.paddingBottom);
      const lines = Number.isFinite(leading) && leading > 0
        ? Math.round(inner / leading)
        : 1;
      if (lines <= 1 && Math.abs(rect.height - min) > 0.6) {
        out.heights.push(
          `${name(el)} declares min-height ${min}px and renders ${Math.round(rect.height)}px`,
        );
      }
    }
  }

  for (const el of document.querySelectorAll("*")) {
    if (!el.getClientRects().length) continue;
    const style = getComputedStyle(el);

    for (const corner of new Set(
      style.borderRadius.split(/[\s/]+/).filter(Boolean),
    )) {
      if (corner === "0" || corner.endsWith("%")) continue;
      out.radii.push({ el: name(el), value: corner });
    }

    // The one elevation in the system. Carrying it is the definition of a
    // surface that paints over the page, and such a surface is a panel.
    if (style.boxShadow !== "none" && /\brgba?\([^)]*0\.1[0-9]?\)/.test(style.boxShadow)) {
      const rect = el.getBoundingClientRect();
      out.floating.push({
        el: name(el),
        radius: style.borderRadius,
        rect: { left: rect.left, right: rect.right, height: rect.height },
      });
    }
  }
  return out;
}

for (const route of ROUTES) {
  await page.goto(BASE + route, { waitUntil: "networkidle" });
  checked.routes += 1;
  const result = await page.evaluate(audit);
  checked.elements += result.count;

  for (const message of result.heights) fail(route, message);

  for (const { el, value } of result.radii) {
    if (!RADII.has(value)) {
      fail(route, `${el} has border-radius ${value}, off the 6/5/12 scale`);
    }
  }

  const viewport = page.viewportSize();
  for (const { el, radius, rect } of result.floating) {
    if (radius === "0px" && !isFullBleed(rect, viewport)) {
      fail(route, `${el} floats over the page with no radius`);
    }
  }
}

/**
 * And the part no measurement of a single frame can see: whether the chrome
 * still works after you use it. Escape used to close a dialog visually while
 * leaving its state open, so the trigger was dead for the rest of the page's
 * life — the exact defect this walk exists to catch.
 */
await page.goto(`${BASE}/teach/courses`, { waitUntil: "networkidle" });
const trigger = page.locator('button:has-text("New course")');
if (await trigger.count()) {
  const openCount = () => page.locator("dialog[open]").count();
  await trigger.click();
  await page.waitForSelector("dialog[open]", { timeout: 5000 });
  if ((await openCount()) !== 1) fail("/teach/courses", "dialog did not open");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  if ((await openCount()) !== 0) fail("/teach/courses", "Escape did not close the dialog");
  await trigger.click();
  await page.waitForTimeout(400);
  if ((await openCount()) !== 1) {
    fail(
      "/teach/courses",
      "dialog could not be REOPENED after Escape — its state and its `open` attribute have desynced",
    );
  }
  await page.mouse.click(20, 20);
  await page.waitForTimeout(300);
  if ((await openCount()) !== 0) {
    fail("/teach/courses", "a click on the backdrop did not close the dialog");
  }
}

/**
 * And that a refused field reads as refused.
 *
 * The defect this exists for: pressing submit with a required field empty left
 * its border `rgb(11, 90, 51)` — `--color-accent`. The browser focuses the
 * field it would not submit, and the focus treatment outranked the invalid one,
 * so **the field that blocked the submission was painted in the colour that
 * means *action* everywhere else in the app.** Nothing static could see it: it
 * is the interaction of two variants at equal specificity, decided after a
 * click.
 */
const RED_FAMILY = new Set(["rgb(143, 34, 38)", "rgb(123, 17, 19)"]);
await page.goto(`${BASE}/teach/courses`, { waitUntil: "networkidle" });
if (await page.locator('button:has-text("New course")').count()) {
  await page.click('button:has-text("New course")');
  await page.waitForSelector("dialog[open]", { timeout: 5000 });
  const field = page.locator('dialog[open] input[name="code"]');

  const pristine = await field.evaluate((el) => getComputedStyle(el).borderColor);
  if (RED_FAMILY.has(pristine)) {
    fail("/teach/courses", `an untouched required field is already red (${pristine}) — :invalid was styled where :user-invalid was meant`);
  }

  await page.click('dialog[open] button:has-text("Create course")');
  await page.waitForTimeout(400);
  const refused = await field.evaluate((el) => ({
    border: getComputedStyle(el).borderColor,
    background: getComputedStyle(el).backgroundColor,
    stillOpen: !!el.closest("dialog[open]"),
  }));
  if (!refused.stillOpen) {
    fail("/teach/courses", "an empty required field did not block submission");
  } else if (!RED_FAMILY.has(refused.border)) {
    fail(
      "/teach/courses",
      `a field that blocked submission is ${refused.border}, not the red family — the focus treatment is outranking the invalid one`,
    );
  }
}

/**
 * A composite control still shows focus somewhere.
 *
 * `.feedbar__search input:focus-visible { outline: none }` is the **only**
 * `outline: none` in this codebase, and DESIGN.md §10 says the ring is never
 * removed. It is not removed — it is moved to the wrapper, which is the element
 * a reader perceives as the control (§12l.1). That claim is exactly the kind
 * that rots, so it is asserted rather than trusted: focus the inner input and
 * *something* in the composite must draw a ring.
 */
await page.goto(`${BASE}/teach/courses/${courseId}/responses`, {
  waitUntil: "networkidle",
});
const search = page.locator('.feedbar__search input').first();
if (await search.count()) {
  await search.focus();
  await page.waitForTimeout(120);
  const ring = await search.evaluate((input) => {
    const rings = [];
    for (let n = input; n && n !== document.body; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) {
        rings.push({
          on: n === input ? "the input" : (n.className || "").toString().split(" ")[0],
          width: s.outlineWidth,
        });
      }
    }
    return rings;
  });
  if (ring.length === 0) {
    fail(
      "/teach/courses/:id/responses",
      "the search bar is focused and NOTHING in the composite draws a focus ring — `outline: none` on the input is only legal because the wrapper rings instead",
    );
  } else if (ring.length > 1) {
    fail(
      "/teach/courses/:id/responses",
      `the focused search bar draws ${ring.length} rings (${ring.map((r) => r.on).join(" + ")}) — one focus, one indicator`,
    );
  }
}

await browser.close();

console.log(
  `design-check: ${checked.routes} routes, ${checked.elements} controls measured`,
);
if (failures.length === 0) {
  console.log("design-check: every invariant holds.");
  process.exit(0);
}
console.error(`\ndesign-check: ${failures.length} violation(s)\n`);
for (const failure of failures) console.error("  " + failure);
process.exit(1);
