/**
 * Client-safe renderer for ALREADY-SANITIZED html.
 *
 * Split out from `rich-text.tsx` on purpose. That module imports the markdown
 * pipeline, which is marked `server-only`; a client component importing it would
 * pull a sanitizer into the browser bundle and create a second place where HTML
 * is trusted. The build refuses that, which is the boundary working as intended.
 *
 * The `html` passed here MUST come from `renderRichText` on the server. There is
 * no sanitization in this file — none is possible client-side without shipping
 * the very code we are keeping out.
 */
export function PreRenderedRichText({
  html,
  className,
}: {
  html: string;
  className?: string;
}) {
  if (!html) return null;
  return (
    <div
      className={className ? `rich-text ${className}` : "rich-text"}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
