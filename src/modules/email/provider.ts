/**
 * Email provider abstraction (project-specs.md §6.9).
 *
 * Deliberately tiny: one method, no template rendering, no queueing. Queueing is
 * the outbox's job and templating is `templates.ts`'s job, so a provider can be
 * swapped without touching either.
 */

export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /**
   * Deterministic per queued row. A retry after a crash that already reached the
   * SMTP server produces the SAME Message-ID, so a mail client collapses the
   * duplicate instead of showing the student two copies.
   */
  messageId: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: OutboundEmail): Promise<{ providerMessageId: string | null }>;
}
