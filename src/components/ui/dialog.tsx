"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

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
  variant,
  className,
}: {
  /** the trigger's text, and its accessible name */
  label: ReactNode;
  title: string;
  /** one line, next to the action it governs — never a paragraph */
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** how the TRIGGER looks; the dialog itself is always neutral */
  variant?: "primary" | "secondary" | "quiet" | "danger";
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

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Escape and the backdrop close through the same path as the button, so the
  // dialog's `open` attribute and this component's state cannot disagree.
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
    dialog.addEventListener("cancel", cancel);
    dialog.addEventListener("close", close);
    return () => {
      dialog.removeEventListener("cancel", cancel);
      dialog.removeEventListener("close", close);
    };
  }, []);

  return (
    <>
      <button
        ref={triggerRef}
        className={`button button--${variant ?? "secondary"}${
          className ? ` ${className}` : ""
        }`}
        type="button"
        onClick={() => setOpen(true)}
      >
        {label}
      </button>

      {mounted &&
        createPortal(
          <dialog className="dlg" ref={dialogRef} aria-labelledby={titleId}>
            {/* Mounted but empty until opened, so a dialog's form fields are not
                part of the tab order — and are not submitted — while closed. */}
            {open && (
              <>
                <div className="dlg__head">
                  <div>
                    <h2 className="dlg__title" id={titleId}>
                      {title}
                    </h2>
                    {description && <p className="dlg__desc">{description}</p>}
                  </div>
                  <button
                    className="button button--quiet button--small"
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      triggerRef.current?.focus();
                    }}
                  >
                    Close
                  </button>
                </div>
                <div className="dlg__body">{children}</div>
                {footer && <div className="dlg__foot">{footer}</div>}
              </>
            )}
          </dialog>,
          document.body,
        )}
    </>
  );
}
