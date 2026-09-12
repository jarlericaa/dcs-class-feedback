"use client";

import { useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/cn";

/**
 * A feed answer that stays readable without making a single post dominate the
 * archive. The plain projection is intentional: the full, sanitized rich
 * answer remains available on the detail route, while this scan surface keeps
 * clamping and expansion reliable at every viewport.
 */
export function QaAnswerPreview({ answer }: { answer: string }) {
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const bodyRef = useRef<HTMLParagraphElement>(null);
  const bodyId = useId();

  useEffect(() => {
    if (expanded) return;
    const body = bodyRef.current;
    if (!body) return;

    const measure = () => {
      setCanExpand(body.scrollHeight > body.clientHeight + 1);
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(body);
    return () => observer.disconnect();
  }, [answer, expanded]);

  // Start clamped so the first measurement can detect overflow. Short answers
  // remain visually unchanged because their content fits inside the clamp.
  const collapsed = !expanded;

  return (
    <div className="qa-answer-preview">
      <h4 className="qa-answer-preview__label">Answer</h4>
      <p
        className={cn(
          "qa-answer-preview__body",
          collapsed && "qa-answer-preview__body--collapsed",
        )}
        id={bodyId}
        ref={bodyRef}
      >
        {answer || "No answer text was recorded."}
      </p>
      {canExpand && (
        <button
          aria-controls={bodyId}
          aria-expanded={expanded}
          className="qa-answer-preview__toggle"
          onClick={() => setExpanded((wasExpanded) => !wasExpanded)}
          type="button"
        >
          {expanded ? "Show less" : "See more"}
        </button>
      )}
    </div>
  );
}
