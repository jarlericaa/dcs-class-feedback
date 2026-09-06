import { describe, expect, it } from "vitest";
import { EMAIL_LIST_LIMIT, parseEmailList } from "@/lib/email-list";

/**
 * What a teacher pastes into the add-staff box becomes a set of addresses here.
 * The suite runs with ALLOWED_EMAIL_DOMAINS=up.edu.ph (tests/setup-domains),
 * but this parser deliberately does not care: validity and domain are decided
 * per address afterwards, so a refusal can name the address it is about.
 */

describe("parseEmailList: separators", () => {
  it("splits on commas, semicolons, spaces and newlines alike", () => {
    const { emails } = parseEmailList(
      "a@up.edu.ph, b@up.edu.ph; c@up.edu.ph d@up.edu.ph\ne@up.edu.ph\r\nf@up.edu.ph\tg@up.edu.ph",
    );
    expect(emails).toEqual([
      "a@up.edu.ph",
      "b@up.edu.ph",
      "c@up.edu.ph",
      "d@up.edu.ph",
      "e@up.edu.ph",
      "f@up.edu.ph",
      "g@up.edu.ph",
    ]);
  });

  it("collapses runs of separators and ignores leading and trailing ones", () => {
    expect(parseEmailList(" ,;\n a@up.edu.ph ;;,  b@up.edu.ph \n\n").emails).toEqual([
      "a@up.edu.ph",
      "b@up.edu.ph",
    ]);
  });

  it("accepts an array of blobs as well as one string", () => {
    expect(
      parseEmailList(["a@up.edu.ph, b@up.edu.ph", "c@up.edu.ph"]).emails,
    ).toEqual(["a@up.edu.ph", "b@up.edu.ph", "c@up.edu.ph"]);
  });

  it("treats an absent, empty or whitespace-only value as no addresses", () => {
    for (const value of [null, undefined, "", "   \n , ; "]) {
      expect(parseEmailList(value)).toEqual({ emails: [], overflow: [] });
    }
    expect(parseEmailList([])).toEqual({ emails: [], overflow: [] });
  });

  /**
   * Not this parser's job. A token that is not an address survives to be
   * refused BY NAME downstream, rather than being dropped here — a silently
   * dropped token is an address the teacher believes they granted.
   */
  it("keeps a non-address token instead of dropping it", () => {
    expect(parseEmailList("Juan, juan@up.edu.ph").emails).toEqual([
      "juan",
      "juan@up.edu.ph",
    ]);
  });
});

describe("parseEmailList: normalization and deduplication", () => {
  it("normalizes with the identity rule: trim and lowercase", () => {
    expect(parseEmailList("  Juan.DelaCruz@UP.EDU.PH  ").emails).toEqual([
      "juan.delacruz@up.edu.ph",
    ]);
  });

  it("deduplicates after normalizing, keeping the first occurrence's place", () => {
    const { emails } = parseEmailList(
      "b@up.edu.ph, A@up.edu.ph, a@UP.edu.ph, b@up.edu.ph, c@up.edu.ph",
    );
    expect(emails).toEqual(["b@up.edu.ph", "a@up.edu.ph", "c@up.edu.ph"]);
  });

  it("does NOT collapse two distinct mailboxes", () => {
    expect(parseEmailList("a.b@up.edu.ph, ab@up.edu.ph").emails).toHaveLength(2);
    expect(parseEmailList("a+x@up.edu.ph, a@up.edu.ph").emails).toHaveLength(2);
  });
});

describe("parseEmailList: the cap", () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => `p${i}@up.edu.ph`);

  it("defaults to 50 and reports the tail as overflow rather than dropping it", () => {
    expect(EMAIL_LIST_LIMIT).toBe(50);
    const input = many(53);
    const { emails, overflow } = parseEmailList(input.join("\n"));
    expect(emails).toHaveLength(50);
    expect(overflow).toEqual(["p50@up.edu.ph", "p51@up.edu.ph", "p52@up.edu.ph"]);
    // Nothing is lost: the two halves reassemble the input in order.
    expect([...emails, ...overflow]).toEqual(input);
  });

  it("counts distinct addresses, so a repeated one does not consume the cap", () => {
    const input = [...many(50), "p0@up.edu.ph", "P1@UP.EDU.PH"];
    const { emails, overflow } = parseEmailList(input.join(", "));
    expect(emails).toHaveLength(50);
    expect(overflow).toEqual([]);
  });

  it("honours an explicit limit, and treats a nonsense limit as none allowed", () => {
    const { emails, overflow } = parseEmailList(many(4).join(","), 2);
    expect(emails).toEqual(["p0@up.edu.ph", "p1@up.edu.ph"]);
    expect(overflow).toEqual(["p2@up.edu.ph", "p3@up.edu.ph"]);

    const zero = parseEmailList(many(2).join(","), 0);
    expect(zero.emails).toEqual([]);
    expect(zero.overflow).toHaveLength(2);
    const negative = parseEmailList(many(2).join(","), -5);
    expect(negative.emails).toEqual([]);
    expect(negative.overflow).toHaveLength(2);
  });
});
