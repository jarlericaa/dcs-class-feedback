import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProseAnswers, type QuestionEntry } from "@/app/teach/courses/[id]/responses/parts";

function entry(index: number): QuestionEntry {
  return {
    responseId: `response-${index}`,
    who: null,
    sectionTitle: null,
    when: null,
    answer: {
      questionId: "question-1",
      prompt: "Anything else?",
      description: null,
      type: "long_text",
      required: false,
      displayOrder: index,
      options: null,
      scale: null,
      answered: true,
      value: null,
      freeText: `Answer ${index}`,
    },
  };
}

describe("prose answer disclosure", () => {
  it("places Show less after the expanded answers", () => {
    const markup = renderToStaticMarkup(
      <ProseAnswers entries={Array.from({ length: 5 }, (_, i) => entry(i + 1))} />,
    );

    expect(markup).toContain("View all 5 responses");
    expect(markup).toContain("Show less");
    expect(markup).not.toContain("<svg");
    // Summary remains first for native <details> semantics, while CSS order
    // puts the expanded list before it in the visible layout.
    expect(markup).toContain('class="group flex flex-col"');
    expect(markup).toContain("order-2");
    expect(markup).toContain("order-1");
  });
});
