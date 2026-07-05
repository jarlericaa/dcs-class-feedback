import { describe, expect, it } from "vitest";
import {
  classifyCandidates,
  levenshtein,
  normalizeName,
  scoreNames,
  tokenSetKey,
  CANDIDATE_THRESHOLD,
  STRONG_MATCH_THRESHOLD,
} from "@/modules/identity/normalize";

describe("normalizeName", () => {
  it("trims, collapses whitespace, casefolds", () => {
    expect(normalizeName("  Juan   DELA cruz ")).toBe("juan dela cruz");
  });
  it("strips diacritics", () => {
    expect(normalizeName("José Peña")).toBe("jose pena");
  });
  it("drops punctuation and separators", () => {
    expect(normalizeName("O'Neil, Mary-Jane Jr.")).toBe("o neil mary jane jr");
  });
});

describe("tokenSetKey", () => {
  it("is order-independent (surname-first vs given-first)", () => {
    expect(tokenSetKey("Dela Cruz Juan")).toBe(tokenSetKey("Juan Dela Cruz"));
  });
});

describe("levenshtein", () => {
  it("computes edit distance", () => {
    expect(levenshtein("maria", "marla")).toBe(1);
    expect(levenshtein("ana", "ana")).toBe(0);
    expect(levenshtein("kit", "kate")).toBe(2);
  });
});

describe("scoreNames", () => {
  it("scores identical names 1.0", () => {
    expect(scoreNames("Juan Dela Cruz", "Juan Dela Cruz")).toBe(1);
  });
  it("scores name-order variants 1.0", () => {
    expect(scoreNames("Dela Cruz, Juan", "Juan Dela Cruz")).toBe(1);
  });
  it("scores diacritic/case variants 1.0", () => {
    expect(scoreNames("josé peña", "Jose Pena")).toBe(1);
  });
  it("strong: missing middle name", () => {
    const s = scoreNames("Juan Santos", "Juan Miguel Santos");
    expect(s).toBeGreaterThanOrEqual(STRONG_MATCH_THRESHOLD);
  });
  it("strong: middle initial vs full middle name", () => {
    const s = scoreNames("Juan M. Santos", "Juan Miguel Santos");
    expect(s).toBeGreaterThanOrEqual(CANDIDATE_THRESHOLD);
  });
  it("tolerates a single typo in a long token", () => {
    const s = scoreNames("Juan Santos", "Juan Santoz");
    expect(s).toBeGreaterThanOrEqual(CANDIDATE_THRESHOLD);
  });
  it("does not treat a single shared token as strong evidence", () => {
    expect(scoreNames("Juan", "Juan Dela Cruz")).toBeLessThan(
      CANDIDATE_THRESHOLD,
    );
    expect(scoreNames("Maria Santos", "Maria Reyes")).toBeLessThan(
      CANDIDATE_THRESHOLD,
    );
  });
  it("scores unrelated names low", () => {
    expect(scoreNames("Juan Dela Cruz", "Kim Lee")).toBeLessThan(0.5);
  });
});

describe("classifyCandidates", () => {
  it("no plausible candidates → unmatched", () => {
    expect(classifyCandidates([{ recordId: "a", score: 0.3 }])).toEqual({
      kind: "unmatched",
    });
  });
  it("exactly one strong candidate → candidate (still needs teacher confirm)", () => {
    const out = classifyCandidates([
      { recordId: "a", score: 0.95 },
      { recordId: "b", score: 0.2 },
    ]);
    expect(out.kind).toBe("candidate");
  });
  it("two identical names → ambiguous, never auto-picked", () => {
    const out = classifyCandidates([
      { recordId: "a", score: 1 },
      { recordId: "b", score: 1 },
    ]);
    expect(out.kind).toBe("ambiguous");
    if (out.kind === "ambiguous") expect(out.candidates).toHaveLength(2);
  });
  it("one strong plus one plausible → ambiguous (conservative)", () => {
    const out = classifyCandidates([
      { recordId: "a", score: 0.95 },
      { recordId: "b", score: 0.8 },
    ]);
    expect(out.kind).toBe("ambiguous");
  });
});
