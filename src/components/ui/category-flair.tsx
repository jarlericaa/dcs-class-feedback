import { cn } from "@/lib/cn";
import { categoryShortLabel } from "@/lib/threads";

/**
 * A compact, meaning-based category label.
 *
 * This is shared by the Responses review surface and the published Class Q&A
 * archive. The word remains the accessible meaning; the restrained wash only
 * helps a reader find the category in a dense list.
 */
const CATEGORY_TONE: Record<string, string> = {
  content: "border-cat-content-edge bg-cat-content-wash text-cat-content",
  logistics: "border-amber-edge bg-amber-wash text-amber-deep",
  assessment:
    "border-cat-assessment-edge bg-cat-assessment-wash text-cat-assessment",
  misc: "border-cat-other-edge bg-cat-other-wash text-cat-other",
};

const CATEGORY_FALLBACK =
  "border-cat-other-edge bg-cat-other-wash text-cat-other";

export function CategoryFlair({
  value,
  className,
}: {
  value: string | null | undefined;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center justify-center px-2",
        "rounded-stamp border",
        "font-sans text-strip uppercase",
        CATEGORY_TONE[value ?? ""] ?? CATEGORY_FALLBACK,
        className,
      )}
    >
      {categoryShortLabel(value)}
    </span>
  );
}
