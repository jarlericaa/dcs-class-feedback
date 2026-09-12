"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { buttonClass, type ButtonVariant } from "@/components/ui/button";
import { IconClose } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

/**
 * One dialog primitive for every deliberate action in the app.
 *
 * A native `<dialog>` opened with `showModal()`, because the platform already
 * implements the parts that are easy to get wrong: the focus trap, the Escape
 * key, `aria-modal`, and inertness of the page behind it. Reimplementing those
 * is how a dialog ends up unusable with a keyboard.
 *
 * Portalled to `document.body` for one structural reason: a dialog usually holds
 * a `<form>` posting to a server action, and its trigger is often already inside
 * another form. Nested forms are invalid HTML and browsers silently drop the
 * inner one, which would make the dialog's submit button do nothing.
 *
 * Focus returns to the trigger on close — the button remembers itself, so the
 * reader is not dropped at the top of the document.
 */
export function Dialog({
  label,
  title,
  description,
  children,
  footer,
  cancelLabel,
  variant,
  size,
  className,
}: {
  /** the trigger's text, and its accessible name */
  label: ReactNode;
  title: string;
  /** one line, next to the action it governs — never a paragraph */
  description?: ReactNode;
  /**
   * The dialog's body. Pass a function to get a `close` handle — which a
   * Cancel button inside the form needs, since it dismisses rather than
   * submits and the × in the corner is not where a reader looks for it.
   *
   * A render prop rather than a context: one consumer, no provider to forget,
   * and the existing seven call sites pass a node and are untouched.
   */
  children: ReactNode | ((close: () => void) => ReactNode);
  footer?: ReactNode;
  /** Optional visible dismissal action in the dialog footer. */
  cancelLabel?: string;
  /** how the TRIGGER looks; the dialog itself is always neutral */
  variant?: ButtonVariant;
  /** The trigger IS a button, so it sizes like one instead of via className. */
  size?: "default" | "small";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  /**
   * The portal is mounted only after hydration.
   *
   * `typeof document !== "undefined"` as a render-time branch is a server/client
   * fork: the server emits nothing and the first client render emits the portal,
   * which is a hydration mismatch. Both agree on "nothing" until this flips.
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = `dlg-${useId()}`;
  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      /*
        Put the caret in the field the caller nominated.

        `showModal()` focuses the element carrying the `autofocus` ATTRIBUTE,
        and React's `autoFocus` prop does not set that attribute — it calls
        `.focus()` imperatively at mount, which happens before this line and on
        an element that is not yet in the top layer, so the browser then falls
        back to the first focusable child. That is the close button, which sits
        first in the header. The reader would open "Create course" with the ×
        focused and typing would do nothing.

        So the caller marks its field with `data-autofocus` and this finds it
        after the dialog is actually showing. No mark, no change: the platform's
        own behaviour stands.
      */
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  /*
    Escape and the backdrop close through the same path as the button, so the
    dialog's `open` attribute and this component's state cannot disagree.

    `[mounted]` is the dependency and it is load-bearing — with `[]` this
    effect was a no-op that silently broke Escape, and did so at all seven
    call sites. The portal only mounts after hydration (`mounted`), so on the
    first run `dialogRef.current` is still `null` and the effect returned
    early; with no dependency it never ran again, and **no listener was ever
    attached**. Escape still appeared to work, because a native `<dialog>`
    closes itself — but `open` stayed `true`, so the next press of the trigger
    set state to a value it already held, no effect re-ran, and the dialog
    could not be reopened for the life of the page. Found 2026-09-11 by
    driving the running app; no static check would have seen it.
  */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const close = () => {
      setOpen(false);
      triggerRef.current?.focus();
    };
    const cancel = (event: Event) => {
      event.preventDefault();
      close();
    };
    /*
      Click outside to close (`modal.md`).

      A native `<dialog>` does NOT do this on its own, and the usual mistake is
      to listen on the backdrop — which is a pseudo-element and cannot carry a
      listener. What makes this correct is that the dialog's own box is the only
      thing behind the scrim, so a click that lands on the BACKDROP reports the
      dialog itself as its target, while any click on the content reports a
      child. The element is `p-0` for exactly this reason: padding on the dialog
      would be backdrop-by-this-test and dismiss on a click inside the frame.

      `mousedown`, not `click`: a drag that starts inside the dialog and
      releases outside it fires `click` on the dialog, so selecting text in a
      field and overshooting would throw the form away.
    */
    const dismiss = (event: MouseEvent) => {
      if (event.target === dialog) close();
    };
    dialog.addEventListener("cancel", cancel);
    dialog.addEventListener("close", close);
    dialog.addEventListener("mousedown", dismiss);
    return () => {
      dialog.removeEventListener("cancel", cancel);
      dialog.removeEventListener("close", close);
      dialog.removeEventListener("mousedown", dismiss);
    };
  }, [mounted]);

  return (
    <>
      <button
        ref={triggerRef}
        className={buttonClass({
          variant: variant ?? "secondary",
          size,
          className,
        })}
        type="button"
        onClick={() => setOpen(true)}
      >
        {label}
      </button>

      {mounted &&
        createPortal(
          <dialog
            className={cn(
              // A sheet on the board, at the one elevation that exists. The
              // width tracks the spacing base rather than restating 24px.
              "w-[min(620px,calc(100vw-(var(--spacing)*6)))] max-w-none",
              "max-h-[min(88vh,860px)] p-0 overflow-hidden",
              "border border-rule-strong rounded-panel",
              "bg-paper text-ink shadow-overlay",
              "backdrop:bg-scrim",
              /**
               * Three rows — head, body, foot — with the BODY as the only one
               * that scrolls (§11.2d).
               *
               * The body used to cap itself at `calc(min(88vh, 860px) - 150px)`:
               * a literal 150px standing in for a header and footer it could
               * not measure. A two-line title overflowed it, and a dialog
               * without a footer wasted 150px. `1fr` measures them for free.
               */
              "grid grid-rows-[auto_1fr_auto]",
              /*
                And hidden while closed — which the browser would do for free if
                this element carried no `display` of its own. The UA rule is
                `dialog:not([open]) { display: none }`, and an AUTHOR `display:
                grid` beats it on cascade origin regardless of specificity, so
                every closed dialog in the app was a laid-out 620px box at the
                end of `<body>`. Invisible only because it renders no children
                while closed (see below), which is luck rather than design.
              */
              "not-open:hidden",
              // A phone gets a full-screen sheet, never a shrunken dialog.
              "max-sm:w-screen max-sm:max-w-screen max-sm:h-dvh max-sm:max-h-dvh",
              "max-sm:m-0 max-sm:border-0 max-sm:rounded-none",
            )}
            ref={dialogRef}
            aria-labelledby={titleId}
          >
            {/* Mounted but empty until opened, so a dialog's form fields are not
                part of the tab order — and are not submitted — while closed. */}
            {open && (
              <>
                <div
                  className={cn(
                    "flex items-start justify-between gap-4",
                    "px-6 py-4 max-sm:px-4 max-sm:py-3",
                    "border-b border-rule bg-paper-quiet",
                  )}
                >
                  <div>
                    <h2
                      className="font-document text-panel-title font-bold"
                      id={titleId}
                    >
                      {title}
                    </h2>
                    {description && (
                      <p className="mt-1 max-w-[56ch] text-ink-muted text-ui-sm">
                        {description}
                      </p>
                    )}
                  </div>
                  {/*
                    A small × in the corner (`modal.md`), where the convention
                    is universal — and it is the one place this app lets an
                    icon stand without its word, because `aria-label` carries
                    the name and Escape and the backdrop both do the same job.
                    It was the word "Close" in a quiet button, which read as a
                    third action competing with the footer's Cancel.

                    Sized on the control scale rather than freehand: `size-8`
                    is the 32px box a 16px glyph centres in, and it keeps the
                    coarse-pointer floor via `pointer-coarse:size-touch`.
                  */}
                  <button
                    aria-label="Close"
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-control",
                      "border-0 bg-transparent text-ink-muted",
                      "transition-colors duration-120",
                      "hover:bg-board-deep hover:text-ink",
                      "active:bg-rule active:not-disabled:duration-0",
                      "pointer-coarse:size-touch",
                    )}
                    type="button"
                    onClick={close}
                  >
                    <IconClose aria-hidden="true" size={16} />
                  </button>
                </div>
                {/* The caller passes a bare `<form>` more often than not, so the
                    grid that spaces its fields is applied from here rather than
                    asked for at every call site. */}
                <div className="overflow-y-auto p-6 max-sm:p-4 [&>form]:grid [&>form]:gap-4">
                  {typeof children === "function" ? children(close) : children}
                </div>
                {(footer || cancelLabel) && (
                  <div
                    className={cn(
                      "flex items-center justify-end gap-3 px-6 py-3 max-sm:px-4",
                      "border-t border-rule bg-paper-quiet",
                      "text-ink-muted text-ui-sm",
                    )}
                  >
                    {footer}
                    {cancelLabel && (
                      <button
                        className={buttonClass({
                          variant: "secondary",
                          size: "small",
                        })}
                        type="button"
                        onClick={close}
                      >
                        {cancelLabel}
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </dialog>,
          document.body,
        )}
    </>
  );
}
