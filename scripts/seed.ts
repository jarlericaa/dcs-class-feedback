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
  const { classSections, courses, courseStaff, sectionStaff, users, platformAdminAccounts } =
    await import("../src/db/schema");
  const { and, desc, eq, inArray, isNull } = await import("drizzle-orm");
  const { env } = await import("../src/env");
  const { hashPlatformAdminPassword } = await import("../src/modules/platform-admin/credentials");

  async function upsertUser(u: {
    email: string;
    displayName: string;
    isTeacher?: boolean;
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
      })
      .returning();
    return row!;
  }

  const bootstrapPassword = process.env.DEV_PLATFORM_ADMIN_PASSWORD;
  const existingAdmin = await db.query.platformAdminAccounts.findFirst({
    where: eq(platformAdminAccounts.username, "admin"),
  });
  const admin = existingAdmin ?? (bootstrapPassword
    ? (await db.insert(platformAdminAccounts).values({
        username: "admin",
        displayName: "Platform Admin",
        passwordHash: await hashPlatformAdminPassword(bootstrapPassword),
        passwordChangedAt: new Date(),
      }).returning())[0]
    : null);
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
   * workspace, ONE Question Backlog editorial workspace and ONE Class Q&A;
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
   * they can open the course's shared Question Backlog and Class Q&A, and they
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
  /**
   * One class list per lab — a realistic class, not three people.
   *
   * The UP email is the access key: importing these lists IS the whole grant.
   * `student@up.edu.ph` is deliberately Juan's address so the dev-login student
   * lands in Lab A with no claiming step; Maria sits in Lab B and Pedro in Lab
   * C, which is what lets the seeded data demonstrate the acceptance case — a
   * question asked in one lab, answered once, read by all three.
   *
   * The rest exist so the demo has enough people to be worth looking at: a
   * five-student lab produces a multiple-choice distribution, a rating spread
   * and a participation matrix with gaps in it. Three students produced three
   * bars of height one, which showed nothing about how the views behave.
   */
  const CLASS_LIST: Record<string, { number: string; name: string; email: string }[]> = {
    [labA.id]: [
      // Real UP shape — four-digit entry year, five-digit serial. The demo list
      // used to carry four-digit serials, which made the class list read
      // "Student number ending 0001" and hid the real format (issue #12).
      { number: "2026-00001", name: "Juan Dela Cruz", email: "student@up.edu.ph" },
      { number: "2026-00011", name: "Ana Reyes", email: "ana.reyes@up.edu.ph" },
      { number: "2026-00012", name: "Miguel Torres", email: "miguel.torres@up.edu.ph" },
      { number: "2026-00013", name: "Liza Bautista", email: "liza.bautista@up.edu.ph" },
      { number: "2026-00014", name: "Noel Aquino", email: "noel.aquino@up.edu.ph" },
    ],
    [labB.id]: [
      { number: "2026-00002", name: "Maria Clara Santos", email: "maria.santos@up.edu.ph" },
      { number: "2026-00021", name: "Carlo Villanueva", email: "carlo.villanueva@up.edu.ph" },
      { number: "2026-00022", name: "Bea Ocampo", email: "bea.ocampo@up.edu.ph" },
      { number: "2026-00023", name: "Rafael Lim", email: "rafael.lim@up.edu.ph" },
      { number: "2026-00024", name: "Divina Castro", email: "divina.castro@up.edu.ph" },
    ],
    [labC.id]: [
      { number: "2026-00003", name: "Pedro Penduko", email: "pedro.penduko@up.edu.ph" },
      { number: "2026-00031", name: "Grace Mendoza", email: "grace.mendoza@up.edu.ph" },
      { number: "2026-00032", name: "Ibarra Salazar", email: "ibarra.salazar@up.edu.ph" },
      { number: "2026-00033", name: "Teresa Uy", email: "teresa.uy@up.edu.ph" },
      { number: "2026-00034", name: "Andres Bonifacio", email: "andres.bonifacio@up.edu.ph" },
    ],
  };

  /**
   * Re-imported on every run rather than skipped when the section already has
   * enrolments.
   *
   * The import is idempotent by design ("safe re-import" —
   * docs/domain/student-identity.md), so running it again updates and adds
   * without duplicating. Skipping on the first existing enrolment is what made
   * an enriched class list invisible to anyone whose database predated it:
   * three students stayed three forever.
   */
  for (const lab of labs) {
    const rows = CLASS_LIST[lab.id]!;
    await commitRosterImport(
      teacher.id,
      lab.id,
      parseRosterCsv(
        [
          "student number,full name,up mail",
          ...rows.map((r) => `${r.number},${r.name},${r.email}`),
        ].join("\n"),
      ),
      `seed roster — ${lab.title}`,
    );
  }

  /**
   * Demo student accounts — one per rostered student.
   *
   * Nothing links an account to a roster record beyond the email being on the
   * class list above, which is the point: the account is created here only so
   * the seed can submit a response AS that student through the real service.
   */
  const accounts = new Map<string, Awaited<ReturnType<typeof upsertUser>>>();
  for (const rows of Object.values(CLASS_LIST)) {
    for (const row of rows) {
      accounts.set(
        row.email,
        await upsertUser({ email: row.email, displayName: row.name }),
      );
    }
  }

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

  /** Every occurrence that is open right now — normally the one weekly form. */
  const openInstances = await db.query.formInstances.findMany({
    where: and(
      eq(formInstances.courseId, course!.id),
      eq(formInstances.state, "open"),
    ),
    orderBy: desc(formInstances.openAt),
  });
  const openInstance = openInstances[0] ?? null;
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
  for (const instance of openInstances) {
    const { formInstanceSections } = await import("../src/db/schema");
    const existing = await db.query.formInstanceSections.findMany({
      where: eq(formInstanceSections.instanceId, instance.id),
    });
    const have = new Set(existing.map((row) => row.sectionId));
    const missing = labs.filter((lab) => !have.has(lab.id));
    if (missing.length > 0) {
      await db.insert(formInstanceSections).values(
        missing.map((lab) => ({
          instanceId: instance.id,
          sectionId: lab.id,
        })),
      );
    }
  }

  /** The shape of one snapshotted question, for `demoAnswer` to key off. */
  type DemoQuestion = typeof formQuestions.$inferSelect;

  /**
   * One student's answer to one question, or `null` for a question they left
   * alone.
   *
   * `variant` is the STUDENT; `index` is the question. Both are mixed into
   * every choice, which is the whole point: a seed where each question got one
   * canned answer produced a bar chart of identical bars and a rating
   * distribution with a single spike, so none of the aggregate views could be
   * judged from demo data. Spreading answers across the options and the scale
   * makes "By question" show a real shape.
   *
   * Every student answers every question, optional ones included. An earlier
   * version skipped optional questions on a rotation so the review view would
   * have a "4 skipped" case to render; the owner did not want that noise in
   * the demo data, so the seeded week is simply complete.
   */
  function demoAnswer(question: DemoQuestion, index: number, variant = 0) {
    /**
     * 7 and 3, not 3 and 1.
     *
     * The multiplier has to be COPRIME with the option counts it will be taken
     * modulo, or the spread collapses. `variant * 3` against a three-option
     * question is always 0, which is how the first version of this seed gave
     * fifteen students the identical answer and a bar chart with one bar.
     */
    const mix = variant * 7 + index * 3;
    switch (question.type) {
      case "multiple_choice":
      case "dropdown":
      case "checkboxes": {
        const options = Array.isArray(question.options)
          ? (question.options as { stableId: string }[])
          : [];
        if (options.length === 0) {
          throw new Error(`Seed form question ${question.id} has no options`);
        }
        if (question.type === "checkboxes") {
          // A varying NUMBER of boxes, not just varying boxes: one student
          // ticking everything and another ticking one is the realistic range.
          const count = 1 + (variant % Math.min(3, options.length));
          const picked = Array.from({ length: count }, (_, k) =>
            options[(variant + k) % options.length]!.stableId,
          );
          return { questionId: question.id, optionIds: [...new Set(picked)] };
        }
        return {
          questionId: question.id,
          optionIds: [options[mix % options.length]!.stableId],
        };
      }
      case "linear_scale": {
        const scale = (question.scale ?? {}) as { min?: number; max?: number };
        const min = scale.min ?? 1;
        const max = scale.max ?? 5;
        const span = Math.max(1, max - min + 1);
        /* Weighted toward the middle-high end, the way real course ratings
           sit, rather than uniformly across the scale. */
        const offsets = [2, 3, 1, 4, 2, 3, 0, 3];
        return {
          questionId: question.id,
          scaleValue: Math.min(max, min + (offsets[mix % offsets.length]! % span)),
        };
      }
      case "yes_no":
        return { questionId: question.id, boolValue: mix % 3 !== 0 };
      case "date":
        return { questionId: question.id, dateValue: "2026-09-01" };
      case "time":
        return { questionId: question.id, timeValue: "10:00" };
      case "short_answer":
      case "paragraph": {
        /* One long answer on purpose: the review column collapses anything
           past `LONG_TEXT_CHARS`, and a demo week with nothing long in it
           cannot show that the control works. */
        const LONG =
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
          "more than another worked example of either one on its own.";
        const SHORT = [
          "More worked examples would help with the next problem set.",
          "The pace was fine, but the notation moved faster than the ideas did.",
          "Clear, especially once the diagram went up on the board.",
          "I followed the lecture but could not start the exercise afterwards.",
          "Second half was much easier to follow than the first.",
          "Please post the board photos — I could not copy everything down.",
        ];
        return {
          questionId: question.id,
          text: mix % 5 === 0 ? LONG : SHORT[mix % SHORT.length]!,
        };
      }
    }
  }

  /**
   * The student-originated questions and comments, by author.
   *
   * Spread across all three labs and all three categories, because the review
   * inbox, the category filters and the backlog all key off that split. Every
   * one of these is a question a student in this course could plausibly ask;
   * several are answered publicly further down, and the rest are left
   * unanswered on purpose so the inbox has real work in it.
   */
  const STUDENT_ITEMS: Record<
    string,
    {
      question?: { text: string; category: "content" | "logistics" | "misc" };
      comment?: { text: string };
    }
  > = {
    "student@up.edu.ph": {
      question: {
        text: "Could we see one more worked example of tree rotations?",
        category: "content",
      },
    },
    "maria.santos@up.edu.ph": {
      question: {
        text: "When will the practice set for this topic be available?",
        category: "logistics",
      },
      comment: {
        text: "The pacing felt better once we started working through examples.",
      },
    },
    "pedro.penduko@up.edu.ph": {
      question: {
        text: "Is the AVL balance factor checked before or after the rotation?",
        category: "content",
      },
    },
    "ana.reyes@up.edu.ph": {
      question: {
        text: "Will the long exam cover the proofs, or only the implementations?",
        category: "logistics",
      },
    },
    "miguel.torres@up.edu.ph": {
      question: {
        text: "What is the difference between amortized and average-case cost?",
        category: "content",
      },
      comment: { text: "The lab manual and the slides use different notation." },
    },
    "carlo.villanueva@up.edu.ph": {
      question: {
        text: "Can we use the STL priority queue in the machine problem, or do we implement our own heap?",
        category: "logistics",
      },
    },
    "bea.ocampo@up.edu.ph": {
      question: {
        text: "Why does a red-black tree allow two reds in a row on different branches but not on the same path?",
        category: "content",
      },
    },
    "grace.mendoza@up.edu.ph": {
      question: {
        text: "Could the consultation hours be moved later? They overlap with another class.",
        category: "logistics",
      },
    },
    "ibarra.salazar@up.edu.ph": {
      comment: {
        text: "The worked examples in lab helped more than the lecture slides did.",
      },
    },
    "teresa.uy@up.edu.ph": {
      question: {
        text: "Is there a reading that explains why the height bound is logarithmic?",
        category: "content",
      },
    },
    "rafael.lim@up.edu.ph": {
      comment: { text: "Please keep posting the board photos after each session." },
    },
  };

  /**
   * Students who deliberately do NOT submit, so participation has gaps.
   *
   * A matrix where every cell is a tick proves nothing about how the view
   * renders a missing week, and a bonus-period count that always equals the
   * roster size cannot show a shortfall.
   */
  const NON_SUBMITTERS = new Set([
    "noel.aquino@up.edu.ph",
    "divina.castro@up.edu.ph",
    "andres.bonifacio@up.edu.ph",
  ]);

  /** Every rostered student, in a stable order, with their variant number. */
  const rosterEntries = Object.values(CLASS_LIST).flat();

  let seededResponseCount = 0;
  const itemIdByEmail = new Map<string, string>();

  for (const instance of openInstances) {
    const questions = await db.query.formQuestions.findMany({
      where: eq(formQuestions.cycleId, instance.id),
      orderBy: (q, { asc }) => [asc(q.displayOrder)],
    });
    if (questions.length === 0) continue;
    /* Student-originated items belong to ONE occurrence, not to every open
       form: attaching the same question to both would read as the student
       having asked it twice. The weekly form is where they go. */
    const carriesItems = instance.id === openInstance?.id;

    for (const [variant, row] of rosterEntries.entries()) {
      if (NON_SUBMITTERS.has(row.email)) continue;
      const account = accounts.get(row.email);
      const record = await db.query.studentRecords.findFirst({
        where: eq(studentRecords.rosterEmail, row.email),
      });
      if (!account || !record) continue;

      let response = await db.query.formResponses.findFirst({
        where: and(
          eq(formResponses.cycleId, instance.id),
          eq(formResponses.studentRecordId, record.id),
        ),
      });

      const spec = carriesItems ? STUDENT_ITEMS[row.email] : undefined;
      if (!response) {
        const items = [
          ...(spec?.question
            ? [
                {
                  clientKey: `seed-${row.email}-question`,
                  kind: "question" as const,
                  submissionType: "question" as const,
                  category: spec.question.category,
                  text: spec.question.text,
                },
              ]
            : []),
          ...(spec?.comment
            ? [
                {
                  clientKey: `seed-${row.email}-comment`,
                  kind: "general_comment" as const,
                  submissionType: "feedback" as const,
                  category: "misc" as const,
                  text: spec.comment.text,
                },
              ]
            : []),
        ];
        const submitted = await submitResponse(account.id, instance.id, {
          answers: questions
            .map((q, index) => demoAnswer(q, index, variant))
            .filter((a): a is NonNullable<typeof a> => a !== null),
          items,
        });
        response = await db.query.formResponses.findFirst({
          where: eq(formResponses.id, submitted.responseId),
        });
        seededResponseCount += 1;
        if (submitted.studentItemId) {
          itemIdByEmail.set(row.email, submitted.studentItemId);
        }
      }

      if (response && carriesItems && !itemIdByEmail.has(row.email)) {
        const liveItem = await db.query.studentSubmissionItems.findFirst({
          where: and(
            eq(studentSubmissionItems.responseId, response.id),
            eq(studentSubmissionItems.kind, "question"),
            isNull(studentSubmissionItems.withdrawnAt),
          ),
        });
        if (liveItem) itemIdByEmail.set(row.email, liveItem.id);
      }
    }
  }

  /**
   * A private reply — visible to its asker and to staff, and to nobody else.
   * Seeded so the student history view has one to render.
   */
  const mariaItemId = itemIdByEmail.get("maria.santos@up.edu.ph");
  if (mariaItemId) {
    const existingReply = await db.query.privateResponses.findFirst({
      where: eq(privateResponses.itemId, mariaItemId),
    });
    if (!existingReply) {
      await createPrivateResponse(
        teacher.id,
        mariaItemId,
        "I will add another worked example to the next review set.",
      );
    }
  }

  /**
   * The Class Q&A archive — several published entries, not one.
   *
   * Each is ONE course-owned answer (ADR-0005): a course with three labs
   * publishes once and all three read the same row. They are drawn from
   * different labs on purpose, so the archive demonstrates the thing that
   * makes it course-wide — a Lab C student reading an answer that originated
   * in Lab A, with nothing on the page saying so.
   */
  const PUBLISH_FROM_RESPONSES: {
    email: string;
    publicQuestion: string;
    answer: string;
    category: "content" | "logistics" | "misc";
  }[] = [
    {
      email: "student@up.edu.ph",
      publicQuestion: "Could we see another worked example of tree rotations?",
      answer:
        "Yes. A full AVL walkthrough — single and double rotation, with the " +
        "balance factors written at each step — is going up with this week's " +
        "review set, and we will work through a second one at the start of " +
        "the next session.",
      category: "content",
    },
    {
      email: "maria.santos@up.edu.ph",
      publicQuestion: "When will the practice set be available?",
      answer:
        "The practice set is posted before the next class, and the solutions " +
        "follow two days later so you have time to attempt it first.",
      category: "logistics",
    },
    {
      email: "pedro.penduko@up.edu.ph",
      publicQuestion:
        "Is the AVL balance factor checked before or after the rotation?",
      answer:
        "Both, and that is the point of the invariant. You read the balance " +
        "factor to decide WHICH rotation to apply, then recompute it " +
        "afterwards to confirm the subtree is balanced again.",
      category: "content",
    },
    {
      email: "carlo.villanueva@up.edu.ph",
      publicQuestion:
        "May we use the standard library's priority queue in the machine problem?",
      answer:
        "Not for the heap itself — implementing it is the exercise. You may " +
        "use the standard library everywhere else in the program.",
      category: "logistics",
    },
    {
      email: "bea.ocampo@up.edu.ph",
      publicQuestion:
        "Why may a red-black tree have two red nodes on different branches but not on one path?",
      answer:
        "The rule constrains each root-to-leaf PATH, not the tree as a whole. " +
        "Two reds on one path would let that path carry more nodes than " +
        "another for the same black-height, which is exactly what the " +
        "invariant exists to prevent.",
      category: "content",
    },
  ];

  let publishedCount = 0;
  for (const spec of PUBLISH_FROM_RESPONSES) {
    const itemId = itemIdByEmail.get(spec.email);
    if (!itemId) continue;
    const existingLink = await db.query.sourceLinks.findFirst({
      where: eq(sourceLinks.itemId, itemId),
    });
    let answer = existingLink
      ? await db.query.publicAnswers.findFirst({
          where: eq(publicAnswers.id, existingLink.publicAnswerId),
        })
      : undefined;
    if (!answer) {
      answer = await draftPublicAnswer(teacher.id, {
        courseId: course!.id,
        itemIds: [itemId],
        publicQuestionText: spec.publicQuestion,
        answerBody: spec.answer,
        category: spec.category,
      });
      publishedCount += 1;
    }
    /**
     * Restores the seeded wording when the entry has been typed over by hand
     * in the dev app — including after it was published.
     *
     * The seed OWNS these six entries, and a placeholder someone typed while
     * clicking through the UI ("tite") otherwise sits in the demo archive
     * permanently: re-running the seed would find the source link, decide the
     * answer already existed, and leave it there. Published rows are repaired
     * with a direct update rather than through the editing service on purpose
     * — this is the seed restoring its own fixture in a development database,
     * not a teacher revising a real answer, so it deliberately writes no
     * revision history.
     */
    if (answer.answerBody !== spec.answer || answer.publicQuestionText !== spec.publicQuestion) {
      await db
        .update(publicAnswers)
        .set({
          publicQuestionText: spec.publicQuestion,
          answerBody: spec.answer,
          category: spec.category,
          updatedAt: new Date(),
        })
        .where(eq(publicAnswers.id, answer.id));
      answer = {
        ...answer,
        publicQuestionText: spec.publicQuestion,
        answerBody: spec.answer,
      };
    }
    if (answer.state === "draft" && answer.answerBody) {
      await publishNow(teacher.id, answer.id, { anonymityAcknowledged: true });
    }
  }

  /**
   * The question backlog, in several states at once.
   *
   * The editorial workspace is a triage board, so a backlog holding one item
   * in one state showed none of the work it exists to organise. These sit
   * across `imported`, `needs_review` and `answerable`, from both provenances
   * — a legacy paste-import and manual entry — and one of them is published
   * below, which is what puts a legacy-origin entry in the archive.
   */
  const {
    createManualBacklogQuestion,
    draftFromBacklog,
    importLegacyEntries,
    setBacklogState,
  } = await import("../src/modules/backlog");
  const { backlogQuestions } = await import("../src/db/schema");

  const LEGACY_QUESTIONS = [
    "Why do we normalise database tables before indexing them?",
    "What is the difference between a stable and an unstable sort?",
    "Does the heap property say anything about siblings?",
    "Why is quicksort's worst case quadratic if its average is linearithmic?",
  ];
  /**
   * Checked question by question, not "is the backlog empty".
   *
   * A database seeded by an earlier version of this script already has SOME
   * backlog rows, so an emptiness test skipped the import entirely and left
   * the enriched set unseeded — the same defect the roster had. Asking after
   * each question individually means a partly-seeded course fills in the gaps.
   */
  const existingLegacy = await db.query.backlogQuestions.findMany({
    where: eq(backlogQuestions.courseId, course!.id),
  });
  const haveText = new Set(existingLegacy.map((q) => q.text));
  const missingLegacy = LEGACY_QUESTIONS.filter((t) => !haveText.has(t));
  if (missingLegacy.length > 0) {
    await importLegacyEntries(
      teacher.id,
      course!.id,
      missingLegacy.map((text) => ({ text })),
      "AY2025-2 Q&A document",
    );
  }
  for (const text of [
    "Will there be a review session before the finals?",
    "Can we get the slides in PDF as well as the web version?",
  ]) {
    if (haveText.has(text)) continue;
    await createManualBacklogQuestion(teacher.id, course!.id, {
      text,
      category: "logistics",
    });
  }

  /**
   * One legacy question carried all the way through to the archive, so the
   * Class Q&A contains an entry marked as coming from an earlier semester —
   * anonymous, with a backlog source link and no student identity anywhere.
   */
  const backlogNow = await db.query.backlogQuestions.findMany({
    where: eq(backlogQuestions.courseId, course!.id),
  });
  const toPublish = backlogNow.find(
    (q) => q.text === LEGACY_QUESTIONS[0] && q.state !== "published",
  );
  if (toPublish) {
    if (toPublish.state === "imported") {
      await setBacklogState(teacher.id, toPublish.id, "needs_review");
    }
    const answer = await draftFromBacklog(teacher.id, toPublish.id, {
      answerBody:
        "Normalisation removes the redundancy that would otherwise let two " +
        "rows disagree with each other. Indexing is a performance decision " +
        "made afterwards, on a schema whose correctness you already trust — " +
        "indexing a denormalised table just makes the wrong answer arrive " +
        "faster.",
    });
    if (answer.state === "draft" && answer.answerBody) {
      await publishNow(teacher.id, answer.id, { anonymityAcknowledged: true });
      publishedCount += 1;
    }
    /* The remaining legacy rows are left mid-triage on purpose: a board where
       everything is already published has nothing to triage. */
    const stillImported = backlogNow.filter(
      (q) => q.id !== toPublish.id && q.state === "imported",
    );
    for (const q of stillImported.slice(0, 2)) {
      await setBacklogState(teacher.id, q.id, "needs_review");
    }
    if (stillImported[0]) {
      await setBacklogState(teacher.id, stillImported[0].id, "answerable");
    }
  }

  const publishedTotal = await db.query.publicAnswers.findMany({
    where: and(
      eq(publicAnswers.courseId, course!.id),
      eq(publicAnswers.state, "published"),
    ),
  });

  console.log("Seed complete:", {
    admin: admin ? `${admin.displayName} (${admin.username})` : "not bootstrapped (set DEV_PLATFORM_ADMIN_PASSWORD)",
    teacher: teacher.email,
    ta: ta.email,
    student: "student@up.edu.ph (Juan Dela Cruz, 2026-00001 — Lab A, no claim step)",
    course: course!.code,
    sections: labs.map((lab) => lab.title).join(", "),
    /* The assistant is delegated to Lab A only — the fixture for "course-wide
       outputs did not make source data course-wide". */
    assistantScope: `${ta.email} reviews ${labA.title} only`,
    students: rosterEntries.length,
    openForms: openInstances.length,
    responses: openInstances.length
      ? `${seededResponseCount} new response${seededResponseCount === 1 ? "" : "s"} seeded`
      : "No open form instance",
    classQa: `${publishedTotal.length} published entr${publishedTotal.length === 1 ? "y" : "ies"} (${publishedCount} new this run)`,
    scheduler: result,
  });
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
