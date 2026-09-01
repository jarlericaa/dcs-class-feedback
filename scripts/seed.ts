/**
 * Development seed. Idempotent: safe to re-run (keyed lookups, no duplicates).
 * The data is deliberately small but complete enough to exercise the staff
 * review, private reply, public answer, and class Q&A paths.
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
  const { and, desc, eq, isNull } = await import("drizzle-orm");
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
    where: eq(courses.code, "CS 33"),
  });
  if (!course) {
    // Migrate the original local demo key in place when this script is run
    // without a database reset. This keeps re-seeding from creating a second
    // demo course.
    const legacy = await db.query.courses.findFirst({
      where: eq(courses.code, "DCS-101"),
    });
    if (legacy) {
      [course] = await db
        .update(courses)
        .set({ code: "CS 33", title: "Data Structures and Algorithms II" })
        .where(eq(courses.id, legacy.id))
        .returning();
    }
  }
  if (!course) {
    [course] = await db
      .insert(courses)
      .values({
        code: "CS 33",
        title: "Data Structures and Algorithms II",
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
        title: "THX",
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
  } else if (section.title === "DCS-101 Section A") {
    // Keep an existing local seed recognizable after the course key changes.
    [section] = await db
      .update(classSections)
      .set({ title: "THX" })
      .where(eq(classSections.id, section.id))
      .returning();
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
    // The UP email is the access key: importing this list is the whole grant.
    // student@up.edu.ph is deliberately Juan's address, so the dev-login student
    // lands in this section immediately with no claiming step.
    await commitRosterImport(
      teacher.id,
      section!.id,
      parseRosterCsv(
        [
          "student number,full name,up mail",
          "2026-0001,Juan Dela Cruz,student@up.edu.ph",
          "2026-0002,Maria Clara Santos,maria.santos@up.edu.ph",
        ].join("\n"),
      ),
      "seed roster",
    );
  }
  // Demo student accounts. Nothing links either account to a roster record
  // beyond the email being on the class list above — which is the point.
  const student = await upsertUser({
    email: "student@up.edu.ph",
    displayName: "Juan Dela Cruz",
  });
  const maria = await upsertUser({
    email: "maria.santos@up.edu.ph",
    displayName: "Maria Clara Santos",
  });

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
    where: eq(recurrenceSchedules.templateId, template!.id),
  });
  if (!hasSchedule) {
    // Start on the Monday two weeks ago so one occurrence is open right now:
    // opens Monday 08:00, closes Sunday 23:59 (institution timezone).
    // Delivered to every section of the course, which is the ordinary case — the
    // sections answer the same form and the teacher reviews them together.
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) - 14);
    const startDate = monday.toISOString().slice(0, 10);
    const { configureDelivery } = await import("../src/modules/forms/schedules");
    await configureDelivery(teacher.id, course!.id, {
      templateId: template!.id,
      deliveryMode: "weekly",
      audienceMode: "all_sections",
      sectionIds: [],
      openDayOfWeek: 1,
      openTime: "08:00",
      deadlineDayOfWeek: 0,
      deadlineTime: "23:59",
      startDate,
      occurrenceCount: 16,
    });
  }

  // Materialize + open due cycles immediately.
  const { reconcile } = await import("../src/modules/scheduling");
  const result = await reconcile();

  // --- response examples ---------------------------------------------------
  // Use the real submission service so the seed exercises the same validation,
  // attribution, revisions, and audit paths as a student submission.
  const {
    formInstances,
    formQuestions,
    formResponses,
    privateResponses,
    publicAnswers,
    sourceLinks,
    studentRecords,
    studentSubmissionItems,
  } = await import("../src/db/schema");
  const { submitResponse } = await import("../src/modules/forms/submission");
  const { createPrivateResponse } = await import("../src/modules/review");
  const { draftPublicAnswer, publishNow } = await import(
    "../src/modules/publishing"
  );

  const openInstance = await db.query.formInstances.findFirst({
    where: and(
      eq(formInstances.courseId, course!.id),
      eq(formInstances.state, "open"),
    ),
    orderBy: desc(formInstances.openAt),
  });
  const snapshotQuestions = openInstance
    ? await db.query.formQuestions.findMany({
        where: eq(formQuestions.cycleId, openInstance.id),
        orderBy: (questions, { asc }) => [asc(questions.displayOrder)],
      })
    : [];

  type DemoQuestion = (typeof snapshotQuestions)[number];
  function demoAnswer(question: DemoQuestion, index: number) {
    switch (question.type) {
      case "multiple_choice":
      case "dropdown":
      case "checkboxes": {
        const options = Array.isArray(question.options)
          ? (question.options as { stableId: string }[])
          : [];
        const optionIds = options
          .slice(0, question.type === "checkboxes" ? 2 : 1)
          .map((option) => option.stableId);
        if (optionIds.length === 0) {
          throw new Error(`Seed form question ${question.id} has no options`);
        }
        return { questionId: question.id, optionIds };
      }
      case "linear_scale": {
        const scale = (question.scale ?? {}) as {
          min?: number;
          max?: number;
        };
        const min = scale.min ?? 1;
        const max = scale.max ?? 5;
        return {
          questionId: question.id,
          scaleValue: Math.min(max, min + 2 + (index % 2)),
        };
      }
      case "yes_no":
        return { questionId: question.id, boolValue: index % 2 === 0 };
      case "date":
        return { questionId: question.id, dateValue: "2026-09-01" };
      case "time":
        return { questionId: question.id, timeValue: "10:00" };
      case "short_answer":
      case "paragraph":
        return {
          questionId: question.id,
          text:
            index % 2 === 0
              ? "The examples made this week's topic easier to follow."
              : "More worked examples would help with the next problem set.",
        };
    }
  }

  const demoResponses = [
    {
      user: student,
      email: "student@up.edu.ph",
      item: {
        clientKey: "seed-juan-question",
        kind: "question" as const,
        submissionType: "question" as const,
        category: "content" as const,
        text: "Could we see one more worked example of tree rotations?",
      },
    },
    {
      user: maria,
      email: "maria.santos@up.edu.ph",
      item: {
        clientKey: "seed-maria-question",
        kind: "question" as const,
        submissionType: "question" as const,
        category: "logistics" as const,
        text: "When will the practice set for this topic be available?",
      },
      comment: {
        clientKey: "seed-maria-comment",
        kind: "general_comment" as const,
        submissionType: "feedback" as const,
        category: "misc" as const,
        text: "The pacing felt better once we started working through examples.",
      },
    },
  ];

  let seededResponseCount = 0;
  if (openInstance && snapshotQuestions.length > 0) {
    for (const demo of demoResponses) {
      const record = await db.query.studentRecords.findFirst({
        where: eq(studentRecords.rosterEmail, demo.email),
      });
      if (!record) continue;

      let response = await db.query.formResponses.findFirst({
        where: and(
          eq(formResponses.cycleId, openInstance.id),
          eq(formResponses.studentRecordId, record.id),
        ),
      });
      let itemId: string | null = null;
      if (!response) {
        const submitted = await submitResponse(demo.user.id, openInstance.id, {
          answers: snapshotQuestions.map(demoAnswer),
          items: [demo.item, ...(demo.comment ? [demo.comment] : [])],
        });
        response = await db.query.formResponses.findFirst({
          where: eq(formResponses.id, submitted.responseId),
        });
        itemId = submitted.studentItemId;
        seededResponseCount += 1;
      }

      if (!response) continue;
      if (!itemId) {
        const liveItem = await db.query.studentSubmissionItems.findFirst({
          where: and(
            eq(studentSubmissionItems.responseId, response.id),
            eq(studentSubmissionItems.kind, "question"),
            isNull(studentSubmissionItems.withdrawnAt),
          ),
        });
        itemId = liveItem?.id ?? null;
      }
      if (!itemId || demo.user.id !== maria.id) continue;

      const privateReply = await db.query.privateResponses.findFirst({
        where: eq(privateResponses.itemId, itemId),
      });
      if (!privateReply) {
        await createPrivateResponse(
          teacher.id,
          itemId,
          "I will add another worked example to the next review set.",
        );
      }

      const source = await db.query.sourceLinks.findFirst({
        where: eq(sourceLinks.itemId, itemId),
      });
      let publicAnswer = source
        ? await db.query.publicAnswers.findFirst({
            where: eq(publicAnswers.id, source.publicAnswerId),
          })
        : undefined;
      if (!publicAnswer) {
        publicAnswer = await draftPublicAnswer(teacher.id, {
          sectionId: section!.id,
          itemIds: [itemId],
          publicQuestionText: "When will the practice set for this topic be available?",
          answerBody: "The practice set will be available before the next class.",
          category: "logistics",
        });
      }
      if (publicAnswer.state === "draft" && publicAnswer.answerBody) {
        await publishNow(teacher.id, publicAnswer.id, {
          anonymityAcknowledged: true,
        });
      }
    }
  }

  console.log("Seed complete:", {
    admin: admin.email,
    teacher: teacher.email,
    ta: ta.email,
    student: "student@up.edu.ph (Juan Dela Cruz, 2026-0001 — rostered, no claim step)",
    course: course!.code,
    section: section!.title,
    responses: openInstance
      ? `${seededResponseCount} new response${seededResponseCount === 1 ? "" : "s"} seeded`
      : "No open form instance",
    scheduler: result,
  });
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
