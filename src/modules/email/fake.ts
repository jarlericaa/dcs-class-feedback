import type { EmailProvider, OutboundEmail } from "./provider";

/**
 * Deterministic in-memory adapter for tests.
 *
 * Records everything and sends nothing, so a test can assert on exactly what
 * would have been delivered — including that a subject carries no question or
 * feedback content.
 */
export class FakeEmailProvider implements EmailProvider {
  readonly name = "fake";
  readonly sent: OutboundEmail[] = [];
  /** Set to make the next N sends fail, to exercise retry behaviour. */
  failures = 0;

  async send(message: OutboundEmail) {
    if (this.failures > 0) {
      this.failures -= 1;
      throw new Error("fake provider: simulated delivery failure");
    }
    this.sent.push(message);
    return { providerMessageId: message.messageId };
  }

  reset() {
    this.sent.length = 0;
    this.failures = 0;
  }
}

/** Module-level instance so a test can inspect it after calling the worker. */
export const fakeEmailProvider = new FakeEmailProvider();
