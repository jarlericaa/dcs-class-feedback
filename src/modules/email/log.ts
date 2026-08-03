import type { EmailProvider, OutboundEmail } from "./provider";

/**
 * Development adapter: records the attempt in the server log and sends nothing.
 *
 * This is the DEFAULT transport, so a misconfigured development or staging
 * environment cannot accidentally mail real students.
 *
 * It logs the subject and the link path but never the body, because a body can
 * contain a private answer and server logs are not a private channel.
 */
export class LogEmailProvider implements EmailProvider {
  readonly name = "log";

  async send(message: OutboundEmail) {
    console.info(
      "[email:log] would send",
      JSON.stringify({
        to: message.to,
        subject: message.subject,
        messageId: message.messageId,
        bodyLength: message.text.length,
      }),
    );
    return { providerMessageId: message.messageId };
  }
}
