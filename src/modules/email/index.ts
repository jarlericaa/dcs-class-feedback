import { env } from "@/env";
import { FakeEmailProvider, fakeEmailProvider } from "./fake";
import { LogEmailProvider } from "./log";
import { SmtpEmailProvider } from "./smtp";
import type { EmailProvider } from "./provider";

export type { EmailProvider, OutboundEmail } from "./provider";
export { FakeEmailProvider, fakeEmailProvider } from "./fake";
export { buildEmail } from "./templates";
export type { EmailEvent, TemplateContext } from "./templates";

let cached: EmailProvider | null = null;
let override: EmailProvider | null = null;

/**
 * Resolve the transport from configuration.
 *
 * `log` is the default so a misconfigured environment cannot mail real students;
 * `env.ts` separately refuses to boot in production unless this is `smtp`.
 */
export function getEmailProvider(): EmailProvider {
  if (override) return override;
  if (cached) return cached;
  switch (env.EMAIL_TRANSPORT) {
    case "smtp":
      cached = new SmtpEmailProvider();
      break;
    case "fake":
      cached = fakeEmailProvider;
      break;
    default:
      cached = new LogEmailProvider();
  }
  return cached;
}

/** Tests only: force a provider regardless of configuration. */
export function setEmailProviderForTests(provider: EmailProvider | null) {
  override = provider;
  cached = null;
}

/** Convenience for tests that want a fresh recorder. */
export function useFakeEmailProvider(): FakeEmailProvider {
  const provider = new FakeEmailProvider();
  setEmailProviderForTests(provider);
  return provider;
}
