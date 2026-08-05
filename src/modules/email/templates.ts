import { env } from "@/env";

/**
 * Email content builders (project-specs.md §6.9).
 *
 * The privacy rule — "emails must not expose private feedback content in their
 * subject line" — is enforced by the TYPE, not by discipline: `TemplateContext`
 * has no field capable of carrying a question, an answer, feedback, or a private
 * message. A future caller cannot pass content into a subject because there is
 * nowhere to put it.
 *
 * Every email links to an authenticated page; nothing is readable from the mail
 * itself.
 */

export type EmailEvent =
  | "form_opened"
  | "deadline_reminder"
  | "private_answer_received"
  | "public_answer_linked"
  | "submission_invalidated"
  | "submission_restored"
  | "approval_requested"
  | "approval_decided";

/** Non-sensitive context only. Deliberately no free-text content field. */
export interface TemplateContext {
  courseCode: string;
  sectionTitle: string;
  recipientName: string;
  /** Week number, never the prompt or the answer. */
  weekNumber?: number;
  deadlineText?: string;
  offsetLabel?: string;
  /** Relative, authenticated path. */
  linkPath: string;
  /** For approval events only: 'approved' | 'rejected'. */
  decision?: "approved" | "rejected";
}

export interface BuiltEmail {
  subject: string;
  text: string;
  html: string;
}

function absolute(linkPath: string): string {
  const base = env.APP_BASE_URL.replace(/\/+$/, "");
  return `${base}${linkPath.startsWith("/") ? linkPath : `/${linkPath}`}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrap(
  heading: string,
  body: string[],
  linkPath: string,
  linkLabel: string,
): { text: string; html: string } {
  const url = absolute(linkPath);
  const text = [
    heading,
    "",
    ...body,
    "",
    `${linkLabel}: ${url}`,
    "",
    "You need to be signed in with your school account to view it.",
  ].join("\n");
  const html = [
    `<p><strong>${escapeHtml(heading)}</strong></p>`,
    ...body.map((line) => `<p>${escapeHtml(line)}</p>`),
    `<p><a href="${escapeHtml(url)}">${escapeHtml(linkLabel)}</a></p>`,
    // An email client never loads globals.css, so this one colour is inlined
    // literally. It is DESIGN.md's --ink-muted, not a generic grey.
    `<p style="color:#5f655a">You need to be signed in with your school account to view it.</p>`,
  ].join("\n");
  return { text, html };
}

/** Subjects are static per event plus course/section/week only. */
export function buildEmail(
  event: EmailEvent,
  context: TemplateContext,
): BuiltEmail {
  const scope = `${context.courseCode} · ${context.sectionTitle}`;
  const week = context.weekNumber ? ` week ${context.weekNumber}` : "";

  switch (event) {
    case "form_opened": {
      const { text, html } = wrap(
        `The${week ? ` week ${context.weekNumber}` : ""} feedback form is open.`,
        [
          `Hello ${context.recipientName},`,
          context.deadlineText
            ? `You can submit until ${context.deadlineText}. You may edit your response until then.`
            : "You may edit your response until the deadline.",
        ],
        context.linkPath,
        "Open the form",
      );
      return { subject: `${scope} — feedback form${week} is open`, text, html };
    }
    case "deadline_reminder": {
      const { text, html } = wrap(
        "A feedback form is closing soon.",
        [
          `Hello ${context.recipientName},`,
          context.deadlineText
            ? `The deadline is ${context.deadlineText}. After that no submissions or edits are accepted.`
            : "After the deadline no submissions or edits are accepted.",
        ],
        context.linkPath,
        "Open the form",
      );
      return {
        subject: `${scope} — reminder: feedback form${week} closes soon`,
        text,
        html,
      };
    }
    case "private_answer_received": {
      const { text, html } = wrap(
        "You have a private reply from the teaching team.",
        [
          `Hello ${context.recipientName},`,
          "The reply is only visible to you and the teaching team. Open it on the site to read it, and you can reply there.",
        ],
        context.linkPath,
        "Read the reply",
      );
      // No part of the reply appears here — not in the subject, not in the body.
      return { subject: `${scope} — you have a private reply`, text, html };
    }
    case "public_answer_linked": {
      const { text, html } = wrap(
        "One of your questions was answered for the class.",
        [
          `Hello ${context.recipientName},`,
          "The published version is anonymous — your name is never shown to classmates. You can compare your original wording with the published wording on the site.",
        ],
        context.linkPath,
        "See the published answer",
      );
      return {
        subject: `${scope} — your question was answered for the class`,
        text,
        html,
      };
    }
    case "submission_invalidated": {
      const { text, html } = wrap(
        "One of your submissions was marked invalid.",
        [
          `Hello ${context.recipientName},`,
          "It no longer counts toward your bonus requirement. The reason is shown on your progress page.",
        ],
        context.linkPath,
        "See your progress",
      );
      return {
        subject: `${scope} — a submission${week} no longer counts`,
        text,
        html,
      };
    }
    case "submission_restored": {
      const { text, html } = wrap(
        "One of your submissions counts again.",
        [
          `Hello ${context.recipientName},`,
          "It has been restored and again counts toward your bonus requirement.",
        ],
        context.linkPath,
        "See your progress",
      );
      return {
        subject: `${scope} — a submission${week} counts again`,
        text,
        html,
      };
    }
    case "approval_requested": {
      const { text, html } = wrap(
        "A public answer is waiting for your approval.",
        [
          `Hello ${context.recipientName},`,
          "A Student Assistant submitted a draft. It cannot be published to the class until an instructor approves it.",
        ],
        context.linkPath,
        "Review the draft",
      );
      return { subject: `${scope} — a draft needs instructor approval`, text, html };
    }
    case "approval_decided": {
      const decision = context.decision === "approved" ? "approved" : "returned";
      const { text, html } = wrap(
        `Your draft was ${decision}.`,
        [
          `Hello ${context.recipientName},`,
          context.decision === "approved"
            ? "It has been published to the class."
            : "An instructor sent it back with a reason. Open it to see the note and revise.",
        ],
        context.linkPath,
        "Open the draft",
      );
      return { subject: `${scope} — your draft was ${decision}`, text, html };
    }
  }
}
