import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUserId } from "@/auth";
import { requireUser, toShellUser } from "@/lib/session";
import { AppShell } from "@/components/layout/app-shell";
import { homeNav } from "@/components/layout/nav";
import { Alert, Breadcrumbs } from "@/components/ui";
import {
  RosterClaim,
  type ClaimState,
} from "@/components/student/roster-claim";
import {
  ClaimInputError,
  ClaimThrottledError,
  getMyClaimStatus,
  submitRosterClaim,
} from "@/modules/identity/claim";

/**
 * Student roster claim (project-specs.md §6.1).
 *
 * Any signed-in account may reach this page — that is the point: a student has no
 * course access until they are linked, so the claim flow cannot itself require
 * course access. The service does the throttling and the non-disclosure.
 */
export default async function ClaimPage() {
  const user = await requireUser();
  const status = await getMyClaimStatus(user.id);

  async function claim(
    _prev: ClaimState,
    formData: FormData,
  ): Promise<ClaimState> {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const studentNumber = String(formData.get("studentNumber") ?? "");
    try {
      const result = await submitRosterClaim(uid, studentNumber);
      revalidatePath("/claim");
      revalidatePath("/");
      if (result.outcome === "linked") {
        return {
          status: "linked",
          studentNumber: "",
          message:
            result.sectionCount > 0
              ? `You are linked to your roster entry and can now open your ${result.sectionCount} class section${result.sectionCount === 1 ? "" : "s"}.`
              : "You are linked to your roster entry. Your sections will appear once your teacher enrols you.",
        };
      }
      return {
        status: "pending",
        studentNumber,
        message:
          "Sent to your teacher to confirm. This is the same reply whether or not the number matched, so nobody can use this page to look up another student.",
      };
    } catch (err) {
      if (err instanceof ClaimThrottledError) {
        return { status: "throttled", studentNumber, message: err.message };
      }
      if (err instanceof ClaimInputError) {
        return { status: "error", studentNumber, message: err.message };
      }
      if (err instanceof Error) {
        return { status: "error", studentNumber, message: err.message };
      }
      throw err;
    }
  }

  return (
    <AppShell
      user={toShellUser(user)}
      workspace="student"
      navGroups={homeNav("/claim", {
        isTeacher: user.isTeacher,
        isPlatformAdmin: user.isPlatformAdmin,
      })}
      breadcrumbs={
        <Breadcrumbs
          items={[{ href: "/", label: "Overview" }, { label: "Claim your place" }]}
        />
      }
      title="Claim your place on the class list"
      description="Your class list does not include email addresses, so tell us your student number and your teacher will confirm it is you."
    >
      <div className="stack-gap">
        {status.kind === "confirmed" ? (
          <Alert variant="success" title="You are already linked">
            Your account is linked to your roster entry.{" "}
            <Link href="/">Go to your sections</Link>.
          </Alert>
        ) : (
          <>
            <Alert variant="info" title="What happens to what you type">
              Your student number is stored encrypted, and only the last four
              characters are shown to staff in lists. Signing in on its own gives
              you no access to anyone&apos;s work.
            </Alert>
            <RosterClaim
              action={claim}
              initialStatus={status.kind === "pending" ? "pending" : "none"}
              typedLast4={
                status.kind === "pending" ? status.typedLast4 : undefined
              }
            />
          </>
        )}
      </div>
    </AppShell>
  );
}
