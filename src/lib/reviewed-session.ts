import { cookies } from "next/headers";

/**
 * Which responses this reader has acted on during this browser session.
 *
 * The feed's "still needs a reply" view would otherwise drop a post the moment
 * you answered it, so the list shifts under the cursor and the pile silently
 * shrinks — you finish the week with no sense of having done anything. Keeping
 * an answered post in place, restyled as done, is what turns a queue into
 * visible progress.
 *
 * A session cookie rather than a column, because this is a property of one
 * person's afternoon, not of the submission. It carries no student identity —
 * only response ids, which mean nothing without the authorization every read
 * already performs — and it expires when the browser closes.
 */
const COOKIE = "cf-reviewed";

/**
 * Enough for a large section's week, and bounded so the header cannot grow
 * without limit across a long session. The oldest ids fall off first: a post
 * acted on an hour ago has already been scrolled past.
 */
const MAX_IDS = 150;

export async function readReviewedThisSession(): Promise<Set<string>> {
  const raw = (await cookies()).get(COOKIE)?.value ?? "";
  return new Set(raw.split(",").filter(Boolean));
}

/**
 * Called from the server actions that resolve a post. Safe to call twice for the
 * same id, and safe to call from an action that later redirects.
 */
export async function markReviewedThisSession(responseId: string) {
  await write(responseId, true);
}

/**
 * The reverse, for an action that puts a post back in the queue. Without it a
 * reader who declined a question and changed their mind would be left with a
 * post still stamped "Done just now" and a count that never recovered — the
 * undo would look like it had not worked.
 */
export async function unmarkReviewedThisSession(responseId: string) {
  await write(responseId, false);
}

async function write(responseId: string, present: boolean) {
  if (!responseId) return;
  const jar = await cookies();
  const kept = (jar.get(COOKIE)?.value ?? "")
    .split(",")
    .filter(Boolean)
    .filter((id) => id !== responseId);
  const next = present ? [...kept, responseId].slice(-MAX_IDS) : kept;
  jar.set(COOKIE, next.join(","), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // No maxAge: this is the session, and it should not outlive the browser.
  });
}
