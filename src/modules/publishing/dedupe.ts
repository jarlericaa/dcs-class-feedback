/**
 * Public question titles are grouped in the class archive. Treat case and
 * repeated whitespace as presentation differences, not separate titles.
 */
export function normalizePublicQuestionText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}
