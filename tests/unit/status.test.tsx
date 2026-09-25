import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CreditBadge,
  CycleStateBadge,
  PriorityBadge,
  Stamp,
  ValidityBadge,
} from "@/components/ui/status";

describe("status stamps", () => {
  it("renders written labels without decorative symbols", () => {
    const markup = renderToStaticMarkup(
      <>
        <Stamp tone="green">Published</Stamp>
        <Stamp tone="amber">Needs reply</Stamp>
        <CycleStateBadge state="scheduled" />
        <ValidityBadge validity="invalid" />
        <CreditBadge counted={false} />
        <PriorityBadge priority="urgent" />
      </>,
    );

    expect(markup).toContain("Published");
    expect(markup).toContain("Needs reply");
    expect(markup).toContain("Scheduled");
    expect(markup).not.toContain("<svg");
    expect(markup).not.toContain("stamp__mark");
  });
});
