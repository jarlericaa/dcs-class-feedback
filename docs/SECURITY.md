# Security and Privacy Guide

This application handles student identity, enrollment, feedback, and private
teacher responses. Privacy behavior is a product invariant, not a cosmetic UI
detail.

## Threats that shape the design

1. **Wrong account match:** a name-based match can bind a university account to
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

- Account matching produces candidates; teacher confirmation is required under
  the current MVP policy.
- Student access requires a confirmed match plus active enrollment.
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

- [account-matching.md](account-matching.md)
- [roles-and-permissions.md](roles-and-permissions.md)
- [public-qa-and-source-linking.md](public-qa-and-source-linking.md)
- [participation-rules.md](participation-rules.md)
- [ai-future-plan.md](ai-future-plan.md)
