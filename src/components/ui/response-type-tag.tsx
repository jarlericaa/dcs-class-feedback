import { cn } from "@/lib/cn";

export type ResponseType = "public" | "private";

/**
 * A compact label for a response channel.
 *
 * This is deliberately separate from CategoryFlair and Stamp: it describes
 * who can read a response, not what the question is about or what state it is
 * in.
 */
export function ResponseTypeTag({
  type,
  label,
  className,
}: {
  type: ResponseType;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit items-center justify-self-start px-2 whitespace-nowrap",
        "rounded-stamp border font-sans text-stamp font-semibold uppercase tracking-wide",
        type === "public"
          ? "border-accent-edge bg-accent-wash text-accent-deep"
          : "border-amber-edge bg-amber-wash text-amber-deep",
        className,
      )}
    >
      {label ?? (type === "public" ? "Public answer" : "Private reply")}
    </span>
  );
}
