"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { IconMoreVertical } from "@/components/ui/icons";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/cn";

type ServerAction = (formData: FormData) => void | Promise<void>;

export type OccurrenceAction =
  | {
      kind: "link";
      label: string;
      href: string;
    }
  | {
      kind: "submit";
      label: string;
      intent: string;
      pendingLabel: string;
      action: ServerAction;
      variant?: "quiet" | "danger";
    }
  | {
      kind: "confirm";
      label: string;
      intent: string;
      action: ServerAction;
      title: string;
      description: string;
      submitLabel: string;
      pendingLabel: string;
      variant?: "quiet" | "danger";
    };

/**
 * The one action affordance for an occurrence row. The page decides which
 * actions are valid; this component owns the compact trigger, menu keyboard
 * behavior, and the shared confirmation dialog for destructive transitions.
 */
export function OccurrenceActions({
  label,
  instanceId,
  actions,
  dropUp = false,
}: {
  label: string;
  instanceId: string;
  actions: OccurrenceAction[];
  dropUp?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = `occurrence-actions-${useId()}`;

  useEffect(() => {
    if (!open) return;

    const focusableItems = () =>
      Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>(
          '[role="menuitem"]',
        ) ?? [],
      );

    const onPointerDown = (event: PointerEvent) => {
      if (wrapperRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if ((event.target as Element | null)?.closest("dialog")) return;
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }

      const items = focusableItems();
      const current = document.activeElement;
      const index = items.indexOf(current as HTMLElement);
      if (index < 0 || items.length === 0) return;

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const next =
          event.key === "ArrowDown"
            ? (index + 1) % items.length
            : (index - 1 + items.length) % items.length;
        items[next]?.focus();
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        items[event.key === "Home" ? 0 : items.length - 1]?.focus();
      }
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    focusableItems()[0]?.focus();

    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative flex justify-end" ref={wrapperRef}>
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-control",
          "border border-transparent bg-transparent text-ink-muted",
          "transition-colors duration-120 hover:bg-paper-quiet hover:text-ink",
          "active:bg-board-deep active:not-disabled:duration-0",
          "pointer-coarse:size-touch",
        )}
        aria-label={`Actions for ${label}`}
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <IconMoreVertical size={17} />
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={`Actions for ${label}`}
          className={cn(
            "absolute right-0 z-30 grid min-w-52 gap-0.5 rounded-panel",
            "border border-rule-strong bg-paper p-1 shadow-overlay",
            dropUp ? "bottom-full mb-1" : "top-full mt-1",
          )}
        >
          {actions.map((action) => {
            if (action.kind === "link") {
              return (
                <Link
                  key={action.label}
                  href={action.href}
                  role="menuitem"
                  data-menu-item="true"
                  className={menuItemClass}
                  onClick={() => setOpen(false)}
                >
                  {action.label}
                </Link>
              );
            }

            if (action.kind === "submit") {
              return (
                <form key={action.label} action={action.action} className="m-0">
                  <input type="hidden" name="instanceId" value={instanceId} />
                  <input type="hidden" name="intent" value={action.intent} />
                  <SubmitButton
                    role="menuitem"
                    data-menu-item="true"
                    variant={action.variant ?? "quiet"}
                    pendingLabel={action.pendingLabel}
                    className={cn(
                      menuItemClass,
                      action.variant === "danger" && dangerItemClass,
                    )}
                  >
                    {action.label}
                  </SubmitButton>
                </form>
              );
            }

            return (
              <Dialog
                key={action.label}
                label={action.label}
                title={action.title}
                description={action.description}
                variant={action.variant ?? "quiet"}
                size="small"
                className={cn(
                  menuItemClass,
                  action.variant === "danger" && dangerItemClass,
                )}
                triggerRole="menuitem"
              >
                <form action={action.action}>
                  <input type="hidden" name="instanceId" value={instanceId} />
                  <input type="hidden" name="intent" value={action.intent} />
                  <div className="row">
                    <SubmitButton
                      variant={
                        action.variant === "danger" ? "danger" : "primary"
                      }
                      pendingLabel={action.pendingLabel}
                      className="w-full justify-center"
                    >
                      {action.submitLabel}
                    </SubmitButton>
                  </div>
                </form>
              </Dialog>
            );
          })}
        </div>
      )}
    </div>
  );
}

const menuItemClass =
  "flex w-full items-center rounded-control px-3 py-2 text-left text-ui-sm font-semibold text-ink-soft no-underline transition-colors duration-120 hover:bg-paper-quiet hover:text-ink focus-visible:outline focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2";

const dangerItemClass =
  "mt-1 border-t border-rule pt-2 text-red-deep hover:bg-red-wash hover:text-red-deep";
