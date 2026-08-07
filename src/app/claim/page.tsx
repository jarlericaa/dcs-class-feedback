import { redirect } from "next/navigation";

/**
 * The roster-claim flow no longer exists: student access is exact normalized
 * UP-email matching against the teacher-uploaded class list, so there is nothing
 * to claim and nothing for a teacher to confirm (docs/student-identity.md).
 *
 * The route survives only as a redirect, so a bookmark from the pilot lands on
 * the overview — which either shows their classes or explains why it cannot.
 */
export default function ClaimPage() {
  redirect("/");
}
