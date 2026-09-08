import { z } from "zod";
import type { formQuestions } from "@/db/schema";

/**
 * Question definitions and authoritative server-side answer validation
 * (docs/domain/form-workflow.md §5). Options carry stable ids separate from labels;
 * answers store BOTH ids and labels at submission time so exports stay stable
 * when labels change.
 */

export const optionSchema = z.object({
  stableId: z.string().min(1),
  label: z.string().min(1),
  order: z.number().int(),
});
export type QuestionOption = z.infer<typeof optionSchema>;

export const scaleSchema = z.object({
  min: z.number().int(),
  max: z.number().int(),
  minLabel: z.string().optional(),
  maxLabel: z.string().optional(),
  step: z.number().int().positive().default(1),
});

export const validationRulesSchema = z.object({
  minLen: z.number().int().nonnegative().optional(),
  maxLen: z.number().int().positive().optional(),
  minSelections: z.number().int().nonnegative().optional(),
  maxSelections: z.number().int().positive().optional(),
  pattern: z.string().optional(),
});

const CHOICE_TYPES = ["multiple_choice", "checkboxes", "dropdown"] as const;

/** Input shape for defining a question on a template. */
export const questionDefinitionSchema = z
  .object({
    prompt: z.string().min(1),
    description: z.string().optional(),
    type: z.enum([
      "short_answer",
      "paragraph",
      "multiple_choice",
      "checkboxes",
      "dropdown",
      "linear_scale",
      "yes_no",
      "date",
      "time",
    ]),
    required: z.boolean().default(false),
    displayOrder: z.number().int().default(0),
    category: z.enum(["content", "logistics", "misc"]).optional(),
    topicId: z.string().uuid().optional(),
    options: z.array(optionSchema).optional(),
    scale: scaleSchema.optional(),
    validation: validationRulesSchema.optional(),
  })
  .superRefine((q, ctx) => {
    const isChoice = (CHOICE_TYPES as readonly string[]).includes(q.type);
    if (isChoice && (!q.options || q.options.length < 2)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${q.type} requires at least 2 options`,
      });
    }
    if (q.type === "linear_scale" && !q.scale) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "linear_scale requires scale settings",
      });
    }
  });
export type QuestionDefinition = z.infer<typeof questionDefinitionSchema>;

/** One raw answer submitted by a student. */
export const answerInputSchema = z.object({
  questionId: z.string().uuid(),
  text: z.string().optional(),
  optionIds: z.array(z.string()).optional(),
  scaleValue: z.number().int().optional(),
  boolValue: z.boolean().optional(),
  dateValue: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  timeValue: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/)
    .optional(),
});
export type AnswerInput = z.infer<typeof answerInputSchema>;

export type CycleQuestion = typeof formQuestions.$inferSelect;

export interface NormalizedAnswer {
  questionId: string;
  /** stored jsonb: ids AND labels captured at submission time */
  value: Record<string, unknown> | null;
  freeText: string | null;
}

export interface AnswerValidationResult {
  ok: boolean;
  errors: { questionId: string | null; message: string }[];
  normalized: NormalizedAnswer[];
}

function hasContent(q: CycleQuestion, a: AnswerInput | undefined): boolean {
  if (!a) return false;
  switch (q.type) {
    case "short_answer":
    case "paragraph":
      return !!a.text && a.text.trim().length > 0;
    case "multiple_choice":
    case "dropdown":
    case "checkboxes":
      return !!a.optionIds && a.optionIds.length > 0;
    case "linear_scale":
      return a.scaleValue !== undefined;
    case "yes_no":
      return a.boolValue !== undefined;
    case "date":
      return !!a.dateValue;
    case "time":
      return !!a.timeValue;
  }
}

/**
 * Authoritative validation of a full submission against the cycle's question
 * snapshot. Returns per-question errors; never throws on user input.
 */
export function validateAnswers(
  questions: CycleQuestion[],
  answers: AnswerInput[],
): AnswerValidationResult {
  const errors: AnswerValidationResult["errors"] = [];
  const normalized: NormalizedAnswer[] = [];
  const byQuestion = new Map<string, AnswerInput>();

  const questionIds = new Set(questions.map((q) => q.id));
  for (const a of answers) {
    if (!questionIds.has(a.questionId)) {
      errors.push({
        questionId: a.questionId,
        message: "Answer refers to a question not on this form",
      });
      continue;
    }
    if (byQuestion.has(a.questionId)) {
      errors.push({ questionId: a.questionId, message: "Duplicate answer" });
      continue;
    }
    byQuestion.set(a.questionId, a);
  }

  for (const q of questions) {
    const a = byQuestion.get(q.id);
    const answered = hasContent(q, a);
    if (!answered) {
      if (q.required) {
        errors.push({ questionId: q.id, message: "This question is required" });
      }
      continue;
    }

    const rules = (q.validation ?? {}) as z.infer<typeof validationRulesSchema>;
    switch (q.type) {
      case "short_answer":
      case "paragraph": {
        const text = a!.text!.trim();
        if (rules.minLen !== undefined && text.length < rules.minLen) {
          errors.push({
            questionId: q.id,
            message: `Answer must be at least ${rules.minLen} characters`,
          });
        } else if (rules.maxLen !== undefined && text.length > rules.maxLen) {
          errors.push({
            questionId: q.id,
            message: `Answer must be at most ${rules.maxLen} characters`,
          });
        } else if (rules.pattern && !new RegExp(rules.pattern).test(text)) {
          errors.push({ questionId: q.id, message: "Answer format is invalid" });
        } else {
          normalized.push({ questionId: q.id, value: null, freeText: text });
        }
        break;
      }
      case "multiple_choice":
      case "dropdown":
      case "checkboxes": {
        const options = (q.options ?? []) as QuestionOption[];
        const valid = new Map(options.map((o) => [o.stableId, o.label]));
        const chosen = a!.optionIds!;
        const single = q.type !== "checkboxes";
        if (single && chosen.length !== 1) {
          errors.push({
            questionId: q.id,
            message: "Exactly one option must be selected",
          });
          break;
        }
        if (chosen.some((id) => !valid.has(id))) {
          errors.push({ questionId: q.id, message: "Unknown option selected" });
          break;
        }
        if (new Set(chosen).size !== chosen.length) {
          errors.push({ questionId: q.id, message: "Duplicate option selected" });
          break;
        }
        if (
          !single &&
          ((rules.minSelections !== undefined &&
            chosen.length < rules.minSelections) ||
            (rules.maxSelections !== undefined &&
              chosen.length > rules.maxSelections))
        ) {
          errors.push({
            questionId: q.id,
            message: "Selection count out of allowed range",
          });
          break;
        }
        normalized.push({
          questionId: q.id,
          value: {
            optionIds: chosen,
            optionLabels: chosen.map((id) => valid.get(id)!),
          },
          freeText: null,
        });
        break;
      }
      case "linear_scale": {
        const scale = q.scale as z.infer<typeof scaleSchema>;
        const v = a!.scaleValue!;
        const step = scale.step ?? 1;
        if (v < scale.min || v > scale.max || (v - scale.min) % step !== 0) {
          errors.push({
            questionId: q.id,
            message: `Value must be between ${scale.min} and ${scale.max}`,
          });
        } else {
          normalized.push({
            questionId: q.id,
            value: { scaleValue: v },
            freeText: null,
          });
        }
        break;
      }
      case "yes_no":
        normalized.push({
          questionId: q.id,
          value: { boolValue: a!.boolValue! },
          freeText: null,
        });
        break;
      case "date":
        normalized.push({
          questionId: q.id,
          value: { dateValue: a!.dateValue! },
          freeText: null,
        });
        break;
      case "time":
        normalized.push({
          questionId: q.id,
          value: { timeValue: a!.timeValue! },
          freeText: null,
        });
        break;
    }
  }

  return { ok: errors.length === 0, errors, normalized };
}
