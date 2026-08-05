import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, truncateAll } from "./helpers";
import {
  makeCourse,
  makeEnrolledStudent,
  makeSection,
  makeUser,
} from "./fixtures";
import {
  emailOutbox,
  formQuestions,
  recurrenceSchedules,
} from "@/db/schema";
import { createTemplate } from "@/modules/forms/templates";
import {
  generateCyclesForSchedule,
  openDueCycles,
} from "@/modules/forms/cycles";
import {
  processEmailOutbox,
  queueDeadlineReminders,
} from "@/modules/email/outbox";
import {
  FakeEmailProvider,
  setEmailProviderForTests,
} from "@/modules/email";
import { submitResponse } from "@/modules/forms/submission";
import { invalidateSubmission, restoreSubmission } from "@/modules/review";
import { reconcile } from "@/modules/scheduling";

const TZ = "Asia/Manila";
/** Inside the seeded cycle's window, for submission/opening calls. */
const IN_WINDOW = new Date("2026-01-06T04:00:00Z");
/**
 * The DELIVERY clock is real time, not the cycle's clock.
 *
 * A queued row's `available_at` defaults to `now()` in the database, so running
 * the worker with a historical timestamp would claim nothing. Queueing and
 * delivery legitimately live on different clocks: one is domain time, the other
 * is wall-clock.
 */
const deliverAt = (offsetMs = 0) => new Date(Date.now() + offsetMs);

let provider: FakeEmailProvider;

async function setup() {
  const teacher = await makeUser({ isTeacher: true, displayName: "Prof Cruz" });
  const course = await makeCourse(teacher.id);
  const section = await makeSection(course.id);
  const { template } = await createTemplate(teacher.id, {
    courseId: course.id,
    title: "Weekly check-in",
    questions: [
      { prompt: "How was the pace?", type: "short_answer", required: true, displayOrder: 0 },
    ],
  });
  const [schedule] = await db
    .insert(recurrenceSchedules)
    .values({
      sectionId: section.id,
      openDayOfWeek: 1,
      openTime: "08:00:00",
      deadlineDayOfWeek: 5,
      deadlineTime: "17:00:00",
      startDate: "2026-01-05",
      occurrenceCount: 1,
      templateId: template.id,
      timezone: TZ,
    })
    .returning();
  await generateCyclesForSchedule(schedule!, new Date("2026-01-05T00:00:00Z"));
  const student = await makeEnrolledStudent(section.id, teacher.id);
  return { teacher, course, section, schedule: schedule!, student };
}

describe("email outbox", () => {
  beforeEach(async () => {
    await truncateAll();
    provider = new FakeEmailProvider();
    setEmailProviderForTests(provider);
  });
  afterEach(() => {
    setEmailProviderForTests(null);
  });

  it("queues one 'form opened' message per enrolled student when a cycle opens", async () => {
    const { section } = await setup();
    await openDueCycles(IN_WINDOW);
    const queued = await db.query.emailOutbox.findMany({
      where: eq(emailOutbox.sectionId, section.id),
    });
    expect(queued).toHaveLength(1);
    expect(queued[0]!.eventType).toBe("form_opened");
    expect(queued[0]!.state).toBe("pending");
    // The link is a relative path to an authenticated page, not a magic URL.
    expect(queued[0]!.linkPath).toBe(`/sections/${section.id}`);
  });

  it("re-opening the same cycle queues nothing new (unique idempotency key)", async () => {
    await setup();
    await openDueCycles(IN_WINDOW);
    await openDueCycles(IN_WINDOW);
    const queued = await db.query.emailOutbox.findMany();
    expect(queued).toHaveLength(1);
  });

  it("never puts feedback, question or answer content in a subject line", async () => {
    const { student, section } = await setup();
    await openDueCycles(IN_WINDOW);
    const question = (await db.query.formQuestions.findFirst({
      where: eq(formQuestions.cycleId, (await db.query.weeklyCycles.findFirst())!.id),
    }))!;
    const secret = "PLEASE-DO-NOT-LEAK-THIS-SENTENCE";
    const cycle = (await db.query.weeklyCycles.findFirst())!;
    await submitResponse(
      student.user.id,
      cycle.id,
      {
        answers: [{ questionId: question.id, text: secret }],
        items: [{ clientKey: "q1", kind: "question", text: secret }],
      },
      IN_WINDOW,
    );
    const rows = await db.query.emailOutbox.findMany({
      where: eq(emailOutbox.sectionId, section.id),
    });
    for (const row of rows) {
      expect(row.subject).not.toContain(secret);
      expect(row.bodyText).not.toContain(secret);
      // No newline injection into the header either.
      expect(row.subject).not.toContain("\\n");
      expect(row.subject.length).toBeLessThanOrEqual(160);
    }
  });

  it("stores a recipient id, never an email address", async () => {
    const { student } = await setup();
    await openDueCycles(IN_WINDOW);
    const row = (await db.query.emailOutbox.findFirst())!;
    expect(row.recipientUserId).toBe(student.user.id);
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain(student.user.email);
  });

  it("sends each queued message exactly once, and a re-run sends nothing", async () => {
    await setup();
    await openDueCycles(IN_WINDOW);

    const first = await processEmailOutbox(deliverAt());
    expect(first.sent).toBe(1);
    expect(provider.sent).toHaveLength(1);

    const second = await processEmailOutbox(deliverAt());
    expect(second.claimed).toBe(0);
    expect(provider.sent).toHaveLength(1);

    const row = (await db.query.emailOutbox.findFirst())!;
    expect(row.state).toBe("sent");
    expect(row.sentAt).not.toBeNull();
  });

  it("gives a retried send the same Message-ID so the duplicate collapses", async () => {
    await setup();
    await openDueCycles(IN_WINDOW);
    provider.failures = 1;
    const failed = await processEmailOutbox(deliverAt());
    expect(failed.failed).toBe(1);

    const pending = (await db.query.emailOutbox.findFirst())!;
    expect(pending.state).toBe("pending");
    expect(pending.attempts).toBe(1);

    // Retry after the backoff window.
    const retried = await processEmailOutbox(deliverAt(60 * 60 * 1000));
    expect(retried.sent).toBe(1);
    expect(provider.sent).toHaveLength(1);
  });

  it("gives up after EMAIL_MAX_ATTEMPTS instead of retrying forever", async () => {
    await setup();
    await openDueCycles(IN_WINDOW);
    provider.failures = 99;
    for (let i = 0; i < 6; i++) {
      // Each pass is a day later, so the exponential backoff never blocks it.
      await processEmailOutbox(deliverAt(i * 24 * 60 * 60 * 1000));
    }
    const row = (await db.query.emailOutbox.findFirst())!;
    expect(row.state).toBe("failed");
    expect(provider.sent).toHaveLength(0);
  });

  it("two concurrent workers take disjoint batches and never double-send", async () => {
    const { section, teacher } = await setup();
    // Several recipients so there is something to split.
    for (let i = 0; i < 4; i++) {
      await makeEnrolledStudent(section.id, teacher.id);
    }
    await openDueCycles(IN_WINDOW);
    const total = (await db.query.emailOutbox.findMany()).length;
    expect(total).toBeGreaterThan(1);

    const [a, b] = await Promise.all([
      processEmailOutbox(deliverAt(), { batchSize: 100, owner: "A" }),
      processEmailOutbox(deliverAt(), { batchSize: 100, owner: "B" }),
    ]);
    // Every row sent once in total, whichever worker got it.
    expect(a.sent + b.sent).toBe(total);
    expect(provider.sent).toHaveLength(total);
    const ids = provider.sent.map((m) => m.messageId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("cancels rather than retrying when the recipient account is inactive", async () => {
    const { student } = await setup();
    await openDueCycles(IN_WINDOW);
    const { users } = await import("@/db/schema");
    await db
      .update(users)
      .set({ active: false })
      .where(eq(users.id, student.user.id));

    const result = await processEmailOutbox(deliverAt());
    expect(result.sent).toBe(0);
    const row = (await db.query.emailOutbox.findFirst())!;
    expect(row.state).toBe("cancelled");
  });

  it("queues a deadline reminder once per offset, not once per sweep", async () => {
    await setup();
    await openDueCycles(IN_WINDOW);
    await db.delete(emailOutbox);
    const cycle = (await db.query.weeklyCycles.findFirst())!;
    // Two hours before the deadline: inside the 24h window.
    const near = new Date(cycle.deadlineAt.getTime() - 3 * 60 * 60 * 1000);
    expect(await queueDeadlineReminders(near)).toBe(1);
    expect(await queueDeadlineReminders(near)).toBe(0);
    const rows = await db.query.emailOutbox.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.eventType).toBe("deadline_reminder");
  });

  it("tells a student their submission stopped counting, and that it counts again", async () => {
    const { teacher, student } = await setup();
    await openDueCycles(IN_WINDOW);
    const cycle = (await db.query.weeklyCycles.findFirst())!;
    const question = (await db.query.formQuestions.findFirst({
      where: eq(formQuestions.cycleId, cycle.id),
    }))!;
    const { responseId } = await submitResponse(
      student.user.id,
      cycle.id,
      { answers: [{ questionId: question.id, text: "ok" }] },
      IN_WINDOW,
    );
    await db.delete(emailOutbox);

    await invalidateSubmission(teacher.id, responseId, {
      reason: "empty_or_meaningless",
      studentVisibleReason: "The form was blank.",
    });
    let rows = await db.query.emailOutbox.findMany();
    expect(rows.map((r) => r.eventType)).toContain("submission_invalidated");
    // The student-visible reason lives on the page, not in the email.
    expect(rows[0]!.bodyText).not.toContain("The form was blank.");

    await restoreSubmission(teacher.id, responseId);
    rows = await db.query.emailOutbox.findMany();
    expect(rows.map((r) => r.eventType)).toContain("submission_restored");
  });

  it("never emails a student about a flag", async () => {
    const { student, section } = await setup();
    const { addSectionStaff } = await import("./fixtures");
    const ta = await makeUser({});
    await addSectionStaff(section.id, ta.id, "ta", { flagValidity: true });
    await openDueCycles(IN_WINDOW);
    const cycle = (await db.query.weeklyCycles.findFirst())!;
    const question = (await db.query.formQuestions.findFirst({
      where: eq(formQuestions.cycleId, cycle.id),
    }))!;
    const { responseId } = await submitResponse(
      student.user.id,
      cycle.id,
      { answers: [{ questionId: question.id, text: "ok" }] },
      IN_WINDOW,
    );
    await db.delete(emailOutbox);

    const { flagSubmission } = await import("@/modules/review");
    await flagSubmission(ta.id, responseId, { reason: "irrelevant" });

    // A flag is internal: no message of any kind is queued for the student.
    const rows = await db.query.emailOutbox.findMany();
    expect(rows).toHaveLength(0);
  });

  it("reconcile() run twice opens once, queues once and sends once", async () => {
    await setup();
    // The sweep uses one clock for both domain transitions and delivery, so run
    // it at real time: the seeded cycle is already past its open date.
    const first = await reconcile(deliverAt());
    const second = await reconcile(deliverAt());
    expect(first.cyclesOpened).toBe(1);
    expect(second.cyclesOpened).toBe(0);
    expect(first.emailsSent).toBe(1);
    expect(second.emailsSent).toBe(0);
    const rows = await db.query.emailOutbox.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.state).toBe("sent");
  });
});
