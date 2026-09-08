import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, truncateAll } from "./helpers";
import { addSectionStaff, makeCourse, makeSection, makeUser } from "./fixtures";
import { courses, courseStaff, formTemplates } from "@/db/schema";
import {
  AuthzError,
  CourseArchivedError,
  SECTION_PERMISSIONS,
} from "@/modules/authz";
import {
  createTemplate,
  createTemplateVersion,
  getTemplateDetail,
  listTemplatesForCourse,
  listTemplatesForSection,
  updateTemplateDetails,
} from "@/modules/forms/templates";
import { configureDelivery } from "@/modules/forms/schedules";
import { listInstancesForTemplate } from "@/modules/forms/instances";

/**
 * `manage_templates` is a real, delegable permission.
 *
 * A form belongs to the COURSE while the flag is granted per SECTION, and the
 * course-staff-only gate that used to guard these entry points made the
 * permission unusable: an owner could grant it, it opened the forms nav group,
 * and then every action behind it was refused. roles-and-permissions.md §3
 * lists "Manage templates" as `C (manage_templates)` and does not put it in the
 * non-delegable table, so honouring it is the specified behaviour — the same
 * shape the course-level backlog already resolves with
 * `requireCourseStaffOrSectionGrant`.
 *
 * What must NOT move with it: delivery. A student assistant who may edit a
 * form's questions still may not decide which sections receive it or when.
 */

const QUESTIONS = [
  {
    prompt: "How was the pace?",
    type: "short_answer" as const,
    required: true,
    displayOrder: 0,
  },
];

/** One course, one section, and one form already on it. */
async function workspace() {
  const owner = await makeUser({ isTeacher: true });
  const course = await makeCourse(owner.id);
  const section = await makeSection(course.id);
  await addSectionStaff(section.id, owner.id, "teacher");
  const { template } = await createTemplate(owner.id, {
    courseId: course.id,
    title: "Weekly check-in",
    questions: QUESTIONS,
  });
  return { owner, course, section, template };
}

/** A section assistant holding exactly the flags named. */
async function assistant(
  sectionId: string,
  ...permissions: (typeof SECTION_PERMISSIONS)[number][]
) {
  const user = await makeUser({});
  await addSectionStaff(
    sectionId,
    user.id,
    "ta",
    Object.fromEntries(permissions.map((p) => [p, true])),
  );
  return user;
}

describe("manage_templates lets a section assistant work on the course's forms", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("permits every template entry point", async () => {
    const { course, section, template } = await workspace();
    const ta = await assistant(section.id, "manageTemplates");

    // read the list, and one form in detail
    const listed = await listTemplatesForCourse(ta.id, course.id);
    expect(listed.map((t) => t.template.id)).toEqual([template.id]);
    const detail = await getTemplateDetail(ta.id, template.id);
    expect(detail.questions).toHaveLength(1);

    // edit it — which means adding the next immutable version
    const version = await createTemplateVersion(ta.id, template.id, [
      ...QUESTIONS,
      {
        prompt: "Anything else?",
        type: "paragraph" as const,
        required: false,
        displayOrder: 1,
      },
    ]);
    expect(version.versionNumber).toBe(2);
    expect(version.createdByUserId).toBe(ta.id);

    // rename it
    await updateTemplateDetails(ta.id, template.id, { title: "Renamed" });
    expect(
      (await db.query.formTemplates.findFirst({
        where: eq(formTemplates.id, template.id),
      }))!.title,
    ).toBe("Renamed");

    // and create one of their own, owned by them
    const created = await createTemplate(ta.id, {
      courseId: course.id,
      title: "Assistant's form",
      questions: QUESTIONS,
    });
    expect(created.template.ownerUserId).toBe(ta.id);
    expect(await listTemplatesForCourse(ta.id, course.id)).toHaveLength(2);
  });

  it("refuses an assistant who holds every OTHER flag", async () => {
    const { course, section, template } = await workspace();
    // Every permission except this one: nothing else substitutes for it.
    const ta = await assistant(
      section.id,
      ...SECTION_PERMISSIONS.filter((p) => p !== "manageTemplates"),
    );

    await expect(
      listTemplatesForCourse(ta.id, course.id),
    ).rejects.toBeInstanceOf(AuthzError);
    await expect(getTemplateDetail(ta.id, template.id)).rejects.toBeInstanceOf(
      AuthzError,
    );
    await expect(
      createTemplateVersion(ta.id, template.id, QUESTIONS),
    ).rejects.toBeInstanceOf(AuthzError);
    await expect(
      updateTemplateDetails(ta.id, template.id, { title: "No" }),
    ).rejects.toBeInstanceOf(AuthzError);
    await expect(
      createTemplate(ta.id, {
        courseId: course.id,
        title: "No",
        questions: QUESTIONS,
      }),
    ).rejects.toBeInstanceOf(AuthzError);
  });

  it("does not reach a form in a course the assistant does not staff", async () => {
    const mine = await workspace();
    const theirs = await workspace();
    // The flag is real, but held on a section of a DIFFERENT course.
    const ta = await assistant(mine.section.id, "manageTemplates");

    await expect(
      listTemplatesForCourse(ta.id, theirs.course.id),
    ).rejects.toBeInstanceOf(AuthzError);
    await expect(
      getTemplateDetail(ta.id, theirs.template.id),
    ).rejects.toBeInstanceOf(AuthzError);
    await expect(
      createTemplateVersion(ta.id, theirs.template.id, QUESTIONS),
    ).rejects.toBeInstanceOf(AuthzError);
    await expect(
      updateTemplateDetails(ta.id, theirs.template.id, { title: "No" }),
    ).rejects.toBeInstanceOf(AuthzError);
    await expect(
      createTemplate(ta.id, {
        courseId: theirs.course.id,
        title: "No",
        questions: QUESTIONS,
      }),
    ).rejects.toBeInstanceOf(AuthzError);
    // And the other course's form is untouched.
    expect(
      (await db.query.formTemplates.findFirst({
        where: eq(formTemplates.id, theirs.template.id),
      }))!.title,
    ).toBe("Weekly check-in");
  });

  it("keeps the flag section-scoped: one section of the course is enough, none is not", async () => {
    const { course } = await workspace();
    // A second section of the SAME course, and an assistant on that one only.
    const other = await makeSection(course.id);
    const ta = await assistant(other.id, "manageTemplates");
    // The form is a property of the course, so standing on any of its sections
    // reaches it — the same rule the backlog follows.
    expect(await listTemplatesForCourse(ta.id, course.id)).toHaveLength(1);

    // Someone with the flag on no section of this course at all.
    const stranger = await makeUser({});
    await expect(
      listTemplatesForCourse(stranger.id, course.id),
    ).rejects.toBeInstanceOf(AuthzError);
  });
});

describe("instructor and course-staff behaviour is unchanged", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("still admits the owner and a course-wide staff member", async () => {
    const { course, template } = await workspace();
    const coTeacher = await makeUser({ isTeacher: true });
    await db
      .insert(courseStaff)
      .values({ courseId: course.id, userId: coTeacher.id, role: "teacher" });

    // No section row of their own, and no flag: course-wide standing alone.
    expect(await listTemplatesForCourse(coTeacher.id, course.id)).toHaveLength(1);
    expect((await getTemplateDetail(coTeacher.id, template.id)).template.id).toBe(
      template.id,
    );
    await updateTemplateDetails(coTeacher.id, template.id, { title: "Theirs" });
    expect(
      (await createTemplateVersion(coTeacher.id, template.id, QUESTIONS))
        .versionNumber,
    ).toBe(2);
  });

  it("still refuses an unrelated teacher", async () => {
    const { course, template } = await workspace();
    const outsider = await makeUser({ isTeacher: true });

    await expect(
      listTemplatesForCourse(outsider.id, course.id),
    ).rejects.toBeInstanceOf(AuthzError);
    await expect(
      getTemplateDetail(outsider.id, template.id),
    ).rejects.toBeInstanceOf(AuthzError);
    await expect(
      createTemplate(outsider.id, {
        courseId: course.id,
        title: "No",
        questions: QUESTIONS,
      }),
    ).rejects.toBeInstanceOf(AuthzError);
  });

  it("still resolves a missing form before authorizing, so an unknown id is not an access answer", async () => {
    const { section } = await workspace();
    const ta = await assistant(section.id, "manageTemplates");
    await expect(
      getTemplateDetail(ta.id, "00000000-0000-4000-8000-000000000000"),
    ).rejects.toThrow("Template not found");
  });
});

describe("the archive rule survives the delegation", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  async function archived() {
    const w = await workspace();
    const ta = await assistant(w.section.id, "manageTemplates");
    await db
      .update(courses)
      .set({ archivedAt: new Date() })
      .where(eq(courses.id, w.course.id));
    return { ...w, ta };
  }

  it("refuses writes on an archived course, through EITHER branch", async () => {
    const { owner, ta, course, template } = await archived();
    for (const actor of [owner.id, ta.id]) {
      await expect(
        createTemplate(actor, {
          courseId: course.id,
          title: "No",
          questions: QUESTIONS,
        }),
      ).rejects.toBeInstanceOf(CourseArchivedError);
      await expect(
        createTemplateVersion(actor, template.id, QUESTIONS),
      ).rejects.toBeInstanceOf(CourseArchivedError);
      await expect(
        updateTemplateDetails(actor, template.id, { title: "No" }),
      ).rejects.toBeInstanceOf(CourseArchivedError);
    }
  });

  it("still allows reads on an archived course, through either branch", async () => {
    const { owner, ta, course, template } = await archived();
    for (const actor of [owner.id, ta.id]) {
      expect(await listTemplatesForCourse(actor, course.id)).toHaveLength(1);
      expect((await getTemplateDetail(actor, template.id)).template.id).toBe(
        template.id,
      );
    }
  });
});

describe("delivery authorization did not move", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("does not let manage_templates configure a schedule or read the delivery picker", async () => {
    const { course, section, template } = await workspace();
    const ta = await assistant(section.id, "manageTemplates");

    // Who receives a form, and when, is `manage_weekly_cycles` — untouched.
    await expect(
      configureDelivery(ta.id, course.id, {
        templateId: template.id,
        deliveryMode: "weekly",
        audienceMode: "all_sections",
        sectionIds: [],
        openDayOfWeek: 1,
        openTime: "08:00",
        deadlineDayOfWeek: 5,
        deadlineTime: "17:00",
        startDate: "2026-01-05",
        occurrenceCount: 1,
      }),
    ).rejects.toBeInstanceOf(AuthzError);

    // The section-scoped picker stays on the delivery flag too: it exists to
    // choose a form for a SCHEDULE, which this assistant cannot create.
    await expect(
      listTemplatesForSection(ta.id, section.id, course.id),
    ).rejects.toBeInstanceOf(AuthzError);

    // Even a staff member with the delivery flag cannot use a permitted section
    // as a selector for a different course's forms.
    const other = await workspace();
    const otherScheduler = await assistant(other.section.id, "manageWeeklyCycles");
    await expect(
      listTemplatesForSection(otherScheduler.id, other.section.id, course.id),
    ).rejects.toBeInstanceOf(AuthzError);

    // The cycle flag alone still reaches the picker, and still not the forms.
    const scheduler = await assistant(section.id, "manageWeeklyCycles");
    expect(
      await listTemplatesForSection(scheduler.id, section.id, course.id),
    ).toHaveLength(1);
    await expect(
      updateTemplateDetails(scheduler.id, template.id, { title: "No" }),
    ).rejects.toBeInstanceOf(AuthzError);
  });

  /**
   * The occurrence list stays course-staff-only, and that is why the form's own
   * page still guards it.
   *
   * A form's OCCURRENCES are delivery, not definition, so this read did not
   * move with `manage_templates`. It matters to the UI: the form page reads the
   * definition and the occurrence list together, so once the first admits a
   * templates-only assistant the second has to refuse them through the page's
   * own "no access" panel rather than as an unhandled throw.
   */
  it("keeps a form's occurrence list on course standing", async () => {
    const { owner, section, template } = await workspace();
    const ta = await assistant(section.id, "manageTemplates");

    // The definition opens...
    expect((await getTemplateDetail(ta.id, template.id)).template.id).toBe(
      template.id,
    );
    // ...and its occurrences do not.
    await expect(
      listInstancesForTemplate(ta.id, template.id),
    ).rejects.toBeInstanceOf(AuthzError);
    // Course staff still read both.
    expect(await listInstancesForTemplate(owner.id, template.id)).toEqual([]);
  });
});
