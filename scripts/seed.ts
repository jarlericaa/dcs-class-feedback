/**
 * Development seed. Idempotent: safe to re-run (keyed lookups, no duplicates).
 * Populated fully in the UI-slice phase; foundation seeds users + catalog.
 */
export {};

async function main() {
  try {
    process.loadEnvFile();
  } catch {
    // no .env file — rely on real environment variables
  }

  // Dynamic imports so .env is loaded before src/env.ts parses process.env
  // (static imports would hoist above loadEnvFile).
  const { db } = await import("../src/db");
  const { classSections, courses, courseStaff, sectionStaff, users } =
    await import("../src/db/schema");
  const { eq } = await import("drizzle-orm");
  const { env } = await import("../src/env");

  async function upsertUser(u: {
    email: string;
    displayName: string;
    isTeacher?: boolean;
    isPlatformAdmin?: boolean;
  }) {
    const existing = await db.query.users.findFirst({
      where: eq(users.email, u.email),
    });
    if (existing) return existing;
    const [row] = await db
      .insert(users)
      .values({
        email: u.email,
        displayName: u.displayName,
        isTeacher: u.isTeacher ?? false,
        isPlatformAdmin: u.isPlatformAdmin ?? false,
      })
      .returning();
    return row!;
  }

  const admin = await upsertUser({
    email: "admin@up.edu.ph",
    displayName: "Platform Admin",
    isPlatformAdmin: true,
  });
  const teacher = await upsertUser({
    email: "teacher@up.edu.ph",
    displayName: "Teacher Demo",
    isTeacher: true,
  });
  const ta = await upsertUser({
    email: "sa@up.edu.ph",
    displayName: "Student Assistant",
  });

  let course = await db.query.courses.findFirst({
    where: eq(courses.code, "DCS-101"),
  });
  if (!course) {
    [course] = await db
      .insert(courses)
      .values({
        code: "DCS-101",
        title: "Introduction to Computing",
        ownerUserId: teacher.id,
      })
      .returning();
    await db
      .insert(courseStaff)
      .values({ courseId: course!.id, userId: teacher.id, role: "teacher" });
  }

  let section = await db.query.classSections.findFirst({
    where: eq(classSections.courseId, course!.id),
  });
  if (!section) {
    [section] = await db
      .insert(classSections)
      .values({
        courseId: course!.id,
        term: "AY2026-1",
        title: "DCS-101 Section A",
        timezone: env.INSTITUTION_TIMEZONE,
      })
      .returning();
    await db.insert(sectionStaff).values([
      {
        sectionId: section!.id,
        userId: teacher.id,
        role: "teacher",
      },
      {
        sectionId: section!.id,
        userId: ta.id,
        role: "ta",
        reviewResponses: true,
        sendPrivateResponses: true,
      },
    ]);
  }

  // --- roster + demo student account ---
  const { parseRosterCsv, commitRosterImport } = await import(
    "../src/modules/roster-import"
  );
  const { enrollments } = await import("../src/db/schema");
  const hasRoster = await db.query.enrollments.findFirst({
    where: eq(enrollments.sectionId, section!.id),
  });
  if (!hasRoster) {
    await commitRosterImport(
      teacher.id,
      section!.id,
      parseRosterCsv(
        [
          "student number,full name",
          "2026-0001,Juan Dela Cruz",
          "2026-0002,Maria Clara Santos",
          "2026-0003,Jose Rizal Mercado",
        ].join("\n"),
      ),
      "seed roster",
    );
  }
  // Demo student Google-less account for dev-login (matches Juan Dela Cruz).
  await upsertUser({ email: "student@up.edu.ph", displayName: "Juan Dela Cruz" });

  // --- weekly form template + recurrence schedule + cycles ---
  const { formTemplates, recurrenceSchedules } = await import(
    "../src/db/schema"
  );
  let template = await db.query.formTemplates.findFirst({
    where: eq(formTemplates.courseId, course!.id),
  });
  if (!template) {
    const { createTemplate } = await import("../src/modules/forms/templates");
    const created = await createTemplate(teacher.id, {
      courseId: course!.id,
      title: "Weekly check-in",
      visibility: "course_shared",
      questions: [
        {
          prompt: "How was this week's pace?",
          type: "multiple_choice",
          required: true,
          displayOrder: 0,
          category: "content",
          options: [
            { stableId: "too-slow", label: "Too slow", order: 0 },
            { stableId: "just-right", label: "Just right", order: 1 },
            { stableId: "too-fast", label: "Too fast", order: 2 },
          ],
        },
        {
          prompt: "Rate this week's lectures",
          type: "linear_scale",
          required: true,
          displayOrder: 1,
          scale: { min: 1, max: 5, step: 1 },
        },
        {
          prompt: "Anything else about this week?",
          type: "paragraph",
          required: false,
          displayOrder: 2,
        },
      ],
    });
    template = created.template;
  }

  const hasSchedule = await db.query.recurrenceSchedules.findFirst({
    where: eq(recurrenceSchedules.sectionId, section!.id),
  });
  if (!hasSchedule) {
    // Start on the Monday two weeks ago so one cycle is open right now:
    // opens Monday 08:00, closes Sunday 23:59 (institution timezone).
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) - 14);
    const startDate = monday.toISOString().slice(0, 10);
    await db.insert(recurrenceSchedules).values({
      sectionId: section!.id,
      openDayOfWeek: 1,
      openTime: "08:00:00",
      deadlineDayOfWeek: 0,
      deadlineTime: "23:59:00",
      startDate,
      occurrenceCount: 16,
      templateId: template!.id,
      timezone: env.INSTITUTION_TIMEZONE,
    });
  }

  // Materialize + open due cycles immediately.
  const { reconcile } = await import("../src/modules/scheduling");
  const result = await reconcile();

  console.log("Seed complete:", {
    admin: admin.email,
    teacher: teacher.email,
    ta: ta.email,
    student: "student@up.edu.ph (dev-login as Juan Dela Cruz, pending teacher confirmation)",
    course: course!.code,
    section: section!.title,
    scheduler: result,
  });
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
