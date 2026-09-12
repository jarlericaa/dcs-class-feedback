"use client";

import type { ReactNode } from "react";
import { buttonClass } from "@/components/ui/button";
import { Select } from "@/components/ui/form";

/**
 * A filter that applies when you choose it.
 *
 * The backlog and audit pages made the reader pick a value and then press a
 * separate generic `Filter` button — two steps for one decision, and the first
 * one silently did nothing. This submits the enclosing GET form on change, so
 * the URL and the list update together.
 *
 * The submit button stays in the markup inside `<noscript>`, so the form still
 * works before hydration and with JavaScript off.
 */
export function AutoSubmitSelect({
  id,
  name,
  defaultValue,
  label,
  className,
  children,
}: {
  id: string;
  name: string;
  defaultValue: string;
  /** the accessible name; visually hidden, because the value reads as the label */
  label: string;
  /**
   * Container-specific sizing.
   *
   * This control appears in several places that each want a different width,
   * and the stylesheet used to say so by descendant selector — the responses
   * bar capped it at 22ch while `.ws-list__primary .select-field` let it fill.
   * Once the select renders utilities rather than `.select-field` those rules
   * match nothing, so the override travels with the call (§3.2). Passing
   * nothing keeps the component's own full-width default.
   */
  className?: string;
  children: ReactNode;
}) {
  return (
    <>
      <label className="visually-hidden" htmlFor={id}>
        {label}
      </label>
      <Select
        className={className}
        id={id}
        name={name}
        defaultValue={defaultValue}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        {children}
      </Select>
      <noscript>
        <button className={buttonClass({ variant: "secondary" })} type="submit">
          Apply
        </button>
      </noscript>
    </>
  );
}
