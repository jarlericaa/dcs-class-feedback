/**
 * Plain-text projection of rich source, for anywhere markup must not appear.
 *
 * Its own module, and deliberately IMPORTLESS. It used to live beside the
 * markdown pipeline in `render.ts`, which is marked `server-only` — so anything
 * that wanted a plain string also pulled in the sanitizer and could not be
 * imported from a plain `tsx` script at all (the seed and the scheduler both
 * broke on it). Nothing here parses or renders: it strips syntax, which is
 * exactly why it is safe in an export cell, an email body, an `aria-label`, or
 * an audit sentence.
 *
 * `render.ts` re-exports it, so every existing import keeps working.
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
