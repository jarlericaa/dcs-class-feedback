import { describe, expect, it } from "vitest";

import {
  auditEntityNoun,
  auditFieldLabel,
  auditSentence,
  describeChanges,
  formatValue,
  hasStudentActor,
  isProseField,
  isTeacherFacing,
  isWithheldField,
  MAX_INLINE_VALUE,
  STUDENT_ACTOR_ACTIONS,
  TEACHER_FACING_ACTIONS,
  WITHHELD_VALUE,
} from "@/lib/audit-story";
import { AUDIT_ACTIONS } from "@/modules/audit/actions";

/**
 * The audit log, read by a teacher (GitHub issue #16).
 *
 * Three properties, and two of them are privacy properties:
 *
 * 1. The visible set is derived from `AUDIT_ACTIONS`, so an action added later
 *    cannot be silently missing from the filter.
 * 2. A sentence never names a student — there is no path through the noun table
 *    or the predicate table that produces one.
 * 3. A diff shows what changed, describes what it cannot show, and never prints
 *    prose somebody wrote.
 */

describe("the teacher-facing allowlist", () => {
  it("is derived from the action list, so a new action defaults to visible", () => {
    // The safe direction: a record a teacher can see is one they can ask
    // about, and one silently withheld is not.
    const withheld = AUDIT_ACTIONS.filter((a) => !TEACHER_FACING_ACTIONS.includes(a));
    expect(TEACHER_FACING_ACTIONS.length + withheld.length).toBe(
      AUDIT_ACTIONS.length,
    );
    expect(TEACHER_FACING_ACTIONS.length).toBeGreaterThan(80);
    for (const action of TEACHER_FACING_ACTIONS) {
      expect(AUDIT_ACTIONS, action).toContain(action);
    }
  });

  it("withholds the platform talking to itself", () => {
    for (const action of [
      "cycle.generated",
      "email.sent",
      "email.queued",
      "email.failed",
      "response.draft_saved",
      "response.locked",
      "response.unlocked",
      "response.marked_read",
      "response.all_marked_read",
      "source_link.created",
      "student_number.revealed",
      "roster.parsed",
      "roster.preview_edited",
      "user.teacher_role_changed",
    ]) {
      expect(isTeacherFacing(action), action).toBe(false);
      expect(TEACHER_FACING_ACTIONS, action).not.toContain(action);
    }
  });

  it("keeps every decision a teacher actually took", () => {
    for (const action of [
      "validity.invalidated",
      "validity.restored",
      "public_answer.published",
      "public_answer.unpublished",
      "private_response.created",
      "roster.imported",
      "roster.row_deactivated",
      "staff.permissions_changed",
      "staff.course_assigned",
      "participation.exported",
      "export.responses",
      "section.updated",
      "cycle.questions_customized",
    ]) {
      expect(isTeacherFacing(action), action).toBe(true);
      expect(TEACHER_FACING_ACTIONS, action).toContain(action);
    }
  });

  /**
   * The claim/match workflow was removed with decision D23, but the log is
   * append-only, so an old section still holds those rows. They describe a
   * decision nobody can act on now.
   */
  it("withholds codes from workflows that no longer exist", () => {
    for (const action of [
      "match.confirmed",
      "match.candidates_generated",
      "claim.submitted",
      "claim.auto_confirmed",
    ]) {
      expect(isTeacherFacing(action), action).toBe(false);
    }
  });
});

describe("auditSentence", () => {
  it("names the actor, the verb and the object", () => {
    expect(
      auditSentence({
        action: "public_answer.published",
        entityType: "public_answer",
        actorName: "Maria Santos",
        subject: "When will the practice set be available?",
      }),
    ).toBe(
      "Maria Santos published an answer to “When will the practice set be available?”.",
    );
  });

  it("says who the system is when nobody acted", () => {
    // The scheduler writes rows with no actor. "The system" is the truthful
    // subject; a blank would read as a missing name.
    expect(
      auditSentence({
        action: "cycle.closed",
        entityType: "weekly_cycle",
        actorName: null,
        subject: "Week 3",
      }),
    ).toBe("The system closed a form — Week 3.");
    expect(
      auditSentence({
        action: "cycle.closed",
        entityType: "weekly_cycle",
        actorName: "   ",
        subject: null,
      }),
    ).toBe("The system closed a form.");
  });

  it("leaves the object off rather than gluing it on with a guess", () => {
    // `validity.invalidated` has no preposition, because the subject a read
    // model could resolve for it is not this action's object.
    expect(
      auditSentence({
        action: "validity.invalidated",
        entityType: "form_response",
        actorName: "Ana Cruz",
        subject: "something",
      }),
    ).toBe("Ana Cruz removed a submission's participation credit.");
  });

  it("still forms a sentence for an action with no phrase yet", () => {
    expect(
      auditSentence({
        action: "some.future_action",
        entityType: "course",
        actorName: "Ana Cruz",
        subject: null,
      }),
    ).toBe("Ana Cruz · Some future action.");
  });

  /**
   * A student is never named, in either position.
   *
   * The actor of a submission IS the student, so naming them would put a
   * student's name in the first words of an entry a teacher scans. The
   * substitution is keyed on the action, so a staff member who is also
   * enrolled cannot defeat it.
   */
  it("says 'A student' for the actions a student performs", async () => {
    for (const action of [
      "response.submitted",
      "response.edited",
      "response.item_withdrawn",
      "private_response.student_follow_up",
      "comment.submitted",
    ]) {
      expect(hasStudentActor(action), action).toBe(true);
      const sentence = auditSentence({
        action,
        entityType: "form_response",
        actorName: "Juan Dela Cruz",
        subject: null,
      });
      expect(sentence, action).toMatch(/^A student /);
      expect(sentence, action).not.toContain("Juan");
    }
  });

  /**
   * The read model masks actors and the actor selector excludes them using this
   * same list, so it is the single definition of "a student wrote this".
   */
  it("exports the student-authored actions as one list", async () => {
    expect([...STUDENT_ACTOR_ACTIONS].sort()).toEqual([
      "comment.submitted",
      "private_response.student_follow_up",
      "response.draft_saved",
      "response.edited",
      "response.item_withdrawn",
      "response.submitted",
    ]);
    for (const action of STUDENT_ACTOR_ACTIONS) {
      expect(hasStudentActor(action), action).toBe(true);
    }
  });

  it("still names a staff actor, which is the whole point of the log", async () => {
    expect(hasStudentActor("validity.invalidated")).toBe(false);
    expect(
      auditSentence({
        action: "validity.invalidated",
        entityType: "form_response",
        actorName: "Ana Cruz",
        subject: null,
      }),
    ).toBe("Ana Cruz removed a submission's participation credit.");
  });

  /**
   * The privacy rule of the whole feature: the sentence is built from a
   * predicate table and a noun table, and neither contains a person. A read
   * model that resolved a student's name would have to be the one at fault —
   * this function cannot introduce one.
   */
  it("has no student-shaped noun anywhere in its vocabulary", () => {
    for (const entityType of [
      "form_response",
      "student_submission_item",
      "student_record",
      "enrollment",
      "private_response",
    ]) {
      const noun = auditEntityNoun(entityType);
      expect(noun, entityType).not.toMatch(/name|email|number/i);
      // Each is named as a thing, so a sentence reads about an object.
      expect(noun, entityType).toMatch(/^(a|an|the) /);
    }
  });
});

describe("describeChanges", () => {
  it("lists only the fields that actually differ", () => {
    const changes = describeChanges(
      { role: "teacher", reviewResponses: true, markValidity: true },
      { role: "ta", reviewResponses: true, markValidity: false },
    );
    expect(changes.map((c) => c.field)).toEqual(["markValidity", "role"]);
    expect(changes.find((c) => c.field === "role")).toMatchObject({
      label: "Role",
      before: "teacher",
      after: "ta",
    });
    // Booleans read as words, not as `true`/`false`.
    expect(changes.find((c) => c.field === "markValidity")).toMatchObject({
      before: "yes",
      after: "no",
    });
  });

  it("says 'not recorded' for a side the writer did not capture", () => {
    const onlyAfter = describeChanges(null, { state: "published" });
    expect(onlyAfter).toEqual([
      { field: "state", label: "State", before: null, after: "published" },
    ]);
    const onlyBefore = describeChanges({ state: "draft" }, null);
    expect(onlyBefore).toEqual([
      { field: "state", label: "State", before: "draft", after: null },
    ]);
    expect(describeChanges(null, null)).toEqual([]);
  });

  it("ignores payloads that are not objects", () => {
    expect(describeChanges("a string", 42)).toEqual([]);
    expect(describeChanges([1, 2], undefined)).toEqual([]);
  });

  it("reports a field that appears on one side only", () => {
    const changes = describeChanges({ a: 1 }, { a: 1, b: 2 });
    expect(changes.map((c) => c.field)).toEqual(["b"]);
    expect(changes[0]).toMatchObject({ before: "not recorded", after: "2" });
  });
});

describe("formatValue", () => {
  it("turns each scalar into words a person reads", () => {
    expect(formatValue("active", true)).toBe("yes");
    expect(formatValue("active", false)).toBe("no");
    expect(formatValue("title", null)).toBe("not set");
    expect(formatValue("title", undefined)).toBe("not recorded");
    expect(formatValue("displayOrder", 3)).toBe("3");
    expect(formatValue("title", "  Section A  ")).toBe("Section A");
    expect(formatValue("title", "   ")).toBe("empty");
  });

  it("describes a structure rather than serializing it inline", () => {
    // A nested object printed inline is the JSON blob this replaced; the
    // technical-details disclosure is where the real shape belongs.
    expect(formatValue("permissions", { a: true })).toBe("changed");
    expect(formatValue("sectionIds", ["a", "b", "c"])).toBe("3 items");
    expect(formatValue("sectionIds", ["a"])).toBe("1 item");
  });

  /**
   * The log is not supposed to carry bodies at all, but this is the surface
   * that would PRINT one if a future writer slipped.
   */
  it("never prints prose somebody wrote", () => {
    const body = "Please could you explain tree rotations again, in detail.";
    for (const field of ["body", "text", "note", "staffNote", "originalText"]) {
      const shown = formatValue(field, body);
      expect(shown, field).not.toContain("tree rotations");
      expect(shown, field).toMatch(/^\d+ characters of text$/);
    }
    expect(formatValue("body", "x")).toBe("1 character of text");
  });

  it("truncates a long value instead of flooding the row", () => {
    const long = "y".repeat(MAX_INLINE_VALUE + 40);
    const shown = formatValue("title", long);
    expect(shown.endsWith("…")).toBe(true);
    expect(shown.length).toBeLessThanOrEqual(MAX_INLINE_VALUE + 1);
    // At the limit it is printed whole: truncation is for what exceeds it.
    const exact = "z".repeat(MAX_INLINE_VALUE);
    expect(formatValue("title", exact)).toBe(exact);
  });
});

describe("auditFieldLabel", () => {
  it("uses the curated label where there is one", () => {
    expect(auditFieldLabel("studentVisibleReason")).toBe(
      "What the student sees",
    );
    expect(auditFieldLabel("rosterEmail")).toBe("UP email");
    expect(auditFieldLabel("validity")).toBe("Participation credit");
  });

  it("falls back to a readable form for an unmapped field", () => {
    expect(auditFieldLabel("someNewField")).toBe("Some new field");
    expect(auditFieldLabel("snake_case_field")).toBe("Snake case field");
  });

  it("does not return a function for a prototype key", () => {
    // A bare object lookup would answer `toString` with a function.
    expect(typeof auditFieldLabel("toString")).toBe("string");
    expect(typeof auditFieldLabel("constructor")).toBe("string");
  });
});

describe("the default diff against what the writers actually store", () => {
  /**
   * These payloads are copied from the real `writeAudit` calls, so the test
   * fails if a writer's shape and this classification ever drift apart.
   */
  it("withholds the name and address roster.row_added records", () => {
    // src/modules/roster-import/index.ts
    const changes = describeChanges(null, {
      fullName: "Juan Dela Cruz",
      rosterEmail: "juan.delacruz@up.edu.ph",
    });
    expect(changes.map((c) => [c.label, c.after])).toEqual([
      ["Name", WITHHELD_VALUE],
      ["UP email", WITHHELD_VALUE],
    ]);
    const dump = JSON.stringify(changes);
    expect(dump).not.toContain("Juan");
    expect(dump).not.toContain("up.edu.ph");
  });

  it("withholds both sides of the address roster.email_linked records", () => {
    const changes = describeChanges(
      { rosterEmail: null },
      { rosterEmail: "juan.delacruz@up.edu.ph" },
    );
    // Absence is still stated: "not set → withheld" says an address was added
    // where there was none, which is the fact this row exists to record.
    expect(changes).toEqual([
      {
        field: "rosterEmail",
        label: "UP email",
        before: "not set",
        after: WITHHELD_VALUE,
      },
    ]);
  });

  it("withholds a corrected student name on both sides", () => {
    const changes = describeChanges(
      { fullName: "Juan Dela Cruz" },
      { fullName: "Juan dela Cruz" },
    );
    expect(changes[0]).toMatchObject({
      before: WITHHELD_VALUE,
      after: WITHHELD_VALUE,
    });
    expect(JSON.stringify(changes)).not.toContain("Cruz");
  });

  it("withholds the staff address in a staff assignment", () => {
    // src/modules/catalog/index.ts — staff.assigned / staff.course_assigned
    const changes = describeChanges(null, {
      email: "ana.cruz@up.edu.ph",
      role: "co_teacher",
    });
    const byField = new Map(changes.map((c) => [c.field, c.after]));
    expect(byField.get("email")).toBe(WITHHELD_VALUE);
    // The role is the decision, and it prints.
    expect(byField.get("role")).toBe("co_teacher");
  });

  it("reports an edited answer body by length, never by content", () => {
    // src/modules/publishing — public_answer.edited
    const body = "Use the power rule, then check the base case at n = 0.";
    const changes = describeChanges({ answerBody: "Friday." }, { answerBody: body });
    expect(changes[0]!.after).toBe(`${body.length} characters of text`);
    expect(JSON.stringify(changes)).not.toContain("power rule");
  });

  /**
   * The one text field the default diff DOES print. It is what a teacher opens
   * this page to check, both sides are staff-authored wording already
   * published to that whole class, and the student's original words are
   * immutable and never in this payload.
   */
  it("prints both sides of a reworded public question", () => {
    const changes = describeChanges(
      { publicQuestionText: "when is the practice set out" },
      { publicQuestionText: "When will the practice set be available?" },
    );
    expect(changes[0]).toMatchObject({
      label: "Public question",
      before: "when is the practice set out",
      after: "When will the practice set be available?",
    });
    expect(isWithheldField("publicQuestionText")).toBe(false);
    expect(isProseField("publicQuestionText")).toBe(false);
  });

  it("keeps every non-sensitive field a writer records printable", () => {
    // A sample across the inventory: state transitions, settings and counts are
    // the whole point of a diff and must survive the redaction.
    const changes = describeChanges(
      { state: "draft", active: true, term: "AY2026-1" },
      {
        state: "published",
        active: false,
        term: "AY2026-2",
        timezone: "Asia/Manila",
        role: "ta",
        validity: "invalid",
        invalidationReason: "spam",
        studentVisibleReason: "This did not answer the form.",
        deliveryMode: "weekly",
        versionNumber: 3,
      },
    );
    const byField = new Map(changes.map((c) => [c.field, c.after]));
    expect(byField.get("state")).toBe("published");
    expect(byField.get("active")).toBe("no");
    expect(byField.get("term")).toBe("AY2026-2");
    expect(byField.get("timezone")).toBe("Asia/Manila");
    expect(byField.get("role")).toBe("ta");
    expect(byField.get("validity")).toBe("invalid");
    expect(byField.get("invalidationReason")).toBe("spam");
    expect(byField.get("studentVisibleReason")).toBe(
      "This did not answer the form.",
    );
    expect(byField.get("versionNumber")).toBe("3");
  });
});

describe("the redaction covers fields no writer has added yet", () => {
  it("withholds anything named like an identity", () => {
    for (const field of [
      "email",
      "rosterEmail",
      "contactEmail",
      "fullName",
      "firstName",
      "familyName",
      "livedName",
      "displayName",
      "name",
      "studentNumber",
      "phone",
      "phoneNumber",
      "program",
      "preferredPronoun",
    ]) {
      expect(isWithheldField(field), field).toBe(true);
      expect(formatValue(field, "something identifying"), field).toBe(
        WITHHELD_VALUE,
      );
    }
  });

  it("withholds an identity value whatever its type", () => {
    // A future writer storing a name as a number or a flag must not slip past
    // the string path.
    expect(formatValue("studentNumber", 202600001)).toBe(WITHHELD_VALUE);
    expect(formatValue("fullName", true)).toBe(WITHHELD_VALUE);
    expect(formatValue("rosterEmail", ["a@b.test"])).toBe(WITHHELD_VALUE);
    expect(formatValue("email", { at: "x" })).toBe(WITHHELD_VALUE);
    // Absence still reads as absence, which discloses nothing.
    expect(formatValue("rosterEmail", null)).toBe("not set");
    expect(formatValue("rosterEmail", undefined)).toBe("not recorded");
  });

  it("reports anything named like prose by length", () => {
    for (const field of [
      "body",
      "text",
      "note",
      "staffNote",
      "originalText",
      "comment",
      "message",
      "answerBody",
      "replyBody",
      "internalNote",
      "moderatorComment",
      "failureMessage",
    ]) {
      expect(isProseField(field), field).toBe(true);
      expect(formatValue(field, "abcde"), field).toBe("5 characters of text");
    }
  });

  it("withholds rather than truncates a long identity value", () => {
    // The ordering rule: a field that is both an identity and long must not
    // fall through to the truncated preview.
    const long = `${"Maria ".repeat(30)}Santos`;
    expect(long.length).toBeGreaterThan(MAX_INLINE_VALUE);
    expect(formatValue("fullName", long)).toBe(WITHHELD_VALUE);
  });

  it("does not withhold the structural fields a diff is for", () => {
    for (const field of [
      "state",
      "role",
      "term",
      "title",
      "code",
      "timezone",
      "active",
      "validity",
      "lifecycle",
      "category",
      "disposition",
      "deliveryMode",
      "audienceMode",
      "reason",
      "invalidationReason",
      "studentVisibleReason",
      "prompt",
      "description",
      "purpose",
      "focusLabel",
    ]) {
      expect(isWithheldField(field), field).toBe(false);
      expect(isProseField(field), field).toBe(false);
    }
  });
});
