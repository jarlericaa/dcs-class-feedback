import { chromium } from "playwright";

/**
 * Cognitive walkthrough, driven.
 *
 * Each step records the four walkthrough questions as observable facts: is the
 * control present (visibility), does acting on it change state (feedback), and
 * does the result say what happened. A step that cannot find its control is a
 * Failure, not a skipped assertion.
 */

const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const note = (journey, step, verdict, detail) => {
  results.push({ journey, step, verdict, detail });
  console.log(`${verdict.padEnd(10)} ${journey} — ${step}${detail ? `: ${detail}` : ""}`);
};

const browser = await chromium.launch();

async function signIn(email) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 120)));
  await page.goto(`${BASE}/signin`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', email);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/signin"), { timeout: 15000 }),
    page.click('form:has(input[name="email"]) button[type="submit"]'),
  ]);
  return { page, errors };
}

// ---- Journey 1: teacher creates a one-time form, end to end ---------------
{
  const J = "teacher/create-one-time-form";
  const { page, errors } = await signIn("teacher@up.edu.ph");
  await page.goto(`${BASE}/teach/courses`, { waitUntil: "networkidle" });
  const courseLink = await page.$('a[href^="/teach/courses/"]');
  note(J, "find a course from My courses", courseLink ? "PASS" : "FAILURE");
  // waitForURL, not waitForLoadState: the old page is already idle, so
  // waiting on load state resolves before navigation even starts.
  await Promise.all([page.waitForURL(/\/teach\/courses\/[0-9a-f-]{36}$/), courseLink.click()]);
  await page.waitForLoadState("networkidle");

  const newForm = await page.$('a:has-text("New form")');
  note(J, "New form is a header action", newForm ? "PASS" : "FAILURE");
  await Promise.all([page.waitForURL(/\/forms\/new$/), newForm.click()]);
  await page.waitForLoadState("networkidle");

  // details
  await page.fill('input[name="title"]', "Course evaluation");
  await page.fill('input[name="purpose"]', "End of term");
  note(J, "name the form", "PASS");

  // delivery: one time
  const oneTime = await page.$('input[name="deliveryMode"][value="one_time"]');
  note(J, "choose a non-weekly delivery mode", oneTime ? "PASS" : "FAILURE");
  await oneTime.check();
  await page.waitForTimeout(150);

  const openDate = await page.$('input[name="openDate"]');
  note(
    J,
    "one-time mode reveals its own window fields (no weekday controls)",
    openDate && !(await page.$('select[name="openDayOfWeek"]')) ? "PASS" : "FAILURE",
  );
  await page.fill('input[name="openDate"]', "2026-09-01");
  await page.fill('input[name="deadlineDate"]', "2026-09-08");

  // The prompt field, found by its visible label rather than by position —
  // the first text input inside .q-item is an answer choice, not the prompt.
  const promptField = page.getByLabel("Question text").first();
  await promptField.fill("How was the course overall?");
  note(J, "author a question", (await promptField.inputValue()) ? "PASS" : "FAILURE");

  const preview = await page.$('button:has-text("Preview form")');
  note(J, "preview before saving", preview ? "PASS" : "HESITATION");
  if (preview) {
    await preview.click();
    await page.waitForTimeout(400);
    const dlg = await page.$("dialog.preview[open]");
    note(J, "preview opens as the real student form", dlg ? "PASS" : "FAILURE");
    const close = await page.$('dialog.preview button:has-text("Close")');
    if (close) await close.click();
    await page.waitForTimeout(200);
  }

  const save = await page.$('button:has-text("Save form")');
  note(J, "save is reachable", save ? "PASS" : "FAILURE");
  const before = page.url();
  // A server action round-trip plus redirect takes longer than networkidle on
  // the page we are leaving; wait for the URL to actually change.
  await save.click();
  await page
    .waitForURL((u) => u.toString() !== before, { timeout: 20000 })
    .catch(() => {});
  await page.waitForLoadState("networkidle");
  const moved = page.url() !== before;
  const banner = await page.$(".alert--success, .alert--error");
  const bannerText = banner ? (await banner.innerText()).slice(0, 90) : "";
  note(
    J,
    "saving lands on the form and says what happened",
    moved && banner ? "PASS" : "FAILURE",
    `${page.url().replace(BASE, "")} | ${bannerText}`,
  );
  note(J, "no client errors during the journey", errors.length === 0 ? "PASS" : "FAILURE", errors[0] ?? "");
  await page.context().close();
}

// ---- Journey 2: student answers, submits, edits, finds the reply ----------
{
  const J = "student/answer-submit-edit";
  const { page, errors } = await signIn("student@up.edu.ph");
  await page.goto(BASE, { waitUntil: "networkidle" });

  const cards = await page.$$('a[href^="/forms/"]');
  note(J, "open forms are on the overview", cards.length > 0 ? "PASS" : "FAILURE",
    `${cards.length} card(s)`);
  // Deliberately the LAST card: the seed's one-time LE form. The weekly one
  // would make a "no weekly language" check meaningless — "Week 7" is correct
  // there. The point is that a NON-weekly form never inherits that voice.
  const card = cards[cards.length - 1];
  await Promise.all([page.waitForURL(/\/forms\/[0-9a-f-]{36}$/), card.click()]);
  await page.waitForLoadState("networkidle");
  const heading = await page.locator("h1").first().innerText();
  note(J, "the form is named by its own title", heading ? "PASS" : "FAILURE", heading);

  const submitBtn = await page.$('button:has-text("Submit"), button:has-text("Save changes")');
  note(J, "one obvious submit action", submitBtn ? "PASS" : "FAILURE",
    submitBtn ? await submitBtn.innerText() : "");

  const deadline = await page.locator(".page-head").innerText();
  note(J, "deadline is stated before answering", /Closes/i.test(deadline) ? "PASS" : "FAILURE");
  // Chrome only. A teacher may legitimately WRITE "this week" in a question;
  // what must never be weekly is the product's own wording around it.
  const chrome = [
    await page.locator(".page-head").innerText(),
    await page.locator(".submit-bar").innerText().catch(() => ""),
    await page.locator(".own-item__note").first().innerText().catch(() => ""),
  ].join(" ");
  note(
    J,
    "no weekly language in the product's own copy",
    /this week|weekly/i.test(chrome) ? "FAILURE" : "PASS",
  );

  await submitBtn.click();
  await page.waitForTimeout(1200);
  const status = await page.$(".alert--success, .submit-bar__note");
  note(J, "submitting reports what is now true", status ? "PASS" : "FAILURE",
    status ? (await status.innerText()).slice(0, 80) : "");

  // history
  await page.goto(BASE, { waitUntil: "networkidle" });
  const hist = await page.$('a[href*="/history"]');
  note(J, "submissions reachable from the overview rail", hist ? "PASS" : "FAILURE");
  if (hist) {
    await page.goto(BASE + (await hist.getAttribute("href")), {
      waitUntil: "networkidle",
    });
    const h1 = await page.locator("h1").first().innerText();
    note(J, "history names itself", h1 ? "PASS" : "FAILURE", h1);
  }
  await page.goto(BASE, { waitUntil: "networkidle" });
  const qa = await page.$('a[href*="/qa"]');
  note(J, "class Q&A reachable from the overview rail", qa ? "PASS" : "FAILURE");
  note(J, "no client errors during the journey", errors.length === 0 ? "PASS" : "FAILURE", errors[0] ?? "");
  await page.context().close();
}

await browser.close();
const fail = results.filter((r) => r.verdict === "FAILURE").length;
const hes = results.filter((r) => r.verdict === "HESITATION").length;
console.log(`\npass=${results.length - fail - hes} hesitation=${hes} failure=${fail}`);
process.exit(fail > 0 ? 1 : 0);
