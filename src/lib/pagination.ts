/**
 * Offset pagination for staff lists (docs/product/specification.md §12).
 *
 * Offset rather than keyset: every paginated list here is filterable and
 * sortable by the staff member, page numbers have to be linkable, and the page
 * sizes involved (a class section's responses, questions, backlog) are small
 * enough that the offset cost never matters. Keyset would buy nothing and make
 * "jump to page 3" impossible.
 */

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 200;

export interface PageParams {
  page: number;
  pageSize: number;
  offset: number;
}

export interface Page<T> {
  rows: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

/**
 * Parse untrusted page parameters. Never throws: a bad `?page=` in a URL should
 * show page 1, not an error page.
 */
export function parsePageParams(
  input: { page?: string | number | null; pageSize?: string | number | null } = {},
  defaultPageSize = DEFAULT_PAGE_SIZE,
): PageParams {
  const page = clampInt(input.page, 1, Number.MAX_SAFE_INTEGER, 1);
  const pageSize = clampInt(input.pageSize, 1, MAX_PAGE_SIZE, defaultPageSize);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function clampInt(
  value: string | number | null | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

export function buildPage<T>(
  rows: T[],
  total: number,
  params: PageParams,
): Page<T> {
  const totalPages = Math.max(1, Math.ceil(total / params.pageSize));
  return {
    rows,
    page: params.page,
    pageSize: params.pageSize,
    total,
    totalPages,
    hasPrevious: params.page > 1,
    hasNext: params.page < totalPages,
  };
}

/** Page an already-materialized array (for read models computed in memory). */
export function paginateArray<T>(all: T[], params: PageParams): Page<T> {
  return buildPage(
    all.slice(params.offset, params.offset + params.pageSize),
    all.length,
    params,
  );
}

export function emptyPage<T>(params: PageParams): Page<T> {
  return buildPage<T>([], 0, params);
}
