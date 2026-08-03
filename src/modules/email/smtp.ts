import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/env";
import type { EmailProvider, OutboundEmail } from "./provider";

/**
 * SMTP adapter for production (project-specs.md §6.9).
 *
 * Everything comes from the environment; nothing about the institution's mail
 * setup is hard-coded. The transporter is created once and reused, so a batch of
 * queued messages shares one connection rather than reconnecting per send.
 */
export class SmtpEmailProvider implements EmailProvider {
  readonly name = "smtp";
  private transporter: Transporter | null = null;

  private transport(): Transporter {
    if (this.transporter) return this.transporter;
    if (!env.SMTP_HOST) {
      throw new Error("SMTP_HOST is not configured");
    }
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.smtpSecure,
      auth:
        env.SMTP_USER && env.SMTP_PASSWORD
          ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
          : undefined,
    });
    return this.transporter;
  }

  async send(message: OutboundEmail) {
    const info = await this.transport().sendMail({
      from: env.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      // Passing our own Message-ID is what makes a retried send de-duplicable
      // by the recipient's mail client.
      messageId: message.messageId,
    });
    return { providerMessageId: info.messageId ?? message.messageId };
  }
}
