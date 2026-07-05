/**
 * Deterministic name-normalization + comparison pipeline
 * (account-matching.md §5). Pure functions — no I/O — so the highest-risk
 * logic in the system is unit-testable in isolation.
 *
 * Thresholds are tuned conservatively toward "ask a teacher": the pipeline
 * only ever proposes candidates; it NEVER confirms anything (Risk R1).
 */

/** trim, collapse whitespace, casefold, strip diacritics, drop punctuation */
export function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // fold diacritics
    .toLowerCase()
    .replace(/[.,'’"()\-_/]/g, " ") // punctuation/separators → space
    .replace(/\s+/g, " ")
    .trim();
}

export function nameTokens(name: string): string[] {
  const normalized = normalizeName(name);
  return normalized.length === 0 ? [] : normalized.split(" ");
}

/** Sorted-token string for order-independent storage/comparison. */
export function tokenSetKey(name: string): string {
  return [...nameTokens(name)].sort().join(" ");
}

/** Levenshtein distance (iterative, small strings only). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = [i, ...new Array<number>(n).fill(0)];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
    }
    prev = curr;
  }
  return prev[n]!;
}

/**
 * Do two tokens "match" for name purposes?
 * - exact
 * - initial: single letter matching the other token's first letter
 *   (handles "J." / "J" vs "Juan")
 * - small typo: Levenshtein ≤ 1 for tokens of length ≥ 4
 */
function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length === 1 || b.length === 1) {
    const [initial, full] = a.length === 1 ? [a, b] : [b, a];
    return full.startsWith(initial);
  }
  if (a.length >= 4 && b.length >= 4) return levenshtein(a, b) <= 1;
  return false;
}

/**
 * Score similarity of two names in [0, 1]. Order-independent (handles
 * surname-first vs given-first by token matching, not position), tolerant of
 * middle names/initials on either side, and of small typos.
 *
 * 1.0  — identical normalized strings or identical token sets
 * ~0.9 — every token of the shorter name matches a distinct token of the
 *        longer one (missing middle name / initial-only middle)
 * <0.8 — partial overlap, scaled by coverage
 */
export function scoreNames(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na.length === 0 || nb.length === 0) return 0;
  if (na === nb) return 1;

  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (tokenSetKey(a) === tokenSetKey(b)) return 1;

  // Greedy one-to-one token matching from the shorter side.
  const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const used = new Array<boolean>(longer.length).fill(false);
  let matched = 0;
  let initialOrFuzzy = 0;
  for (const tok of shorter) {
    let found = -1;
    // prefer exact matches first
    for (let i = 0; i < longer.length; i++) {
      if (!used[i] && longer[i] === tok) {
        found = i;
        break;
      }
    }
    if (found === -1) {
      for (let i = 0; i < longer.length; i++) {
        if (!used[i] && tokensMatch(tok, longer[i]!)) {
          found = i;
          initialOrFuzzy += 1;
          break;
        }
      }
    }
    if (found !== -1) {
      used[found] = true;
      matched += 1;
    }
  }

  if (matched === 0) return 0;

  const shortCoverage = matched / shorter.length;
  const longCoverage = matched / longer.length;

  if (shortCoverage === 1) {
    // All of the shorter name accounted for. Full-coverage exact-token case
    // was handled above, so this is the middle-name/initial/typo family.
    // Require at least 2 matched tokens (given + surname) for a strong score.
    if (matched >= 2) {
      const penalty = 0.05 * initialOrFuzzy + 0.03 * (longer.length - matched);
      return Math.max(0.8, 0.95 - penalty);
    }
    return 0.5; // single-token names are never strong evidence
  }

  // Partial overlap only — weak signal.
  return Math.min(0.7, 0.35 + 0.35 * (shortCoverage + longCoverage) / 2);
}

/** Conservative thresholds (account-matching.md §5: prefer "ask a teacher"). */
export const STRONG_MATCH_THRESHOLD = 0.85;
export const CANDIDATE_THRESHOLD = 0.75;

export type MatchOutcome =
  | { kind: "candidate"; recordId: string; score: number }
  | { kind: "ambiguous"; candidates: { recordId: string; score: number }[] }
  | { kind: "unmatched" };

/**
 * Classify pipeline output. Exactly one strong candidate with no other
 * plausible candidate → `candidate` (still requires teacher confirmation —
 * teacher-confirm-all, D2). Anything with 2+ plausible names → `ambiguous`.
 */
export function classifyCandidates(
  scored: { recordId: string; score: number }[],
): MatchOutcome {
  const plausible = scored
    .filter((s) => s.score >= CANDIDATE_THRESHOLD)
    .sort((x, y) => y.score - x.score);
  if (plausible.length === 0) return { kind: "unmatched" };
  if (plausible.length === 1 && plausible[0]!.score >= STRONG_MATCH_THRESHOLD) {
    return { kind: "candidate", ...plausible[0]! };
  }
  return { kind: "ambiguous", candidates: plausible };
}
