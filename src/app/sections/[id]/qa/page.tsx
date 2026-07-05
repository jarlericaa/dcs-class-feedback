import { redirect } from "next/navigation";
import { currentUserId } from "@/auth";
import { listSectionQa } from "@/modules/publishing";
import { AuthzError } from "@/modules/authz";

/**
 * Section Q&A archive — anonymous, searchable, and CLASS-ONLY: enrolled
 * students and section staff. Unenrolled users are rejected server-side.
 */
export default async function QaArchivePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const userId = await currentUserId();
  if (!userId) redirect("/signin");
  const { id: sectionId } = await params;
  const { q, category } = await searchParams;

  let entries;
  try {
    entries = await listSectionQa(userId, sectionId, {
      search: q,
      category: category as "content" | "logistics" | "misc" | undefined,
    });
  } catch (err) {
    if (err instanceof AuthzError) {
      return <main><p>You do not have access to this section&apos;s Q&amp;A archive.</p></main>;
    }
    throw err;
  }

  return (
    <main>
      <h1>Class Q&amp;A archive</h1>
      <form method="get">
        <input name="q" placeholder="Search questions and answers" defaultValue={q ?? ""} />
        <select name="category" defaultValue={category ?? ""}>
          <option value="">All categories</option>
          <option value="content">Content</option>
          <option value="logistics">Logistics</option>
          <option value="misc">Miscellaneous</option>
        </select>
        <button type="submit">Search</button>
      </form>
      {entries.length === 0 && <p>No published Q&amp;A yet.</p>}
      {entries.map((e) => (
        <article
          key={e.id}
          style={{ border: "1px solid #ccc", padding: "1rem", margin: "1rem 0" }}
        >
          <h2>{e.question}</h2>
          <p>{e.answer}</p>
          <small>
            {e.category ?? "uncategorized"} ·{" "}
            {e.publishedAt?.toLocaleDateString()} ·{" "}
            {e.sourceOrigin === "legacy" ? "from a previous semester" : ""}
          </small>
        </article>
      ))}
    </main>
  );
}
