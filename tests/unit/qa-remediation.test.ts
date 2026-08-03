import { describe, expect, it } from "vitest";
import { questionErrorAttributes } from "@/components/student/weekly-form";
import { publishNeedsAcknowledgement } from "@/components/staff/public-answer-composer";
import { GET as getFavicon } from "@/app/favicon.ico/route";

describe("QA remediation regressions", () => {
  it("marks an invalid grouped question and retains its error association", () => {
    expect(
      questionErrorAttributes("This question is required", "error-question"),
    ).toEqual({
      "aria-invalid": "true",
      "aria-describedby": "error-question",
    });
  });

  it("only requires the anonymity acknowledgment for publication", () => {
    expect(publishNeedsAcknowledgement("publish", false)).toBe(true);
    expect(publishNeedsAcknowledgement("publish", true)).toBe(false);
    expect(publishNeedsAcknowledgement("draft", false)).toBe(false);
  });

  it("serves a cacheable SVG favicon", async () => {
    const response = getFavicon();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/svg+xml");
    expect(await response.text()).toContain("<svg");
  });
});
