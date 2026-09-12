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
  const { and, desc, eq, inArray, isNull } = await import("drizzle-orm");
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

  /**
   * CS 33 as it actually runs: one course, three laboratory sections with
   * different lab instructors (ADR-0005).
   *
   * The point of seeding three is to make the course-scoped model visible and
   * falsifiable in dev. The teaching team gets ONE form, ONE response
   * workspace, ONE question backlog, ONE publication queue and ONE Class Q&A;
   * the three sections differ only in who is enrolled, who staffs them, and
   * which section a response is attributed to.
   */
  const LAB_TITLES = ["Lab A", "Lab B", "Lab C"] as const;

  // An older local seed used a single section called "THX" (and before that
  // "DCS-101 Section A"). Rename it into Lab A rather than orphaning its
  // roster, responses and answers.
  const legacySingle = await db.query.classSections.findFirst({
    where: and(
      eq(classSections.courseId, course!.id),
      inArray(classSections.title, ["THX", "DCS-101 Section A"]),
    ),
  });
  if (legacySingle) {
    await db
      .update(classSections)
      .set({ title: "Lab A" })
      .where(eq(classSections.id, legacySingle.id));
  }

  const labs: (typeof classSections.$inferSelect)[] = [];
  for (const title of LAB_TITLES) {
    let lab = await db.query.classSections.findFirst({
      where: and(
        eq(classSections.courseId, course!.id),
        eq(classSections.title, title),
      ),
    });
    if (!lab) {
      [lab] = await db
        .insert(classSections)
        .values({
          courseId: course!.id,
          term: "AY2026-1",
          title,
          timezone: env.INSTITUTION_TIMEZONE,
        })
        .returning();
    }
    const hasStaff = await db.query.sectionStaff.findFirst({
      where: eq(sectionStaff.sectionId, lab!.id),
    });
    if (!hasStaff) {
      await db.insert(sectionStaff).values({
        sectionId: lab!.id,
        userId: teacher.id,
        role: "teacher",
      });
    }
    labs.push(lab!);
  }

  /**
   * The demo assistant is delegated to Lab A ALONE.
   *
   * That is what makes the authorization half of ADR-0005 checkable by hand:
   * they can open the course's shared publication queue and Class Q&A, and they
   * still cannot read a Lab B or Lab C submission. Making outputs course-wide
   * did not make source data course-wide.
   */
  const [labA, labB, labC] = labs as [
    typeof classSections.$inferSelect,
    typeof classSections.$inferSelect,
    typeof classSections.$inferSelect,
  ];
  const taRow = await db.query.sectionStaff.findFirst({
    where: and(
      eq(sectionStaff.sectionId, labA.id),
      eq(sectionStaff.userId, ta.id),
    ),
  });
  if (!taRow) {
    await db.insert(sectionStaff).values({
      sectionId: labA.id,
      userId: ta.id,
      role: "ta",
      reviewResponses: true,
      sendPrivateResponses: true,
      draftPublicAnswers: true,
    });
  }
  // --- roster + demo student account ---
  const { parseRosterCsv, commitRosterImport } = await import(
    "../src/modules/roster-import"
  );
  const { enrollments } = await import("../src/db/schema");
  /**
   * One class list per lab. The UP email is the access key: importing these
   * lists IS the whole grant.
   *
   * student@up.edu.ph is deliberately Juan's address, so the dev-login student
   * lands in Lab A with no claiming step. Maria sits in Lab B and Pedro in Lab
   * C, which is what lets the seeded data demonstrate the acceptance case: a
   * question asked in one lab, answered once, read by all three.
   */
  const ROSTERS: Record<string, string> = {
    [labA.id]: [
      "student number,full name,up mail",
      // Real UP shape — four-digit entry year, five-digit serial. The demo
      // list used to carry four-digit serials, which made the class list read
      // "Student number ending 0001" and hid what the format actually looks
      // like (GitHub issue #12).
      "2026-00001,Juan Dela Cruz,student@up.edu.ph",
    ].join("\n"),
    [labB.id]: [
      "student number,full name,up mail",
      "2026-00002,Maria Clara Santos,maria.santos@up.edu.ph",
    ].join("\n"),
    [labC.id]: [
      "student number,full name,up mail",
      "2026-00003,Pedro Penduko,pedro.penduko@up.edu.ph",
    ].join("\n"),
  };
  for (const lab of labs) {
    const hasRoster = await db.query.enrollments.findFirst({
      where: eq(enrollments.sectionId, lab.id),
    });
    if (hasRoster) continue;
    await commitRosterImport(
      teacher.id,
      lab.id,
      parseRosterCsv(ROSTERS[lab.id]!),
      `seed roster — ${lab.title}`,
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
  const pedro = await upsertUser({
    email: "pedro.penduko@up.edu.ph",
    displayName: "Pedro Penduko",
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
        /**
         * A prompt carrying real authored content: inline maths and a code
         * span, with Markdown help text under it.
         *
         * The seed used to offer nothing but plain sentences, which made the
         * review view's rendering impossible to judge from demo data — issue
         * #10 asks exactly that question ("is seeded data being mistaken for
         * the production format?"). A teacher writing `$\\int$` in a prompt is
         * ordinary, so the demo form contains one.
         */
        {
          prompt:
            "Was the derivation of $\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$ clear?",
          description:
            "Say **which step** lost you, or name the `induction` case.",
          type: "short_answer",
          required: true,
          displayOrder: 2,
        },
        {
          prompt: "Anything else about this week?",
          description: "Optional. Anything the questions above did not cover.",
          type: "paragraph",
          required: false,
          displayOrder: 3,
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
  /**
   * Bring the open occurrence's audience up to date with the course's sections.
   *
   * A form instance SNAPSHOTS its audience when it is generated, and that is
   * correct domain behaviour — adding a section later must not silently change
   * who an already-generated occurrence went to. But this seed adds Lab B and
   * Lab C to a course that, on a database seeded before they existed, already
   * has occurrences naming only Lab A. Without this the three-lab demonstration
   * cannot be seeded at all on an existing dev database: the Lab B student is
   * refused the form they are supposed to answer.
   *
   * Seed-only reconciliation, deliberately not a service call: nothing in the
   * app rewrites a generated audience, and nothing here should teach that it may.
   */
  if (openInstance) {
    const { formInstanceSections } = await import("../src/db/schema");
    const existing = await db.query.formInstanceSections.findMany({
      where: eq(formInstanceSections.instanceId, openInstance.id),
    });
    const have = new Set(existing.map((row) => row.sectionId));
    const missing = labs.filter((lab) => !have.has(lab.id));
    if (missing.length > 0) {
      await db.insert(formInstanceSections).values(
        missing.map((lab) => ({
          instanceId: openInstance.id,
          sectionId: lab.id,
        })),
      );
    }
  }

  const snapshotQuestions = openInstance
    ? await db.query.formQuestions.findMany({
        where: eq(formQuestions.cycleId, openInstance.id),
        orderBy: (questions, { asc }) => [asc(questions.displayOrder)],
      })
    : [];

  type DemoQuestion = (typeof snapshotQuestions)[number];
  /**
   * One student's answer to one question, or `null` for a question they left
   * alone.
   *
   * The second demo student skips every OPTIONAL question, so the seeded week
   * contains the case the review view has to state rather than hide: a
   * question the form asked and nobody answered. Required questions are never
   * skipped — the server would refuse the submission.
   */
  function demoAnswer(question: DemoQuestion, index: number) {
    if (!question.required && index % 2 === 1) return null;
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
              ? /* Long on purpose: the review column collapses an answer past
                   `LONG_TEXT_CHARS`, and a demo week with nothing long in it
                   cannot show that the control works. */
                "The examples made this week's topic easier to follow, " +
                "especially the second one where we walked through the " +
                "recurrence step by step instead of jumping straight to the " +
                "closed form. I had been treating the base case as a " +
                "formality, and seeing it actually fail for n = 0 was what " +
                "made the induction click. The part I am still unsure about " +
                "is when to unroll a recurrence versus when to guess a bound " +
                "and verify it — both were presented as options and I cannot " +
                "yet tell which one a problem is asking for. If there is a " +
                "rule of thumb for choosing between them, that would help " +
                "more than another worked example of either one on its own."
              : "More worked examples would help with the next problem set.",
        };
    }
  }

  /**
   * One response per lab, so the seeded week proves the acceptance case:
   * Juan asks in Lab A, Maria in Lab B, Pedro comments from Lab C, and all
   * three answer the SAME shared occurrence. Responses keep their attribution
   * section; the answer the team publishes does not have one.
   */
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
    {
      user: pedro,
      email: "pedro.penduko@up.edu.ph",
      item: {
        clientKey: "seed-pedro-question",
        kind: "question" as const,
        submissionType: "question" as const,
        category: "content" as const,
        text: "Is the AVL balance factor checked before or after the rotation?",
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
          answers: snapshotQuestions
            .map(demoAnswer)
            .filter((a): a is NonNullable<typeof a> => a !== null),
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
        /**
         * ONE answer for the course — not one per lab.
         *
         * Maria asked it from Lab B; Juan in Lab A and Pedro in Lab C read the
         * same published entry, and neither can tell which lab it came from.
         * That single row is the whole of ADR-0005 in the seed data: a course
         * with three sections ends up with one PublicAnswer, not three.
         */
        publicAnswer = await draftPublicAnswer(teacher.id, {
          courseId: course!.id,
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
    student: "student@up.edu.ph (Juan Dela Cruz, 2026-00001 — Lab A, no claim step)",
    course: course!.code,
    sections: labs.map((lab) => lab.title).join(", "),
    /* The assistant is delegated to Lab A only — the fixture for "course-wide
       outputs did not make source data course-wide". */
    assistantScope: `${ta.email} reviews ${labA.title} only`,
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
