# Deployment and Release Guide

**Status:** [Recommended] deployment contract for the current implementation
baseline. Production automation is not implemented yet.  
**Owner:** technical owner.  
**Update when:** hosting, environment variables, migration flow, scheduler
execution, OAuth configuration, backup/retention, or release checks change.

## Current delivery state

The repository is ready for local development and a controlled pilot
deployment, but it does not contain production deployment automation.

Current runtime assumptions:

- one Next.js modular-monolith application;
- one PostgreSQL database;
- Auth.js Google OAuth restricted to approved university domains;
- a database-backed reconciliation poller for cycle transitions and scheduled
  publication;
- no pg-boss, Redis, message broker, microservice, or vector database;
- Docker Compose is the local development baseline;
- production hosting provider, domain, secret manager, and backup service are
  [Open].

Do not treat a successful local npm run build as evidence of production
readiness.

## Local deployment

Follow [DEVELOPMENT.md](DEVELOPMENT.md) for the canonical local setup. The
minimum local sequence is:

1. copy and fill .env;
2. start PostgreSQL with Docker Compose;
3. apply Drizzle migrations;
4. seed only a local development database;
5. start Next.js;
6. run the scheduler separately when testing cycle or scheduled-publication
   transitions.

Never use real student data in local seed data, screenshots, tests, or
committed environment files.

## Pilot deployment checklist

Before exposing a pilot section:

- [ ] choose a supported Node.js runtime and hosting environment;
- [ ] provision PostgreSQL with encrypted storage and restricted network access;
- [ ] configure DATABASE_URL and run reviewed Drizzle migrations;
- [ ] set a strong AUTH_SECRET;
- [ ] configure Google OAuth redirect URIs for the deployed origin;
- [ ] set ALLOWED_EMAIL_DOMAINS to the institution’s approved domains;
- [ ] set INSTITUTION_TIMEZONE explicitly;
- [ ] set a protected SCHEDULER_SECRET;
- [ ] keep DEV_AUTH_ENABLED unset or false;
- [ ] run the scheduler through a controlled process or authenticated cron;
- [ ] configure HTTPS, secure cookies, and platform secret storage;
- [ ] confirm staff role grants and section-level permissions;
- [ ] verify class-only Q&A access with an enrolled student and a non-enrolled
      account;
- [ ] verify that public Q&A contains no source identity or private wording;
- [ ] verify database backups and a restore test;
- [ ] define retention and deactivated-student access before real use;
- [ ] record the deployment decision in docs/decisions/.

## Release sequence

For a release that changes application code or schema:

1. review the diff and relevant owning documents;
2. run npm run lint;
3. run npm run typecheck;
4. run npm test;
5. run integration tests against the test PostgreSQL database;
6. run npm run build;
7. review migration SQL and backup status;
8. deploy the application artifact;
9. apply migrations using the platform’s controlled release step;
10. start or verify the scheduler;
11. exercise sign-in, section access, student submission, staff review, and
    section-scoped Q&A;
12. record the release and any limitations.

The application must not start with a production-only dev-login fallback. The
provider is designed to be absent when NODE_ENV=production; preserve that
invariant.

## Rollback and recovery

The rollback procedure is currently [Open] because the hosting provider and
migration policy are not selected. Before pilot launch, define:

- application artifact rollback;
- backward-compatible migration policy;
- database restore owner and recovery point objective;
- scheduler pause/restart behavior;
- failed scheduled-publication retry procedure;
- incident and privacy-breach escalation contacts.

Do not roll back a schema migration by editing production tables manually.
Prefer forward-compatible migrations and a tested restore path.

## Open deployment decisions

- hosting provider and region;
- production/staging environment separation;
- secret manager;
- backup retention and restore frequency;
- scheduler process/cron owner;
- log and audit retention;
- deployment approval process;
- deactivated-student and end-of-semester retention behavior.

These decisions are tracked with the product questions in
[open-decisions.md](open-decisions.md). They do not block local UI work, but
they block a real student pilot.
