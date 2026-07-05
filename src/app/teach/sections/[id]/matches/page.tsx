import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { inArray } from "drizzle-orm";
import { currentUserId } from "@/auth";
import { db } from "@/db";
import { studentRecords, users } from "@/db/schema";
import { AuthzError } from "@/modules/authz";
import {
  confirmMatch,
  listPendingMatchesForSection,
  rejectMatch,
} from "@/modules/identity/matching";

/** Teacher-confirm-all match dashboard: nothing binds without this page. */
export default async function MatchesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await currentUserId();
  if (!userId) redirect("/signin");
  const { id: sectionId } = await params;

  let pending;
  try {
    pending = await listPendingMatchesForSection(userId, sectionId);
  } catch (err) {
    if (err instanceof AuthzError) {
      return <main><p>You do not have access to this section.</p></main>;
    }
    throw err;
  }

  const userIds = [...new Set(pending.map((m) => m.userId))];
  const recordIds = [
    ...new Set(pending.map((m) => m.studentRecordId).filter((v): v is string => !!v)),
  ];
  const userById = new Map(
    (userIds.length
      ? await db.query.users.findMany({ where: inArray(users.id, userIds) })
      : []
    ).map((u) => [u.id, u]),
  );
  const recordById = new Map(
    (recordIds.length
      ? await db.query.studentRecords.findMany({
          where: inArray(studentRecords.id, recordIds),
        })
      : []
    ).map((r) => [r.id, r]),
  );

  async function confirm(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    await confirmMatch(uid, String(formData.get("matchId")));
    revalidatePath(`/teach/sections/${sectionId}/matches`);
  }

  async function reject(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    await rejectMatch(uid, String(formData.get("matchId")));
    revalidatePath(`/teach/sections/${sectionId}/matches`);
  }

  return (
    <main>
      <h1>Pending account matches</h1>
      <p>
        Every match requires your confirmation (teacher-confirm-all). Nothing
        is verified automatically.
      </p>
      {pending.length === 0 && <p>No pending matches.</p>}
      <ul>
        {pending.map((m) => {
          const account = userById.get(m.userId);
          const record = m.studentRecordId
            ? recordById.get(m.studentRecordId)
            : null;
          const score = (m.confidence as { score?: number } | null)?.score;
          return (
            <li key={m.id} style={{ margin: "0.75rem 0" }}>
              Google account <strong>{account?.displayName}</strong> (
              {account?.email}) →{" "}
              <strong>
                {record ? `${record.fullName} (${record.studentNumber})` : "?"}
              </strong>{" "}
              · {m.state}
              {score !== undefined && ` · similarity ${score.toFixed(2)}`}
              <form action={confirm} style={{ display: "inline", marginLeft: "1rem" }}>
                <input type="hidden" name="matchId" value={m.id} />
                <button type="submit">Confirm</button>
              </form>
              <form action={reject} style={{ display: "inline", marginLeft: "0.5rem" }}>
                <input type="hidden" name="matchId" value={m.id} />
                <button type="submit">Reject</button>
              </form>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
