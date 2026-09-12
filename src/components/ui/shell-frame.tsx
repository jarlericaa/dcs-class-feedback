import type { ReactNode } from "react";

/**
 * The app's chrome, drawn without any data behind it.
 *
 * It exists because of where `AppShell` lives: **each page renders its own
 * shell**, not a layout. So a `loading.tsx` or an `error.tsx` replaces the page
 * *and the shell with it* — meaning every slow navigation, and every thrown
 * error, would blank the top bar and the rail and then paint them back. The
 * whole window flashing to stand in for one column of content.
 *
 * This draws that chrome for real: the 52px top bar with the product mark, and
 * the 248px rail on its dark ground. **Nothing here pulses or shimmers**,
 * because nothing here is waiting — it is the same chrome that is about to be
 * there (or that was there a moment ago), and animating it would claim
 * otherwise. Only what a caller puts in `children` is a placeholder.
 *
 * What it cannot do, stated: it cannot read the cookie holding the rail's
 * collapsed state. A `loading.tsx` renders synchronously as a Suspense fallback
 * and cannot await `cookies()`, and a client component that read it would flash
 * for everyone. So the rail is drawn expanded; a reader who has collapsed it
 * sees 176px more rail for the length of one query.
 *
 * The rail carries `ws-rail`. `--color-rail-*` is fenced by `globals.css` to
 * `.ws-rail` and `.ws-drawer__panel` and nothing else ("the two grounds never
 * mix", D-E) — and this genuinely *is* the rail, so it takes the class rather
 * than the fence taking an exception.
 */
export function ShellFrame({
  /** Announced once, politely, for the loading case. */
  status,
  children,
}: {
  status?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-board">
      {status && (
        /* Not `aria-busy` on a live region wrapping the chrome: a reader should
           hear the page they navigated to when it arrives, once — not a
           placeholder introducing itself first. */
        <p className="visually-hidden" role="status">
          {status}
        </p>
      )}

      <header
        aria-hidden="true"
        className="flex h-topbar shrink-0 items-center gap-3 border-b border-rule bg-paper px-4"
      >
        {/* The same mark the real top bar draws (`.ws-brand__mark`): UP Maroon,
            paper ink. It was `bg-accent` here, which meant the loading state
            showed a green mark and the page that replaced it a maroon one —
            a flash of the wrong brand on every slow navigation. */}
        <span className="grid size-7 place-items-center rounded-control bg-red-deep text-stamp font-bold text-paper">
          cf
        </span>
        <span className="text-ui-sm font-semibold text-ink">
          Class Feedback
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        <div
          aria-hidden="true"
          className="ws-rail hidden w-rail shrink-0 bg-rail p-4 min-[860px]:block"
        >
          <span className="mb-3 block h-2.5 w-20 rounded-stamp bg-rail-raised" />
          <span className="grid gap-1">
            {Array.from({ length: 5 }, (_, row) => (
              <span
                className="block min-h-nav-item rounded-control bg-rail-raised/40"
                key={row}
              />
            ))}
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}
