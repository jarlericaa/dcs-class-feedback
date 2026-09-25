"use client";

import { useFormStatus } from "react-dom";
import { buttonClass, type ButtonVariant } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * A submit button that says so while the server is working (§5.1).
 *
 * Every mutation in this app is a server action, and there was no pending state
 * anywhere: you pressed Submit and the page sat there, unchanged, until the
 * round trip finished. On the weekly form — the one control a student uses —
 * that reads as "it didn't work", and nothing prevented a second press
 * enqueueing a second submission.
 *
 * `useFormStatus` reports the status of the nearest enclosing `<form>`, which
 * is why this has to be a client component and has to be rendered INSIDE the
 * form rather than passed to it. It reads that form's status only, so several
 * of these on one page do not disable each other.
 *
 * Disabling while pending is the point, not a side effect: it is what stops the
 * double submit. The label changes with it, so the state is carried by words as
 * well as by the control being unavailable.
 *
 * Since 2026-09-11 a `Spinner` sits beside that label. The two are not
 * redundant and the original note here — "a spinner alone would say something
 * is happening without saying what" — is the reason they are paired rather than
 * chosen between: the spinner is the **immediate** acknowledgement, visible in
 * the same frame as the click and before any text is read, while the label
 * carries the **meaning**. Motion is never the only channel (`spinner.tsx`), so
 * a reader with reduced motion, or one hearing the button rather than seeing
 * it, loses nothing.
 */
export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  size = "default",
  className,
  ...props
}: {
  children: React.ReactNode;
  /** What it says mid-flight. Defaults to the resting label. */
  pendingLabel?: string;
  variant?: ButtonVariant;
  size?: "default" | "small";
  className?: string;
} & Omit<React.ComponentProps<"button">, "type" | "children">) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={buttonClass({ variant, size, className })}
      disabled={pending || props.disabled}
      {...props}
    >
      {/* `labelled`, because the button's own text already says it — without
          that the wait would be announced twice. */}
      {pending && <Spinner labelled />}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
