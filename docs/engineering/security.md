# Security and Privacy Guide

This application handles student identity, enrollment, feedback, and private
teacher responses. Privacy behavior is a product invariant, not a cosmetic UI
detail.

## Threats that shape the design

1. **Wrong roster email:** an incorrect address in an imported class list binds a university account to
   the wrong roster record.
2. **Cross-section access:** a teacher, TA, or student may try to access a
   resource through a guessed URL or stale link.
3. **Anonymity failure:** a public question may contain enough detail to reveal
   its asker even when the name is hidden.
4. **Identity-bearing exports:** participation and response exports can expose
   sensitive data if downloaded or shared without staff controls.
5. **Scheduler/retry errors:** duplicate cycles or publications can create
   incorrect participation or misleading answers.
6. **Development bypass leakage:** the seeded dev-login path must never be
   available in production.

## Hard invariants

- **Student access is exact normalized UP-email matching** against the
  teacher-uploaded class list, plus an active enrollment. Trim and lowercase on
  both sides, then equality — nothing else. Names are never an identity key.
  See [domain/student-identity.md](../domain/student-identity.md).
- **`ALLOWED_EMAIL_DOMAINS` is a privacy/security control, not operational
  tuning.** It gates sign-in *and* which class-list addresses may be imported.
  Widening it lets accounts outside the university become students, so it
  requires owner approval and must **not** be changed casually during
  troubleshooting or incident response. An empty value rejects everything, which
  is the correct failure direction.
- **A section's roster authority is never global identity authority.** Import is
  section-scoped, but `roster_email` is global, so a row that would change the
  address of a student enrolled only in some other section is refused rather
  than applied. Correcting such a student is an authorized identity correction by
  staff who actually hold them, not a side effect of uploading a file.
- **A refused row is not an absent student.** Deactivation is keyed on the
  student numbers a file mentions, never on the rows that imported cleanly, so a
  bad email cell can never silently drop somebody from a class.
- Section staff access is resource-scoped; TA permissions are explicit.
- Platform-admin status does not automatically grant course content access.
- Public Q&A is only for enrolled students and authorized staff in that section.
- The original student wording remains immutable and is never used as the public
  text without the publish warning/review flow.
- Source links are internal-only.
- Students never see validity reasons, review notes, drafts, audit data, or
  classmates' identities.
- Identity-bearing exports are staff-only and must be audited.
- Audit records are append-only from application code.
- AI is not part of the current release and must not receive student PII.

## Release checklist

- [ ] Production OAuth credentials use the correct university callback and
      allowed-domain restrictions.
- [ ] `DEV_AUTH_ENABLED` cannot enable a provider in production.
- [ ] `AUTH_SECRET` and scheduler secrets are production-grade and not committed.
- [ ] `ALLOWED_EMAIL_DOMAINS` lists exactly the university domains that may sign
      in and be imported — no wildcards, no consumer providers.
- [ ] Class lists were imported from an authoritative registrar export; spot-check
      that refused rows were fixed rather than worked around.
- [ ] No `.env`, seeded credentials, or real student data is in the repository,
      screenshots, fixtures, or documentation.
- [ ] Every student/staff route and server action performs server-side authz.
- [ ] Public archive queries filter by section membership.
- [ ] Publish UI clearly communicates who can see an answer and warns about
      identifying context.
- [ ] CSV exports are permission-checked, scoped, and audited.
- [ ] Database backups, retention, and deletion behavior have institutional
      approval before pilot use.
- [ ] Error responses do not reveal student records or internal identifiers to
      unauthorized users.

## Related specifications

- [domain/student-identity.md](../domain/student-identity.md)
- [domain/roles-and-permissions.md](../domain/roles-and-permissions.md)
- [domain/public-qa.md](../domain/public-qa.md)
- [domain/participation.md](../domain/participation.md)
- [product/ai-future-plan.md](../product/ai-future-plan.md)
