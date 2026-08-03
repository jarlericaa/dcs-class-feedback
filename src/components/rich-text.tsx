import { renderRichText } from "@/modules/richtext/render";

/**
 * The ONLY sanctioned `dangerouslySetInnerHTML` in this codebase.
 *
 * Every rich staff-authored field renders through here, so there is exactly one
 * place where HTML reaches the DOM and exactly one sanitizer to audit. Adding a
 * second such call anywhere else defeats the point — see AGENTS.md §13.
 *
 * Server component: the markdown pipeline never reaches the browser.
 */
export async function SafeRichText({
  source,
  className,
  fallback = null,
}: {
  source?: string | null;
  className?: string;
  fallback?: React.ReactNode;
}) {
  if (!source?.trim()) return <>{fallback}</>;
  const html = await renderRichText(source);
  return (
    <div
      className={className ? `rich-text ${className}` : "rich-text"}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/**
 * The client-safe variant lives in `./rich-text-client` so a client component can
 * import it without dragging the server-only pipeline into the browser bundle.
 */
export { PreRenderedRichText } from "./rich-text-client";
