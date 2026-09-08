import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { formResponses, responseReads } from "@/db/schema";
import { writeAudit } from "@/modules/audit";
import { AuthzError, requireSectionStaff } from "@/modules/authz";

/**
 * Per-reader read state for the staff review column (GitHub issue #6).
 *
 * The problem it solves: stop scrolling halfway through a week and coming back
 * means re-scanning from the top to find where you left off. So each reader
 * carries their own marker on each response, it survives a reload and a change
 * of device, and the column can lead with what they have not read.
 *
 * ## What this is not
 *
 * It is not a fact about the student. A read marker changes no validity, no
 * participation credit, no disposition and no publication, and it never enters
 * a student-facing read model — a student is never told that staff have or have
 * not opened their submission, which would be a promise the product does not
 * make and a pressure it should not apply.
 *
 * It is also not `src/lib/reviewed-session.ts`. That cookie answers "did I act
 * on this in THIS sitting?" and exists so a post you have just answered stays
 * in place in the "needs a reply" view instead of vanishing under the cursor.
 * It expires with the browser, on purpose. This table answers "have I read it,
 * ever, anywhere", which is exactly the thing that has to persist.
 *
 * ## Authorization
 *
 * Every entry point resolves the response's OWN section and requires
 * `reviewResponses` on it — the same gate the queue itself uses. A shared form
 * has several audience sections, and standing on one of the others must not let
 * a reader touch this response's row. Archived courses are allowed: reading an
 * archived section's history is a read, and marking your own place in it
 * changes nothing about the course.
 */

/** What caused a response to be marked read. Decides whether it is audited. */
export type ReadSource =
  /** a person pressed "Mark as read" */
  | "explicit"
  /** implied by resolving the post — replying, publishing, declining */
  | "resolved"
  /** part of a "mark all as read" sweep */
  | "bulk";

const NO_RESPONSE_ACCESS = "No access to this response";

async function sectionOf(responseId: string): Promise<{
  id: string;
  sectionId: string;
}> {
  const response = await db.query.formResponses.findFirst({
    where: eq(formResponses.id, responseId),
    columns: { id: true, sectionId: true },
  });
  // Missing and unauthorized responses must be indistinguishable to a caller
  // guessing ids. The same generic error is also used when the section gate
  // below refuses an existing response.
  if (!response) throw new AuthzError(NO_RESPONSE_ACCESS);
  return { id: response.id, sectionId: response.sectionId };
}

async function authorizedResponse(
  actorUserId: string,
  responseId: string,
) {
  const response = await sectionOf(responseId);
  try {
    await requireSectionStaff(
      db,
      actorUserId,
      response.sectionId,
      "reviewResponses",
      { allowArchived: true },
    );
  } catch (error) {
    if (error instanceof AuthzError) {
      throw new AuthzError(NO_RESPONSE_ACCESS);
    }
    throw error;
  }
  return response;
}

/**
 * Keep read-state derivation behind the same section gate as the review queue.
 *
 * The queue normally supplies an already-scoped id set, but these functions are
 * exported service helpers and should not turn that convention into a security
 * boundary. Foreign and missing ids are both dropped, like a bulk mark: the
 * caller learns only about rows it could already review, never whether a
 * guessed id has a read marker.
 */
async function responseIdsReaderCanSee(
  readerUserId: string,
  responseIds: string[],
): Promise<string[]> {
  const unique = [...new Set(responseIds)];
  if (unique.length === 0) return [];
  const responses = await db
    .select({ id: formResponses.id, sectionId: formResponses.sectionId })
    .from(formResponses)
    .where(inArray(formResponses.id, unique));
  const allowedSections = new Set<string>();
  for (const sectionId of new Set(responses.map((r) => r.sectionId))) {
    try {
      await requireSectionStaff(db, readerUserId, sectionId, "reviewResponses", {
        allowArchived: true,
      });
      allowedSections.add(sectionId);
    } catch (error) {
      if (!(error instanceof AuthzError)) throw error;
    }
  }
  return responses
    .filter((response) => allowedSections.has(response.sectionId))
    .map((response) => response.id);
}

/**
 * Which of these responses this reader has already read.
 *
 * The caller normally supplies a set of ids already scoped by the review queue,
 * but this helper repeats the section authorization so the service boundary is
 * safe on its own. Ids outside the reader's sections are omitted.
 */
export async function listReadResponseIds(
  readerUserId: string,
  responseIds: string[],
): Promise<Set<string>> {
  const allowed = await responseIdsReaderCanSee(readerUserId, responseIds);
  if (allowed.length === 0) return new Set();
  const rows = await db
    .select({ responseId: responseReads.responseId })
    .from(responseReads)
    .where(
      and(
        eq(responseReads.readerUserId, readerUserId),
        inArray(responseReads.responseId, allowed),
      ),
    );
  return new Set(rows.map((r) => r.responseId));
}

/**
 * Mark one response read for this reader. Idempotent: marking twice keeps the
 * first `read_at` rather than moving it, so "unread since Monday" cannot be
 * quietly rewritten by re-opening the page.
 *
 * The write and its audit row share one transaction. A `resolved` mark writes
 * no audit row — the action that resolved the post already has one, and a
 * second row saying the reader had also read it adds no fact.
 */
export async function markResponseRead(
  actorUserId: string,
  responseId: string,
  source: ReadSource = "explicit",
): Promise<void> {
  const response = await authorizedResponse(actorUserId, responseId);
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(responseReads)
      .values({ responseId: response.id, readerUserId: actorUserId })
      .onConflictDoNothing({
        target: [responseReads.responseId, responseReads.readerUserId],
      })
      .returning({ id: responseReads.id });
    // Nothing changed, so nothing to record: re-pressing the control must not
    // put a second row in an append-only log.
    if (inserted.length === 0) return;
    if (source === "resolved") return;
    await writeAudit(tx, {
      actorUserId,
      action: "response.marked_read",
      entityType: "form_response",
      entityId: response.id,
      sectionId: response.sectionId,
      metadata: { source },
    });
  });
}

/**
 * The escape hatch: put a response back in the unread pile.
 *
 * Without it a misclick is permanent, and "I marked it read before I had
 * actually dealt with it" is the ordinary case this queue has to survive.
 */
export async function markResponseUnread(
  actorUserId: string,
  responseId: string,
): Promise<void> {
  const response = await authorizedResponse(actorUserId, responseId);
  await db.transaction(async (tx) => {
    const removed = await tx
      .delete(responseReads)
      .where(
        and(
          eq(responseReads.responseId, response.id),
          eq(responseReads.readerUserId, actorUserId),
        ),
      )
      .returning({ id: responseReads.id });
    if (removed.length === 0) return;
    await writeAudit(tx, {
      actorUserId,
      action: "response.marked_unread",
      entityType: "form_response",
      entityId: response.id,
      sectionId: response.sectionId,
    });
  });
}

/**
 * Mark a whole set read in one action — "mark all as read".
 *
 * The caller passes exactly what the reader can currently SEE, so the control
 * clears the pile in front of them rather than a wider set they have not
 * looked at. Every id is re-authorized here anyway, per its own section, so a
 * forged id from another course is dropped rather than written: the sweep does
 * as much as it legitimately can and reports the count.
 *
 * ONE audit row for the sweep, carrying the count. One row per response would
 * put forty entries in a log a teacher already struggles to read, all of them
 * saying the same thing.
 *
 * REFUSES an oversized list rather than truncating it. The ids arrive in a form
 * field, so the size is caller-supplied: without a bound they reach `inArray`
 * as one bind parameter each and a large enough field fails inside the driver
 * as a 500. Silently marking the first N would be worse than refusing — the
 * control says "mark these as read" and a reader would be told it had done so.
 */
export const MAX_MARK_READ_IDS = 2000;

export async function markResponsesRead(
  actorUserId: string,
  responseIds: string[],
): Promise<number> {
  const unique = [...new Set(responseIds)];
  if (unique.length === 0) return 0;
  if (unique.length > MAX_MARK_READ_IDS) {
    throw new Error(
      `Too many responses to mark at once (${unique.length}; the limit is ${MAX_MARK_READ_IDS}). Narrow the week or the filters and try again.`,
    );
  }
  const responses = await db
    .select({ id: formResponses.id, sectionId: formResponses.sectionId })
    .from(formResponses)
    .where(inArray(formResponses.id, unique));

  // One authorization check per distinct SECTION, not per response: a week's
  // sweep is one or two sections and hundreds of rows.
  const allowedSections = new Set<string>();
  for (const sectionId of new Set(responses.map((r) => r.sectionId))) {
    try {
      await requireSectionStaff(db, actorUserId, sectionId, "reviewResponses", {
        allowArchived: true,
      });
      allowedSections.add(sectionId);
    } catch {
      // Not this reader's section. Dropped silently — the id was not theirs to
      // mark, and saying so would confirm the response exists.
    }
  }
  const allowed = responses.filter((r) => allowedSections.has(r.sectionId));
  if (allowed.length === 0) return 0;

  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(responseReads)
      .values(
        allowed.map((r) => ({
          responseId: r.id,
          readerUserId: actorUserId,
        })),
      )
      .onConflictDoNothing({
        target: [responseReads.responseId, responseReads.readerUserId],
      })
      .returning({ id: responseReads.id });
    if (inserted.length === 0) return 0;
    await writeAudit(tx, {
      actorUserId,
      action: "response.all_marked_read",
      entityType: "form_response",
      /**
       * No single entity: this is a sweep. `sectionId` carries the scope when
       * the sweep was within one section, which is the normal case and what
       * makes the row findable in that section's history.
       */
      entityId: null,
      sectionId:
        allowedSections.size === 1 ? [...allowedSections][0]! : null,
      metadata: { count: inserted.length, requested: unique.length },
    });
    return inserted.length;
  });
}

/**
 * How many of this reader's visible responses are still unread, per section.
 *
 * Used for the count beside the filter. It repeats the response-section gate
 * rather than trusting that every caller already scoped the ids.
 *
 * DEDUPED first, like `markResponsesRead`. The count comes back from the
 * database one row per response, so subtracting it from a list that named the
 * same id twice reported a read response as unread — the arithmetic has to
 * compare distinct ids with distinct rows.
 */
export async function countUnread(
  readerUserId: string,
  responseIds: string[],
): Promise<number> {
  const allowed = await responseIdsReaderCanSee(readerUserId, responseIds);
  if (allowed.length === 0) return 0;
  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(responseReads)
    .where(
      and(
        eq(responseReads.readerUserId, readerUserId),
        inArray(responseReads.responseId, allowed),
      ),
    );
  return allowed.length - count;
}
