import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import {
  accountMatches,
  classSections,
  courses,
  emailOutbox,
  enrollments,
  formResponses,
  privateResponses,
  publicAnswers,
  sectionStaff,
  sourceLinks,
  studentSubmissionItems,
  users,
  formInstances,
} from "@/db/schema";
import { env } from "@/env";
import { writeAudit } from "@/modules/audit";
import { requireInstructor } from "@/modules/authz";
import { buildPage, parsePageParams } from "@/lib/pagination";
import { formatDeadline } from "@/lib/datetime";
import { getInstanceAudience } from "@/modules/forms/audience";
import { buildEmail, type EmailEvent, type TemplateContext } from "./templates";
import { getEmailProvider } from "./index";

/**
 * Idempotent email outbox (project-specs.md §12: "safe retry behavior that does
 * not duplicate forms, answers, or credit" — the same applies to mail).
 *
 * Two guarantees:
 *
 * 1. **Enqueue is idempotent.** `idempotencyKey` is unique, so re-running the
 *    reconciler or double-submitting an action inserts nothing new. Enqueueing
 *    happens inside the caller's transaction, so a rolled-back publish leaves no
 *    queued mail and a committed one always queues.
 * 2. **Delivery is single.** A worker CLAIMS rows with
 *    `FOR UPDATE SKIP LOCKED`, holds a short lease, and only re-claims an
 *    expired lease when no provider message id was recorded. Concurrent workers
 *    take disjoint sets. The residual window — a crash after SMTP accepted but
 *    before the row was marked sent — is covered by a deterministic Message-ID,
 *    so the duplicate collapses in the recipient's mail client.
 */

const LEASE_SECONDS = 120;

export interface EnqueueInput {
  eventType: EmailEvent;
  idempotencyKey: string;
  recipientUserId: string;
  sectionId?: string | null;
  courseId?: string | null;
  context: TemplateContext;
  /**
   * When this row becomes deliverable. Set explicitly from the caller's clock
   * rather than left to the database default, so a single reconciliation sweep
   * can queue a message and then deliver it in the same pass — with the DB
   * default, `available_at` would be a few microseconds after the sweep's `now`
   * and the row would sit until the next tick.
   */
  availableAt?: Date;
}

/**
 * Insert one queued email, or do nothing if this exact event already exists.
 *
 * Returns whether a row was actually inserted, so callers can report how many
 * messages they QUEUED rather than how many recipients they considered.
 */
export async function enqueueEmail(
  dbx: DbOrTx,
  input: EnqueueInput,
): Promise<boolean> {
  const built = buildEmail(input.eventType, input.context);
  const inserted = await dbx
    .insert(emailOutbox)
    .values({
      eventType: input.eventType,
      idempotencyKey: input.idempotencyKey,
      recipientUserId: input.recipientUserId,
      sectionId: input.sectionId ?? null,
      courseId: input.courseId ?? null,
      subject: built.subject,
      bodyText: built.text,
      bodyHtml: built.html,
      linkPath: input.context.linkPath,
      availableAt: input.availableAt ?? new Date(),
    })
    .onConflictDoNothing({ target: emailOutbox.idempotencyKey })
    .returning({ id: emailOutbox.id });
  return inserted.length > 0;
}

function key(parts: (string | number | undefined)[]): string {
  return parts.filter((p) => p !== undefined).join(":");
}

/** Section + course labels used in every subject line. */
async function sectionScope(dbx: DbOrTx, sectionId: string) {
  const section = await dbx.query.classSections.findFirst({
    where: eq(classSections.id, sectionId),
  });
  if (!section) return null;
  const course = await dbx.query.courses.findFirst({
    where: eq(courses.id, section.courseId),
  });
  return {
    sectionId,
    courseId: section.courseId,
    courseCode: course?.code ?? "Course",
    sectionTitle: section.title,
    timezone: section.timezone,
  };
}

/** Users with a confirmed identity and an active enrollment in the section. */
async function activeStudentUsers(dbx: DbOrTx, sectionId: string) {
  const rows = await dbx
    .select({
      userId: accountMatches.userId,
      displayName: users.displayName,
      studentRecordId: enrollments.studentRecordId,
    })
    .from(enrollments)
    .innerJoin(
      accountMatches,
      and(
        eq(accountMatches.studentRecordId, enrollments.studentRecordId),
        eq(accountMatches.state, "confirmed"),
      ),
    )
    .innerJoin(users, eq(users.id, accountMatches.userId))
    .where(
      and(
        eq(enrollments.sectionId, sectionId),
        eq(enrollments.status, "active"),
        eq(users.active, true),
      ),
    );
  return rows;
}

/**
 * "A form opened" — one message per enrolled student, once per instance.
 *
 * Fans out over the instance's AUDIENCE, so a course-wide form reaches every
 * targeted section. The idempotency key is keyed on (instance, user), not on the
 * section, so a student in two targeted sections still gets exactly one message —
 * the same rule as their single response.
 */
export async function enqueueCycleOpened(
  dbx: DbOrTx,
  cycleId: string,
  at: Date = new Date(),
) {
  const cycle = await dbx.query.formInstances.findFirst({
    where: eq(formInstances.id, cycleId),
  });
  if (!cycle) return 0;
  const audience = await getInstanceAudience(dbx, cycleId);
  let queued = 0;
  for (const sectionId of audience) {
    const scope = await sectionScope(dbx, sectionId);
    if (!scope) continue;
    const recipients = await activeStudentUsers(dbx, sectionId);
    for (const recipient of recipients) {
      const inserted = await enqueueEmail(dbx, {
        availableAt: at,
        eventType: "form_opened",
        idempotencyKey: key(["form_opened", "cycle", cycleId, recipient.userId]),
        recipientUserId: recipient.userId,
        sectionId: scope.sectionId,
        courseId: scope.courseId,
        context: {
          courseCode: scope.courseCode,
          sectionTitle: scope.sectionTitle,
          recipientName: recipient.displayName,
          weekNumber: cycle.cycleIndex,
          deadlineText: formatDeadline(cycle.deadlineAt, scope.timezone),
          // The instance, not the section: the student's object is the form.
          linkPath: `/forms/${cycleId}`,
        },
      });
      if (inserted) queued += 1;
    }
  }
  return queued;
}

/**
 * Deadline reminders. The offset label is part of the key, so the 24h and 2h
 * reminders are distinct rows and neither can be queued twice.
 */
export async function enqueueDeadlineReminders(
  dbx: DbOrTx,
  cycleId: string,
  offsetLabel: string,
  at: Date = new Date(),
) {
  const cycle = await dbx.query.formInstances.findFirst({
    where: eq(formInstances.id, cycleId),
  });
  if (!cycle) return 0;
  const audience = await getInstanceAudience(dbx, cycleId);
  // Students who already submitted still get the reminder: they may edit until
  // the deadline, and being told the window is closing is the point.
  let queued = 0;
  for (const sectionId of audience) {
    const scope = await sectionScope(dbx, sectionId);
    if (!scope) continue;
    const recipients = await activeStudentUsers(dbx, sectionId);
    for (const recipient of recipients) {
      const inserted = await enqueueEmail(dbx, {
        availableAt: at,
        eventType: "deadline_reminder",
        idempotencyKey: key([
          "deadline_reminder",
          "cycle",
          cycleId,
          recipient.userId,
          offsetLabel,
        ]),
        recipientUserId: recipient.userId,
        sectionId: scope.sectionId,
        courseId: scope.courseId,
        context: {
          courseCode: scope.courseCode,
          sectionTitle: scope.sectionTitle,
          recipientName: recipient.displayName,
          weekNumber: cycle.cycleIndex,
          deadlineText: formatDeadline(cycle.deadlineAt, scope.timezone),
          offsetLabel,
          linkPath: `/forms/${cycleId}`,
        },
      });
      if (inserted) queued += 1;
    }
  }
  return queued;
}

/** The asker of `itemId` receives "you have a private reply". No content. */
export async function enqueuePrivateAnswer(
  dbx: DbOrTx,
  input: { itemId: string; messageId: string },
) {
  const rows = await dbx
    .select({
      studentRecordId: formResponses.studentRecordId,
      cycleId: formResponses.cycleId,
      // The asker's OWN section, not the instance's audience: a private reply is
      // theirs alone, and this is the label they see in the subject line.
      sectionId: formResponses.sectionId,
    })
    .from(studentSubmissionItems)
    .innerJoin(
      formResponses,
      eq(formResponses.id, studentSubmissionItems.responseId),
    )
    .where(eq(studentSubmissionItems.id, input.itemId))
    .limit(1);
  const row = rows[0];
  if (!row) return;
  const scope = await sectionScope(dbx, row.sectionId);
  if (!scope) return;
  const match = await dbx.query.accountMatches.findFirst({
    where: and(
      eq(accountMatches.studentRecordId, row.studentRecordId),
      eq(accountMatches.state, "confirmed"),
    ),
  });
  if (!match) return;
  const recipient = await dbx.query.users.findFirst({
    where: eq(users.id, match.userId),
  });
  if (!recipient?.active) return;
  await enqueueEmail(dbx, {
    eventType: "private_answer_received",
    idempotencyKey: key([
      "private_answer_received",
      "message",
      input.messageId,
      match.userId,
    ]),
    recipientUserId: match.userId,
    sectionId: scope.sectionId,
    courseId: scope.courseId,
    context: {
      courseCode: scope.courseCode,
      sectionTitle: scope.sectionTitle,
      recipientName: recipient.displayName,
      linkPath: `/sections/${row.sectionId}/threads/${input.itemId}`,
    },
  });
}

/** Every linked asker of a published answer is told, without naming the others. */
export async function enqueuePublicAnswerLinked(
  dbx: DbOrTx,
  publicAnswerId: string,
) {
  const answer = await dbx.query.publicAnswers.findFirst({
    where: eq(publicAnswers.id, publicAnswerId),
  });
  if (!answer) return 0;
  const scope = await sectionScope(dbx, answer.sectionId);
  if (!scope) return 0;
  const links = await dbx.query.sourceLinks.findMany({
    where: eq(sourceLinks.publicAnswerId, publicAnswerId),
  });
  const itemIds = links
    .map((l) => l.itemId)
    .filter((v): v is string => v !== null);
  if (itemIds.length === 0) return 0;
  const askers = await dbx
    .select({
      itemId: studentSubmissionItems.id,
      studentRecordId: formResponses.studentRecordId,
    })
    .from(studentSubmissionItems)
    .innerJoin(
      formResponses,
      eq(formResponses.id, studentSubmissionItems.responseId),
    )
    .where(inArray(studentSubmissionItems.id, itemIds));
  let queued = 0;
  for (const asker of askers) {
    const match = await dbx.query.accountMatches.findFirst({
      where: and(
        eq(accountMatches.studentRecordId, asker.studentRecordId),
        eq(accountMatches.state, "confirmed"),
      ),
    });
    if (!match) continue;
    const recipient = await dbx.query.users.findFirst({
      where: eq(users.id, match.userId),
    });
    if (!recipient?.active) continue;
    await enqueueEmail(dbx, {
      eventType: "public_answer_linked",
      idempotencyKey: key([
        "public_answer_linked",
        "answer",
        publicAnswerId,
        match.userId,
      ]),
      recipientUserId: match.userId,
      sectionId: scope.sectionId,
      courseId: scope.courseId,
      context: {
        courseCode: scope.courseCode,
        sectionTitle: scope.sectionTitle,
        recipientName: recipient.displayName,
        linkPath: `/sections/${answer.sectionId}/history`,
      },
    });
    queued += 1;
  }
  return queued;
}

/** Credit changed. Never fired for a flag — a student must not learn of one. */
export async function enqueueValidityChanged(
  dbx: DbOrTx,
  responseId: string,
  validity: "valid" | "invalid",
) {
  const response = await dbx.query.formResponses.findFirst({
    where: eq(formResponses.id, responseId),
  });
  if (!response) return;
  const cycle = await dbx.query.formInstances.findFirst({
    where: eq(formInstances.id, response.cycleId),
  });
  if (!cycle) return;
  // The student's OWN section: a shared form has several, and this message is
  // about their submission alone.
  const scope = await sectionScope(dbx, response.sectionId);
  if (!scope) return;
  const match = await dbx.query.accountMatches.findFirst({
    where: and(
      eq(accountMatches.studentRecordId, response.studentRecordId),
      eq(accountMatches.state, "confirmed"),
    ),
  });
  if (!match) return;
  const recipient = await dbx.query.users.findFirst({
    where: eq(users.id, match.userId),
  });
  if (!recipient?.active) return;
  const eventType: EmailEvent =
    validity === "invalid" ? "submission_invalidated" : "submission_restored";
  await enqueueEmail(dbx, {
    eventType,
    idempotencyKey: key([
      eventType,
      "response",
      responseId,
      match.userId,
      // Validity can legitimately flip more than once, so the transition count
      // is part of the key: each real decision gets its own message.
      String(response.validityUpdatedAt?.getTime() ?? 0),
    ]),
    recipientUserId: match.userId,
    sectionId: scope.sectionId,
    courseId: scope.courseId,
    context: {
      courseCode: scope.courseCode,
      sectionTitle: scope.sectionTitle,
      recipientName: recipient.displayName,
      weekNumber: cycle.cycleIndex,
      linkPath: `/sections/${response.sectionId}/bonus`,
    },
  });
}

/** Instructors on the section are told a TA draft needs approval. */
export async function enqueueApprovalRequested(
  dbx: DbOrTx,
  publicAnswerId: string,
) {
  const answer = await dbx.query.publicAnswers.findFirst({
    where: eq(publicAnswers.id, publicAnswerId),
  });
  if (!answer) return 0;
  const scope = await sectionScope(dbx, answer.sectionId);
  if (!scope) return 0;
  const staff = await dbx
    .select({ userId: sectionStaff.userId, displayName: users.displayName })
    .from(sectionStaff)
    .innerJoin(users, eq(users.id, sectionStaff.userId))
    .where(
      and(
        eq(sectionStaff.sectionId, answer.sectionId),
        inArray(sectionStaff.role, ["teacher", "co_teacher"]),
        eq(users.active, true),
      ),
    );
  for (const person of staff) {
    await enqueueEmail(dbx, {
      eventType: "approval_requested",
      idempotencyKey: key([
        "approval_requested",
        "answer",
        publicAnswerId,
        person.userId,
      ]),
      recipientUserId: person.userId,
      sectionId: scope.sectionId,
      courseId: scope.courseId,
      context: {
        courseCode: scope.courseCode,
        sectionTitle: scope.sectionTitle,
        recipientName: person.displayName,
        linkPath: `/teach/sections/${answer.sectionId}/approvals`,
      },
    });
  }
  return staff.length;
}

/** The drafting assistant is told the outcome. */
export async function enqueueApprovalDecided(
  dbx: DbOrTx,
  publicAnswerId: string,
  decision: "approved" | "rejected",
) {
  const answer = await dbx.query.publicAnswers.findFirst({
    where: eq(publicAnswers.id, publicAnswerId),
  });
  if (!answer) return;
  const target = answer.submittedByUserId ?? answer.createdByUserId;
  const scope = await sectionScope(dbx, answer.sectionId);
  if (!scope) return;
  const recipient = await dbx.query.users.findFirst({
    where: eq(users.id, target),
  });
  if (!recipient?.active) return;
  await enqueueEmail(dbx, {
    eventType: "approval_decided",
    idempotencyKey: key([
      "approval_decided",
      "answer",
      publicAnswerId,
      decision,
      target,
    ]),
    recipientUserId: target,
    sectionId: scope.sectionId,
    courseId: scope.courseId,
    context: {
      courseCode: scope.courseCode,
      sectionTitle: scope.sectionTitle,
      recipientName: recipient.displayName,
      decision,
      linkPath: `/teach/sections/${answer.sectionId}/publications`,
    },
  });
}

/** Deterministic per row, so a duplicate send collapses in the mail client. */
function messageIdFor(idempotencyKey: string): string {
  const digest = createHash("sha256").update(idempotencyKey).digest("hex");
  return `<${digest}@${env.APP_MAIL_DOMAIN}>`;
}

function backoffSeconds(attempts: number): number {
  return Math.min(3600, 30 * 2 ** Math.max(0, attempts - 1));
}

/**
 * Deliver queued email. Safe to run concurrently and safe to re-run.
 *
 * Called from `reconcile()`, so the scheduler tick and the dev poller both drive
 * it without any extra infrastructure.
 */
export async function processEmailOutbox(
  now: Date = new Date(),
  opts: { batchSize?: number; owner?: string } = {},
): Promise<{ claimed: number; sent: number; failed: number }> {
  const batchSize = opts.batchSize ?? env.EMAIL_BATCH_SIZE;
  const owner = opts.owner ?? `worker-${randomUUID()}`;
  const leaseUntil = new Date(now.getTime() + LEASE_SECONDS * 1000);

  // One statement claims a disjoint batch. SKIP LOCKED is what lets a second
  // worker run at the same time without ever taking the same row.
  const claimed = await db
    .update(emailOutbox)
    .set({
      state: "sending",
      attempts: sql`${emailOutbox.attempts} + 1`,
      leaseOwner: owner,
      leaseExpiresAt: leaseUntil,
      updatedAt: now,
    })
    .where(
      sql`${emailOutbox.id} IN (
        SELECT id FROM ${emailOutbox}
        WHERE (state = 'pending' AND available_at <= ${now})
           OR (state = 'sending' AND lease_expires_at < ${now} AND provider_message_id IS NULL)
        ORDER BY available_at
        FOR UPDATE SKIP LOCKED
        LIMIT ${batchSize}
      )`,
    )
    .returning();

  if (claimed.length === 0) return { claimed: 0, sent: 0, failed: 0 };

  const provider = getEmailProvider();
  let sent = 0;
  let failed = 0;

  for (const row of claimed) {
    const recipient = await db.query.users.findFirst({
      where: eq(users.id, row.recipientUserId),
    });
    if (!recipient || !recipient.active) {
      // Nobody to deliver to. Cancel rather than retry forever.
      await db
        .update(emailOutbox)
        .set({
          state: "cancelled",
          lastError: "Recipient account is missing or inactive",
          leaseOwner: null,
          leaseExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(emailOutbox.id, row.id));
      continue;
    }
    try {
      const result = await provider.send({
        to: recipient.email,
        subject: row.subject,
        text: row.bodyText,
        html: row.bodyHtml ?? undefined,
        messageId: messageIdFor(row.idempotencyKey),
      });
      const marked = await db
        .update(emailOutbox)
        .set({
          state: "sent",
          sentAt: new Date(),
          providerMessageId: result.providerMessageId,
          lastError: null,
          leaseOwner: null,
          leaseExpiresAt: null,
          updatedAt: new Date(),
        })
        // Guarded on our own lease: if it expired and another worker took over,
        // we do not overwrite their result.
        .where(
          and(
            eq(emailOutbox.id, row.id),
            eq(emailOutbox.state, "sending"),
            eq(emailOutbox.leaseOwner, owner),
          ),
        )
        .returning({ id: emailOutbox.id });
      if (marked.length > 0) {
        sent += 1;
        await writeAudit(db, {
          actorUserId: null,
          action: "email.sent",
          entityType: "email_outbox",
          entityId: row.id,
          // Recipient by id, event type only. Never the body or the address.
          metadata: { eventType: row.eventType, recipientUserId: row.recipientUserId },
          sectionId: row.sectionId,
          courseId: row.courseId,
        });
      }
    } catch (err) {
      failed += 1;
      const attempts = row.attempts;
      const exhausted = attempts >= env.EMAIL_MAX_ATTEMPTS;
      await db
        .update(emailOutbox)
        .set({
          state: exhausted ? "failed" : "pending",
          availableAt: new Date(
            Date.now() + backoffSeconds(attempts) * 1000,
          ),
          lastError: err instanceof Error ? err.message : String(err),
          leaseOwner: null,
          leaseExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(emailOutbox.id, row.id));
      if (exhausted) {
        await writeAudit(db, {
          actorUserId: null,
          action: "email.failed",
          entityType: "email_outbox",
          entityId: row.id,
          metadata: { eventType: row.eventType, attempts },
          sectionId: row.sectionId,
          courseId: row.courseId,
        });
      }
    }
  }

  return { claimed: claimed.length, sent, failed };
}

/**
 * Queue reminders for every open cycle whose deadline is inside a configured
 * offset window. Idempotent by construction: the offset label is in the key.
 */
export async function queueDeadlineReminders(now: Date = new Date()) {
  const open = await db.query.formInstances.findMany({
    where: eq(formInstances.state, "open"),
  });
  let queued = 0;
  for (const cycle of open) {
    const minutesLeft = (cycle.deadlineAt.getTime() - now.getTime()) / 60000;
    if (minutesLeft <= 0) continue;
    for (const offset of env.emailReminderOffsets) {
      if (minutesLeft <= offset.minutes) {
        queued += await db.transaction((tx) =>
          enqueueDeadlineReminders(tx, cycle.id, offset.label, now),
        );
        // Only the nearest matching offset is queued now; a later tick queues
        // the closer one when its own window opens.
        break;
      }
    }
  }
  return queued;
}

/** Staff-facing delivery log for a section. Instructor-only. */
export async function listOutboxForSection(
  actorUserId: string,
  sectionId: string,
  opts: { page?: string | number | null } = {},
) {
  await requireInstructor(db, actorUserId, sectionId, { allowArchived: true });
  const params = parsePageParams(opts);
  const [{ count: total } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(emailOutbox)
    .where(eq(emailOutbox.sectionId, sectionId));
  const rows = await db.query.emailOutbox.findMany({
    where: eq(emailOutbox.sectionId, sectionId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
    limit: params.pageSize,
    offset: params.offset,
  });
  const recipientIds = [...new Set(rows.map((r) => r.recipientUserId))];
  const recipients = recipientIds.length
    ? await db.query.users.findMany({ where: inArray(users.id, recipientIds) })
    : [];
  const byId = new Map(recipients.map((u) => [u.id, u]));
  return buildPage(
    rows.map((row) => ({
      id: row.id,
      eventType: row.eventType,
      state: row.state,
      attempts: row.attempts,
      subject: row.subject,
      recipientName: byId.get(row.recipientUserId)?.displayName ?? "Unknown",
      sentAt: row.sentAt,
      lastError: row.lastError,
      createdAt: row.createdAt,
    })),
    total,
    params,
  );
}

/** Exported for the private-thread module, which needs the row id it created. */
export { privateResponses };
