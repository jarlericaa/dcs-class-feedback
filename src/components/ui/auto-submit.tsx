"use client";

import type { ReactNode } from "react";

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
  children,
}: {
  id: string;
  name: string;
  defaultValue: string;
  /** the accessible name; visually hidden, because the value reads as the label */
  label: string;
  children: ReactNode;
}) {
  return (
    <>
      <label className="visually-hidden" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="select-field"
        name={name}
        defaultValue={defaultValue}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        {children}
      </select>
      <noscript>
        <button className="button button--secondary" type="submit">
          Apply
        </button>
      </noscript>
    </>
  );
}
