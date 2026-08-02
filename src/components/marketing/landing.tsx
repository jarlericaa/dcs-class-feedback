import Link from "next/link";
import { env } from "@/env";

/**
 * Public landing page, shown at / to anyone who is not signed in.
 *
 * Two rules held deliberately:
 *
 * 1. Every claim here is true of the built product. Nothing describes a
 *    deferred feature (notifications, AI, unpublishing, course materials,
 *    comments, voting) as if it exists.
 * 2. There are no institution logos, testimonials or adoption figures. None
 *    exist for a pilot-stage tool, and inventing them would be a fabricated
 *    endorsement on a public page.
 *
 * The product preview is built from the application's own UI vocabulary
 * rather than a screenshot, so it cannot drift out of date silently.
 */
export function Landing() {
  const domains = env.allowedEmailDomains;

  return (
    <div className="lp">
      <header className="lp-nav">
        <Link className="lp-nav__brand" href="/">
          <span className="lp-nav__mark" aria-hidden="true">
            cf
          </span>
          Class Feedback
        </Link>
        <nav className="lp-nav__links" aria-label="Page sections">
          <a href="#how">How it works</a>
          <a href="#roles">For students &amp; staff</a>
          <a href="#privacy">Privacy</a>
        </nav>
        <span className="lp-nav__spacer" />
        <Link className="lp-btn lp-btn--primary lp-btn--sm" href="/signin">
          Sign in
        </Link>
      </header>

      <main id="main-content">
        <section className="lp-hero">
          <div className="lp-wrap lp-hero__grid">
            <div>
              <p className="lp-eyebrow">For university class sections</p>
              <h1 className="lp-h1">
                Weekly feedback that actually gets answered.
              </h1>
              <p className="lp-sub">
                Collecting feedback was never the hard part. Class Feedback owns
                everything after it: reviewing what students said, replying
                privately, and publishing anonymous answers back to the class.
              </p>
              <div className="lp-cta">
                <Link className="lp-btn lp-btn--primary" href="/signin">
                  Sign in with your university account
                </Link>
                <a className="lp-btn lp-btn--ghost" href="#how">
                  See how it works
                </a>
              </div>
              <p className="lp-note">
                {domains.length > 0
                  ? `Open to ${domains.join(", ")} accounts. Nothing here is visible on the public internet.`
                  : "University accounts only. Nothing here is visible on the public internet."}
              </p>
            </div>

            <div className="lp-shot" role="img" aria-label="Preview of the Class Feedback workspace: a course rail, a list of published questions, and the selected answer">
              <div className="lp-shot__bar">
                <span
                  aria-hidden="true"
                  style={{
                    display: "inline-grid",
                    placeItems: "center",
                    width: 18,
                    height: 18,
                    borderRadius: 4,
                    color: "var(--brand-bar)",
                    background: "#fff",
                    fontSize: 9,
                    fontWeight: 900,
                  }}
                >
                  cf
                </span>
                DCS-101 — Q&amp;A
              </div>
              <div className="lp-shot__body">
                <div className="lp-shot__rail" aria-hidden="true">
                  <div className="lp-shot__railitem lp-shot__railitem--on">
                    <span className="cat-dot cat--content" /> Content
                  </div>
                  <div className="lp-shot__railitem">
                    <span className="cat-dot cat--logistics" /> Logistics
                  </div>
                  <div className="lp-shot__railitem">
                    <span className="cat-dot cat--misc" /> Other
                  </div>
                </div>
                <div className="lp-shot__list" aria-hidden="true">
                  <div className="lp-shot__group">This Week</div>
                  <div className="lp-shot__row lp-shot__row--on">
                    <b>Can the slide font be larger?</b>
                    <span>
                      <span className="cat-label cat-label--logistics">
                        Logistics
                      </span>{" "}
                      · Anonymous · 2h · answered
                    </span>
                  </div>
                  <div className="lp-shot__row">
                    <b>Will the finals be cumulative?</b>
                    <span>
                      <span className="cat-label cat-label--content">
                        Content
                      </span>{" "}
                      · Anonymous · 1d · answered
                    </span>
                  </div>
                  <div className="lp-shot__group">Last Week</div>
                  <div className="lp-shot__row">
                    <b>Is the Tuesday lab recorded?</b>
                    <span>
                      <span className="cat-label cat-label--logistics">
                        Logistics
                      </span>{" "}
                      · Anonymous · 8d · answered
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-section" id="how">
          <div className="lp-wrap">
            <h2 className="lp-h2">How a week works</h2>
            <p className="lp-lede">
              One recurring form per class section. It opens and closes on a
              schedule you set, and nobody has to remember to send anything.
            </p>
            <div className="lp-steps">
              <div className="lp-step">
                <span className="lp-step__n">1</span>
                <h3>Students submit once</h3>
                <p>
                  They answer your questions and can add a question of their
                  own. One submission per section per week, and it cannot be
                  edited afterwards.
                </p>
              </div>
              <div className="lp-step">
                <span className="lp-step__n">2</span>
                <h3>Staff review and reply</h3>
                <p>
                  Work through the week in an inbox. Reply privately to one
                  student, or reword a question so it can be answered for
                  everyone without identifying who asked.
                </p>
              </div>
              <div className="lp-step">
                <span className="lp-step__n">3</span>
                <h3>The class gets the answer</h3>
                <p>
                  Published answers land in a searchable archive for that
                  section. The asker sees their question was answered; nobody
                  else sees it was theirs.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-section lp-section--tint" id="roles">
          <div className="lp-wrap">
            <h2 className="lp-h2">Built for both sides of the room</h2>
            <p className="lp-lede">
              Students and staff get genuinely different workspaces, because
              they need different things and must see different data.
            </p>
            <div className="lp-cols">
              <div className="lp-card">
                <h3>Students</h3>
                <p>Two minutes a week, on a phone.</p>
                <ul className="lp-list">
                  <li>Answer the weekly form and ask anything alongside it</li>
                  <li>Ask without your classmates knowing it was you</li>
                  <li>See private replies from your teaching team</li>
                  <li>Search everything the class has already asked</li>
                  <li>Keep a record of what you submitted and when</li>
                </ul>
              </div>
              <div className="lp-card">
                <h3>Teaching staff</h3>
                <p>The part that used to be a pile of documents.</p>
                <ul className="lp-list">
                  <li>A review inbox per week, filtered by what needs work</li>
                  <li>Private replies, or reworded answers for the whole class</li>
                  <li>An anonymity check before anything is published</li>
                  <li>Participation derived from valid submissions, exportable as CSV</li>
                  <li>Reusable question templates and an automatic weekly schedule</li>
                  <li>
                    Per-assistant permissions, and an audit trail of every
                    important change
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-section" id="privacy">
          <div className="lp-wrap">
            <div className="lp-privacy">
              <h2>Anonymous means anonymous</h2>
              <p>
                Anonymity here is a data rule, not a badge on a card. These are
                enforced on the server, and the ones about identity are covered
                by tests that fail the build if they stop being true.
              </p>
              <div className="lp-privacy__grid">
                <ul className="lp-list">
                  <li>
                    &ldquo;Public&rdquo; means visible to your class section —
                    never to the open internet
                  </li>
                  <li>
                    Your original wording is never shown; staff publish a
                    reworded version
                  </li>
                  <li>Students never see another student&apos;s identity</li>
                  <li>
                    Nobody outside your section can reach your section&apos;s
                    archive
                  </li>
                </ul>
                <ul className="lp-list">
                  <li>
                    Roster matching is confirmed by a teacher — never guessed
                    automatically
                  </li>
                  <li>
                    Staff notes, validity decisions and drafts are never shown
                    to students
                  </li>
                  <li>Identity-bearing exports are staff-only and recorded</li>
                  <li>No student data is ever sent to an AI service</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-final">
          <div className="lp-wrap">
            <h2>Ready when your class is</h2>
            <p>
              Sign in with your university account. Students are matched to the
              class list by their teacher before they can see anything.
            </p>
            <div className="lp-cta">
              <Link className="lp-btn lp-btn--primary" href="/signin">
                Sign in
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer__row">
          <span className="lp-nav__brand" style={{ fontSize: 15 }}>
            <span className="lp-nav__mark" aria-hidden="true">
              cf
            </span>
            Class Feedback
          </span>
          <span className="lp-nav__spacer" />
          <Link href="/signin">Sign in</Link>
          <span>A university class-feedback platform.</span>
        </div>
      </footer>
    </div>
  );
}
