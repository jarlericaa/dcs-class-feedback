import { describe, expect, it } from "vitest";
import { validateAnswers, type CycleQuestion } from "@/modules/forms/questions";

function q(partial: Partial<CycleQuestion>): CycleQuestion {
  return {
    id: partial.id ?? crypto.randomUUID(),
    cycleId: "00000000-0000-0000-0000-000000000001",
    templateVersionId: null,
    prompt: "Q",
    description: null,
    type: "short_answer",
    options: null,
    scale: null,
    validation: null,
    required: false,
    displayOrder: 0,
    category: null,
    topicId: null,
    stableKey: crypto.randomUUID(),
    createdAt: new Date(),
    ...partial,
  } as CycleQuestion;
}

describe("validateAnswers", () => {
  it("rejects a missing required answer", () => {
    const question = q({ required: true });
    const result = validateAnswers([question], []);
    expect(result.ok).toBe(false);
    expect(result.errors[0]!.message).toMatch(/required/);
  });

  it("allows omitting optional questions", () => {
    const result = validateAnswers([q({ required: false })], []);
    expect(result.ok).toBe(true);
    expect(result.normalized).toHaveLength(0);
  });

  it("whitespace-only text does not satisfy a required question", () => {
    const question = q({ required: true });
    const result = validateAnswers(
      [question],
      [{ questionId: question.id, text: "   " }],
    );
    expect(result.ok).toBe(false);
  });

  it("rejects unknown option ids and stores both ids and labels for valid picks", () => {
    const question = q({
      type: "multiple_choice",
      required: true,
      options: [
        { stableId: "opt-a", label: "Alpha", order: 0 },
        { stableId: "opt-b", label: "Beta", order: 1 },
      ],
    });
    const bad = validateAnswers(
      [question],
      [{ questionId: question.id, optionIds: ["nope"] }],
    );
    expect(bad.ok).toBe(false);

    const good = validateAnswers(
      [question],
      [{ questionId: question.id, optionIds: ["opt-b"] }],
    );
    expect(good.ok).toBe(true);
    expect(good.normalized[0]!.value).toEqual({
      optionIds: ["opt-b"],
      optionLabels: ["Beta"],
    });
  });

  it("enforces single selection for multiple_choice and selection bounds for checkboxes", () => {
    const mc = q({
      type: "multiple_choice",
      options: [
        { stableId: "a", label: "A", order: 0 },
        { stableId: "b", label: "B", order: 1 },
      ],
    });
    expect(
      validateAnswers([mc], [{ questionId: mc.id, optionIds: ["a", "b"] }]).ok,
    ).toBe(false);

    const cb = q({
      type: "checkboxes",
      options: [
        { stableId: "a", label: "A", order: 0 },
        { stableId: "b", label: "B", order: 1 },
        { stableId: "c", label: "C", order: 2 },
      ],
      validation: { maxSelections: 2 },
    });
    expect(
      validateAnswers(
        [cb],
        [{ questionId: cb.id, optionIds: ["a", "b", "c"] }],
      ).ok,
    ).toBe(false);
    expect(
      validateAnswers([cb], [{ questionId: cb.id, optionIds: ["a", "c"] }]).ok,
    ).toBe(true);
  });

  it("enforces linear scale range and step", () => {
    const scale = q({
      type: "linear_scale",
      scale: { min: 1, max: 5, step: 1 },
    });
    expect(
      validateAnswers([scale], [{ questionId: scale.id, scaleValue: 6 }]).ok,
    ).toBe(false);
    expect(
      validateAnswers([scale], [{ questionId: scale.id, scaleValue: 3 }]).ok,
    ).toBe(true);
  });

  it("rejects answers to questions not on the form", () => {
    const question = q({});
    const result = validateAnswers(
      [question],
      [
        { questionId: question.id, text: "hi" },
        {
          questionId: "00000000-0000-0000-0000-00000000dead",
          text: "injected",
        },
      ],
    );
    expect(result.ok).toBe(false);
    expect(result.errors[0]!.message).toMatch(/not on this form/);
  });

  it("enforces text length rules", () => {
    const question = q({ validation: { minLen: 5, maxLen: 10 } });
    expect(
      validateAnswers([question], [{ questionId: question.id, text: "hi" }]).ok,
    ).toBe(false);
    expect(
      validateAnswers(
        [question],
        [{ questionId: question.id, text: "hello there, way too long" }],
      ).ok,
    ).toBe(false);
    expect(
      validateAnswers([question], [{ questionId: question.id, text: "hello" }])
        .ok,
    ).toBe(true);
  });
});
