import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, truncateAll } from "./helpers";
import {
  addSectionStaff,
  makeCourse,
  makeEnrolledStudent,
  makeInstance,
  makeSection,
  makeUser,
} from "./fixtures";
import {
  backlogQuestions,
  classSections,
  formResponses,
  publicAnswers,
  sourceLinks,
  studentSubmissionItems,
} from "@/db/schema";
import {
  draftPublicAnswer,
  getStudentHistory,
  listCoursePublicationQueue,
  listCourseQa,
  publishDueAnswers,
  publishNow,
  schedulePublication,
} from "@/modules/publishing";
import {
  draftFromBacklog,
  importLegacyEntries,
  setBacklogState,
} from "@/modules/backlog";
import { AuthzError } from "@/modules/authz";
import { getCourseReviewQueue } from "@/modules/review";

/**
 * The course-scoped teaching workflow (ADR-0005).
 *
 * The acceptance case this suite exists for: CS 33 runs three laboratory
 * sections, a student in Lab A asks a question, the team answers it ONCE, and
 * students in all three labs read that one entry without learning where it came
 * from — while a section-scoped assistant still cannot read a submission from a
 * lab they were never authorized to review.
 */

/** CS 33 with Lab A / Lab B / Lab C and one shared open occurrence. */
async function makeCs33() {
  const teacher = await makeUser({ isTeacher: true });
  const course = await makeCourse(teacher.id);
  const labs = [];
  for (const title of ["Lab A", "Lab B", "Lab C"]) {
    const section = await makeSection(course.id);
    await db
      .update(classSections)
      .set({ title })
      .where(eq(classSections.id, section.id));
    await addSectionStaff(section.id, teacher.id, "teacher");
    labs.push({ ...section, title });
  }
  const now = new Date();
  const instance = await makeInstance({
    courseId: course.id,
    sectionIds: labs.map((lab) => lab.id),
    openAt: new Date(now.getTime() - 3600_000),
    deadlineAt: new Date(now.getTime() + 3600_000),
  });
  return { teacher, course, labs, instance };
}

/** A submitted question attributed to one lab. */
async function askFrom(
  instanceId: string,
  sectionId: string,
  text = "Could we see another tree rotation example?",
) {
  const { user, record } = await makeEnrolledStudent(sectionId);
  const [response] = await db
    .insert(formResponses)
    .values({
      cycleId: instanceId,
      studentRecordId: record.id,
      sectionId,
      submittedAt: new Date(),
    })
    .returning();
  const [item] = await db
    .insert(studentSubmissionItems)
    .values({
      responseId: response!.id,
      kind: "question",
      submissionType: "question",
      category: "content",
      originalText: text,
    })
    .returning();
  return { user, record, response: response!, item: item! };
}

describe("one course-wide Class Q&A", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  /**
   * THE acceptance test. One publication, read from every lab, and exactly one
   * row behind it — not one per section.
   */
  it("publishes once and shows the same entry to every section's students", async () => {
    const { teacher, course, labs, instance } = await makeCs33();
    const asker = await askFrom(instance.id, labs[0]!.id);
    const inLabB = await makeEnrolledStudent(labs[1]!.id);
    const inLabC = await makeEnrolledStudent(labs[2]!.id);

    const answer = await draftPublicAnswer(teacher.id, {
      courseId: course.id,
      itemIds: [asker.item.id],
      publicQuestionText: "Could we see another tree rotation example?",
      answerBody: "Yes — an AVL walkthrough goes up before the next session.",
      category: "content",
    });
    await publishNow(teacher.id, answer.id, { anonymityAcknowledged: true });

    // ONE row for a three-section course.
    const rows = await db.query.publicAnswers.findMany({
      where: eq(publicAnswers.courseId, course.id),
    });
    expect(rows).toHaveLength(1);

    const fromB = await listCourseQa(inLabB.user.id, course.id);
    const fromC = await listCourseQa(inLabC.user.id, course.id);
    const fromAsker = await listCourseQa(asker.user.id, course.id);
    expect(fromB).toHaveLength(1);
    expect(fromC).toHaveLength(1);
    // The SAME entry, by id — not three copies that happen to read alike.
    expect(fromB[0]!.id).toBe(fromAsker[0]!.id);
    expect(fromC[0]!.id).toBe(fromAsker[0]!.id);
  });

  /**
   * Course-wide reach makes the anonymity promise matter MORE, not less: a Lab
   * B reader must not be able to tell the question came from Lab A, or who
   * asked it.
   */
  it("leaks no source section, asker or source link to another section's reader", async () => {
    const { teacher, course, labs, instance } = await makeCs33();
    const asker = await askFrom(instance.id, labs[0]!.id);
    const inLabB = await makeEnrolledStudent(labs[1]!.id);

    const answer = await draftPublicAnswer(teacher.id, {
      courseId: course.id,
      itemIds: [asker.item.id],
      publicQuestionText: "Could we see another rotation example?",
      answerBody: "Yes.",
    });
    await publishNow(teacher.id, answer.id, { anonymityAcknowledged: true });

    const payload = JSON.stringify(await listCourseQa(inLabB.user.id, course.id));
    expect(payload).not.toContain(labs[0]!.id);
    expect(payload).not.toContain("Lab A");
    expect(payload).not.toContain(asker.record.id);
    expect(payload).not.toContain(asker.item.id);
    expect(payload).not.toContain("originSectionId");
    // The asker's ORIGINAL wording never becomes public text either.
    expect(payload).not.toContain("tree rotation");
  });

  /** A student of another course entirely reaches nothing. */
  it("refuses a student enrolled only in another course", async () => {
    const { course } = await makeCs33();
    const other = await makeUser({ isTeacher: true });
    const otherCourse = await makeCourse(other.id);
    const otherSection = await makeSection(otherCourse.id);
    const outsider = await makeEnrolledStudent(otherSection.id);

    await expect(
      listCourseQa(outsider.user.id, course.id),
    ).rejects.toBeInstanceOf(AuthzError);
  });

  /**
   * The asker still sees their own question marked answered, with the reworded
   * public text — through the source link, which survived the move to course
   * ownership untouched.
   */
  it("keeps the asker's history linked to the course-owned answer", async () => {
    const { teacher, course, labs, instance } = await makeCs33();
    const asker = await askFrom(instance.id, labs[0]!.id);
    const inLabB = await makeEnrolledStudent(labs[1]!.id);

    const answer = await draftPublicAnswer(teacher.id, {
      courseId: course.id,
      itemIds: [asker.item.id],
      publicQuestionText: "Could we see another rotation example?",
      answerBody: "Yes.",
    });
    await publishNow(teacher.id, answer.id, { anonymityAcknowledged: true });

    const history = await getStudentHistory(asker.user.id, labs[0]!.id);
    const item = history[0]!.items[0]!;
    expect(item.status).toBe("answered");
    expect(item.publicAnswer?.rewordedQuestion).toBe(
      "Could we see another rotation example?",
    );
    // ...and it deep-links into the COURSE archive.
    expect(item.publicAnswer?.courseId).toBe(course.id);
    expect(item.publicAnswer?.id).toBe(answer.id);

    // The Lab B student's own history is their own: they read the public
    // answer in the archive, but nothing marks it as theirs.
    const theirs = await getStudentHistory(inLabB.user.id, labs[1]!.id);
    expect(theirs).toHaveLength(0);
  });
});

describe("the publication queue is course-scoped", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("holds one queue for the whole course, across every section's sources", async () => {
    const { teacher, course, labs, instance } = await makeCs33();
    const fromA = await askFrom(instance.id, labs[0]!.id, "A question");
    const fromB = await askFrom(instance.id, labs[1]!.id, "B question");

    await draftPublicAnswer(teacher.id, {
      courseId: course.id,
      itemIds: [fromA.item.id],
      publicQuestionText: "A",
      answerBody: "a",
    });
    await draftPublicAnswer(teacher.id, {
      courseId: course.id,
      itemIds: [fromB.item.id],
      publicQuestionText: "B",
      answerBody: "b",
    });

    const queue = await listCoursePublicationQueue(teacher.id, course.id);
    expect(queue.drafts).toHaveLength(2);
  });

  /**
   * A merge may now span sections — one course, one answer — but only for an
   * actor authorized on EVERY source section. A merge must not become a way to
   * reach a lab you cannot review.
   */
  it("allows a cross-section merge, and refuses one the actor is not authorized for", async () => {
    const { teacher, course, labs, instance } = await makeCs33();
    const fromA = await askFrom(instance.id, labs[0]!.id, "A question");
    const fromB = await askFrom(instance.id, labs[1]!.id, "B question");

    const merged = await draftPublicAnswer(teacher.id, {
      courseId: course.id,
      itemIds: [fromA.item.id, fromB.item.id],
      publicQuestionText: "Several students asked about rotations",
      answerBody: "Here is the walkthrough.",
    });
    const links = await db.query.sourceLinks.findMany({
      where: eq(sourceLinks.publicAnswerId, merged.id),
    });
    expect(links).toHaveLength(2);

    // An assistant authorized on Lab A alone cannot merge in Lab B's question.
    const ta = await makeUser();
    await addSectionStaff(labs[0]!.id, ta.id, "ta", {
      draftPublicAnswers: true,
    });
    await expect(
      draftPublicAnswer(ta.id, {
        courseId: course.id,
        itemIds: [fromA.item.id, fromB.item.id],
        publicQuestionText: "x",
      }),
    ).rejects.toBeInstanceOf(AuthzError);
    // ...and their own lab's question alone is fine.
    await expect(
      draftPublicAnswer(ta.id, {
        courseId: course.id,
        itemIds: [fromA.item.id],
        publicQuestionText: "x",
      }),
    ).resolves.toBeTruthy();
  });

  /** Scheduling is course-owned and still publishes exactly once. */
  it("publishes a scheduled answer once, idempotently, into the course archive", async () => {
    const { teacher, course, labs, instance } = await makeCs33();
    const asker = await askFrom(instance.id, labs[0]!.id);
    const inLabC = await makeEnrolledStudent(labs[2]!.id);

    const answer = await draftPublicAnswer(teacher.id, {
      courseId: course.id,
      itemIds: [asker.item.id],
      publicQuestionText: "Scheduled question",
      answerBody: "Scheduled answer.",
    });
    const due = new Date(Date.now() - 1000);
    await schedulePublication(teacher.id, answer.id, due, {
      anonymityAcknowledged: true,
    });

    expect(await publishDueAnswers(new Date())).toBe(1);
    // Re-running the sweep is a no-op: the transition is state-guarded.
    expect(await publishDueAnswers(new Date())).toBe(0);

    const rows = await db.query.publicAnswers.findMany({
      where: eq(publicAnswers.courseId, course.id),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.state).toBe("published");
    expect(await listCourseQa(inLabC.user.id, course.id)).toHaveLength(1);
  });
});

describe("the backlog publishes one course answer", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  /**
   * No target section is asked for, and none is recorded. Under the old model
   * this same item would have produced one PublicAnswer per section it was
   * exposed to.
   */
  it("creates a single course-owned answer with no section chosen", async () => {
    const { teacher, course, labs } = await makeCs33();
    const legacy = await importLegacyEntries(
      teacher.id,
      course.id,
      [{ text: "Why are AVL rotations needed?" }],
      "AY2025-2 Q&A document",
    );
    const question = legacy.created[0]!;
    await setBacklogState(teacher.id, question.id, "needs_review");
    await setBacklogState(teacher.id, question.id, "answerable");

    const answer = await draftFromBacklog(teacher.id, question.id, {
      answerBody: "To keep the tree balanced.",
    });
    expect(answer.courseId).toBe(course.id);
    expect(answer.originSectionId).toBeNull();
    expect(answer.sourceOrigin).toBe("legacy");

    // The backlog link is the only source — never a student identity.
    const links = await db.query.sourceLinks.findMany({
      where: eq(sourceLinks.publicAnswerId, answer.id),
    });
    expect(links).toHaveLength(1);
    expect(links[0]!.backlogQuestionId).toBe(question.id);
    expect(links[0]!.itemId).toBeNull();

    const moved = await db.query.backlogQuestions.findFirst({
      where: eq(backlogQuestions.id, question.id),
    });
    expect(moved!.state).toBe("drafting");

    await publishNow(teacher.id, answer.id, { anonymityAcknowledged: true });
    const rows = await db.query.publicAnswers.findMany({
      where: eq(publicAnswers.courseId, course.id),
    });
    expect(rows).toHaveLength(1);

    // Every lab reads it.
    for (const lab of labs) {
      const student = await makeEnrolledStudent(lab.id);
      expect(await listCourseQa(student.user.id, course.id)).toHaveLength(1);
    }
  });
});

describe("course-wide outputs did not make source data course-wide", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  /**
   * The regression this whole change had to avoid. An assistant delegated to
   * Lab A works on the course's shared queue and archive — and still sees only
   * Lab A's responses, with Lab B and Lab C contributing nothing to any
   * aggregate they can read.
   */
  it("keeps a section assistant's response access to their own section", async () => {
    const { teacher, course, labs, instance } = await makeCs33();
    await askFrom(instance.id, labs[0]!.id, "From Lab A");
    await askFrom(instance.id, labs[1]!.id, "From Lab B");
    await askFrom(instance.id, labs[2]!.id, "From Lab C");

    const ta = await makeUser();
    await addSectionStaff(labs[0]!.id, ta.id, "ta", {
      reviewResponses: true,
      draftPublicAnswers: true,
    });

    // The instructor's default "all sections" is all three.
    const all = await getCourseReviewQueue(teacher.id, course.id);
    expect(all.rows).toHaveLength(3);

    // The assistant's default "all sections" is Lab A alone.
    const mine = await getCourseReviewQueue(ta.id, course.id);
    expect(mine.rows).toHaveLength(1);
    expect(mine.rows[0]!.response.sectionId).toBe(labs[0]!.id);
    expect(JSON.stringify(mine.rows)).not.toContain("From Lab B");
    expect(JSON.stringify(mine.rows)).not.toContain("From Lab C");

    // Naming Lab B in the URL yields nothing rather than widening the scope.
    const forced = await getCourseReviewQueue(ta.id, course.id, {
      sectionId: labs[1]!.id,
    });
    expect(forced.rows).toHaveLength(0);
    expect(JSON.stringify(forced)).not.toContain("From Lab B");
  });

  /**
   * Filtering to one section constrains the aggregates too, not merely the
   * list — an "all sections" total that included rows the reader cannot open
   * would leak by arithmetic.
   */
  it("constrains the instructor's counts to the section filter", async () => {
    const { teacher, course, labs, instance } = await makeCs33();
    await askFrom(instance.id, labs[0]!.id, "From Lab A");
    await askFrom(instance.id, labs[1]!.id, "From Lab B");

    const all = await getCourseReviewQueue(teacher.id, course.id);
    expect(all.counts.needsReview).toBe(2);

    const justB = await getCourseReviewQueue(teacher.id, course.id, {
      sectionId: labs[1]!.id,
    });
    expect(justB.rows).toHaveLength(1);
    expect(justB.counts.needsReview).toBe(1);
    expect(JSON.stringify(justB.rows)).not.toContain("From Lab A");
  });
});
