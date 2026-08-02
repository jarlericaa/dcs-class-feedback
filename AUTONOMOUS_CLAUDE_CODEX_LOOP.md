# Autonomous Claude → Codex GitHub Loop

This runbook makes implementation and review unattended:

    Claude implements or repairs a PR
        → Codex reviews the PR
        → a guarded GitHub Action asks Claude to fix concrete findings
        → the action pushes a proper commit
        → the action comments @codex review
        → repeat, with a finite round limit

The loop is intentionally finite and does not auto-merge or deploy. Keep the
merge gate protected until the first few runs prove that the prompts,
permissions, and reviewer identity are correct.

## What each system does

Codex is the reviewer. Its GitHub integration can review a newly opened pull
request automatically, follows repository guidance such as AGENTS.md, and
can be invoked explicitly by commenting @codex review. The exact reviewer
login is installation-specific, so discover it from a test PR instead of
hard-coding a bot name.

Claude Code is the implementer/repair agent. The workflow uses the official
anthropics/claude-code-action@v1, an ANTHROPIC_API_KEY repository secret,
and the full-stack prompt in
[prompts/CLAUDE_AUTONOMOUS_FULLSTACK_IMPLEMENTATION_PROMPT.md](prompts/CLAUDE_AUTONOMOUS_FULLSTACK_IMPLEMENTATION_PROMPT.md).

The disabled workflow template is
[automation/claude-codex-repair-loop.yml](automation/claude-codex-repair-loop.yml).
Copy it into .github/workflows/ only after the setup below.

## One-time setup

### 1. Connect Codex to GitHub

In Codex Cloud, connect the repository and open Settings → Code review:

1. enable Code review;
2. enable Automatic reviews if you want Codex to review newly opened PRs;
3. create a small test PR and comment @codex review;
4. inspect the submitted review and record the exact reviewer login.

Create this repository Actions variable:

    CODEX_REVIEWER_LOGIN=<the exact login shown on the test review>

Automatic review is most useful for the first review of a PR. The explicit
@codex review comment in the repair workflow makes re-review after a Claude
push deterministic. If your Codex configuration already reviews every
subsequent push, remove the explicit mention from the template to avoid
duplicate reviews.

### 2. Enable Claude Code in GitHub Actions

Use the official Claude Code GitHub setup flow or add the action manually:

1. Install/enable the Claude GitHub App for this repository, or use the
   anthropics/claude-code-action@v1 workflow.
2. Give the app/workflow only the repository access it needs: Contents,
   Issues, and Pull requests read/write.
3. Add an Actions secret named ANTHROPIC_API_KEY.
4. Add an Actions variable named CLAUDE_MODEL containing the exact Claude
   model identifier available in your account. Use the Opus 5 identifier if
   your account exposes it; do not guess a model slug. If your organization
   manages the model selection elsewhere, remove the --model argument from
   the copied template and verify the resulting default before unattended use.
5. Copy docs/automation/claude-codex-repair-loop.yml to
   .github/workflows/claude-codex-repair-loop.yml and commit that workflow
   in the default branch.

Never put an API key in YAML, prompts, commits, issue comments, or repository
variables. Do not run the write-capable job for fork pull requests. The
template checks that the PR head repository is the same repository before it
can expose the Claude secret or push changes.

### 3. Set repository protection

Protect the default branch:

- require pull requests;
- require the project’s lint, typecheck, test, build, and integration checks
  that are available in CI;
- require at least one human approval for the first production pilot;
- disallow force-pushes and direct pushes;
- do not grant the Claude workflow permission to merge or deploy.

The implementation/review loop can be unattended without making production
release decisions unattended.

## The finite repair loop

The template listens for a submitted pull-request review, then checks:

- the review state is commented;
- the reviewer login equals CODEX_REVIEWER_LOGIN;
- the PR comes from the same repository;
- fewer than three Claude repair rounds have been recorded.

It then checks out the PR branch, runs Claude with the full-stack repository
rules, runs the project checks, and asks Claude to commit only a concrete fix.
The workflow uses proper Conventional Commits and forbids
Co-authored-by:/agent signatures. After a successful Claude run, the
workflow posts a hidden round marker and, only if a new commit exists,
@codex review. When the marker count reaches three, the workflow stops and
leaves the PR for human diagnosis rather than looping forever.

If you need a different limit, change maxRounds = 3 in the template and
update the runbook. Keep the limit small while testing.

## First test procedure

1. Open a test PR with a harmless, reviewable change.
2. Confirm that Codex can review it.
3. Set CODEX_REVIEWER_LOGIN from the actual review author.
4. Temporarily use a low repair limit, such as one round.
5. Submit a Codex review containing a real, small finding.
6. Confirm that the Claude workflow starts, changes only the PR branch, runs
   checks, creates a commit, and posts the round marker.
7. Confirm that Codex receives the @codex review comment and reviews the new
   commit.
8. Confirm that a no-op/no-finding round does not create a no-op commit.
9. Turn on the normal maximum of three rounds and test a second PR.

Inspect every generated commit and comment during these tests. After the
workflow is trusted, normal implementation can run unattended using the
full-stack prompt, but keep branch protection and production deployment
human-gated.

## Commit standard used by both agents

Use:

    <type>(<scope>): <imperative summary>

Good examples:

    chore(ci): remove obsolete CI workflow
    feat(student): add pages for student endpoints
    fix(authz): enforce section scope on Q&A reads
    test(review): cover private/public response visibility

The shorthand examples requested for this project are chore: remove ci and
add: pages for student endpoints. The preferred normalized forms are
chore(ci): remove obsolete CI workflow and
feat(student): add pages for student endpoints. Never add a Co-authored-by:
trailer, “Generated by Claude” line, bot/agent signature, or other
co-authorship marker.

## When the loop should stop for a human

The agents may continue without routine supervision, but they must leave the
PR for human direction when a finding requires:

- a change to a confirmed privacy or role rule;
- destructive data migration or deletion;
- production credentials or an external account action;
- a new infrastructure/service boundary;
- a product decision listed as required before the pilot;
- more than three repair rounds;
- contradictory or mutually exclusive review comments.

The remaining owner questions are documented in docs/open-decisions.md.
They do not block local implementation of the safe student/teacher loop, but
they do need answers before real student data or production launch.

## Official references

- [Codex code review in GitHub](https://learn.chatgpt.com/docs/third-party/github)
- [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode.md)
- [Claude Code GitHub Actions](https://code.claude.com/docs/en/github-actions)
- [Claude Code permission modes](https://code.claude.com/docs/en/permission-modes)
