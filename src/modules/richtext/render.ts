import "server-only";
import { createHash } from "node:crypto";
import rehypeKatex from "rehype-katex";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { demoteHeadings, hardenImages, hardenLinks } from "./harden";
import { KATEX_OPTIONS, SAFE_SCHEMA } from "./schema";

/**
 * The ONE safe renderer for rich staff-authored content
 * (project-specs.md §5.2, §11).
 *
 * Server-only by construction (`server-only`), so a client component cannot
 * import it and no sanitizer or jsdom ever ships to the browser.
 *
 * Pipeline order matters:
 *
 *   parse → gfm → math → rehype (raw HTML DROPPED) → SANITIZE → katex → harden
 *
 * `remarkRehype` is called without `allowDangerousHtml`, so any literal HTML in
 * the source is discarded at conversion — there is no "arbitrary HTML" path to
 * sanitize in the first place.
 *
 * Sanitizing runs BEFORE KaTeX, not after. After expansion the math is thousands
 * of `<span class style>` nodes plus MathML, and allowlisting that surface is
 * both fragile and the usual cause of "math renders as garbage". Sanitizing the
 * markdown output — where math is just `<span class="math">TEXT</span>` — and
 * then letting a `trust: false` KaTeX expand it is a far smaller trusted surface.
 *
 * Student-authored text is deliberately NOT rendered through this. It stays plain
 * and JSX-escaped, so a student cannot inject markup into a staff view.
 */

export const RENDERER_VERSION = 1;
export const MAX_SOURCE_CHARS = 20_000;

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(demoteHeadings)
  .use(remarkRehype)
  .use(rehypeSanitize, SAFE_SCHEMA)
  .use(rehypeKatex, KATEX_OPTIONS)
  .use(hardenLinks)
  .use(hardenImages)
  .use(rehypeStringify);

/** Bounded memo: prompts repeat across every student's form render. */
const CACHE_LIMIT = 500;
const cache = new Map<string, string>();

function cacheKey(source: string): string {
  return createHash("sha256")
    .update(`${RENDERER_VERSION}\0${source}`)
    .digest("base64url");
}

/**
 * Render markdown to sanitized HTML.
 *
 * Never throws on user input: a prompt that fails to render must not take down
 * the whole form. Over-long input is truncated with a visible marker rather than
 * rejected, because silently dropping a teacher's prompt is worse than showing
 * a shortened one.
 */
export async function renderRichText(
  source: string | null | undefined,
): Promise<string> {
  if (!source) return "";
  const trimmed =
    source.length > MAX_SOURCE_CHARS
      ? `${source.slice(0, MAX_SOURCE_CHARS)}\n\n…(truncated)`
      : source;
  const key = cacheKey(trimmed);
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let html: string;
  try {
    html = String(await processor.process(trimmed));
  } catch {
    // Fall back to escaped plain text: the content still reaches the reader.
    html = `<p>${escapeHtml(trimmed)}</p>`;
  }
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, html);
  return html;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Plain-text projection, for exports, emails, `aria-label`s and previews.
 *
 * Strips markdown syntax rather than rendering and un-rendering, so it is safe to
 * use in contexts that must never contain markup at all.
 */
export function richTextToPlain(source: string | null | undefined): string {
  if (!source) return "";
  return source
    .replace(/```[\s\S]*?```/g, " [code] ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\$\$[\s\S]*?\$\$/g, " [math] ")
    .replace(/\$[^$\n]*\$/g, " [math] ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    // Markdown may embed literal HTML. The plain projection is used in contexts
    // that must contain no markup at all (email bodies, CSV cells, aria labels),
    // so tags are removed rather than escaped.
    .replace(/<[^>]*>/g, " ")
    .replace(/[*_~>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
