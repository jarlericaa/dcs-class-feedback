# Platform Admin authentication

Platform Admins are a separate username/password principal stored in
`platform_admin_accounts`. They do not have an email address, Google subject, or
corresponding row in `users`. The historical `users.is_platform_admin` column is
retained only as inert migration compatibility data and is not an authorization
path.

## Safe rollout

1. Apply the Drizzle migrations, including `0011_platform_admin_identity` and
   `0012_audit_actor_invariant`.
2. Before switching the running app, create at least one credential-backed admin
   on the server with `npm run admin:create`. Password input is interactive and
   is not placed in source control or command history.
3. Verify that the new username/password signs in and reaches `/admin`.
4. Verify that a Google-authenticated user cannot open `/admin`.
5. Only then remove any old email-backed admin access from operational fixtures.

To change a password, run `npm run admin:password` and enter the username and
new password interactively. There is no email password-recovery path.

The optional `DEV_PLATFORM_ADMIN_PASSWORD` environment variable is intended for
explicit local development seeding only; it is not a production default and is
never committed.
