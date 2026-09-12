/**
 * The shared presentational vocabulary, re-exported.
 *
 * The implementations live beside this file, split by what they are FOR —
 * `status` (state as a stamp), `feedback` (what happened / nothing to show),
 * `surface` (the containers) and `data` (reading a set). They were one
 * 651-line file until DESIGN-TODO §3.4; this barrel exists so that split
 * changed no call site, and so `@/components/ui` stays the one import path.
 *
 * These components receive already-authorized data and emit markup only — no
 * data access, no authorization, no domain rules.
 *
 * Not re-exported, because they are imported directly and always have been:
 * `./button`, `./tag`, `./required-mark`, `./submit-button`, `./dialog`,
 * `./form`, `./icons`, `./thread`, and the other single-purpose files here.
 */

export * from "./status";
export * from "./feedback";
export * from "./surface";
export * from "./data";
export * from "./category-flair";
