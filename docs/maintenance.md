# Maintenance and releases

Canwoo remains public alpha. The checks below make changes reviewable and
repeatable; they do not certify historical accuracy, institutional compliance or
the security of an independently configured installation.

## Required verification

Use the Node version in `.nvmrc` and install with `npm ci`. CI and contributors
run the same commands:

```sh
npm run check
npm run format:check
npm test
npm run build:cloudflare
npm run check:jobs
```

For database changes, fetch the target branch and run
`npm run check:migrations -- origin/main`. The guard compares SQL against that
revision and inspects the current working tree, including uncommitted files.
Existing SQL must remain byte-for-byte unchanged. Add a uniquely numbered
migration after the latest one. Rebase and renumber an unpublished migration if
another change has taken its number. Do not renumber a migration already merged
to main or applied to a deployment.

The integration suite applies all migrations to a local database, exercises
authorization and recovery, and restores a frozen synthetic backup. This is not
a substitute for checking a new migration against representative existing data.
For changes to stored records, rehearse the upgrade and backup restore in an
isolated installation. Keep earlier format fixtures when adding new formats.

## Dependency changes

Run `npm run audit:dependencies` against the committed lockfile. The separate
Dependency audit workflow runs on dependency changes, weekly, and on manual
dispatch. It reads the lockfile without executing package installation scripts;
moderate and higher findings fail. Registry outages also fail rather than being
reported as a clean audit. Dependabot proposes updates; updates are not merged
automatically.

For an advisory, identify the dependency path and affected runtime or tooling.
Prefer the smallest compatible fix and rerun the relevant tests and builds.
Document a temporary override, its reason and removal condition in SECURITY.md.
Do not run `npm audit fix --force` as an unreviewed release step. If no compatible
fix is available, describe the exposure and mitigation explicitly; do not label
the audit clean or silently raise the threshold.

## Release procedure

1. Review the complete changes since the previous tag, update CHANGELOG.md, and
   ensure README limitations and configuration instructions remain accurate.
2. Update the version in package.json and package-lock.json together. Install
   with `npm ci` and complete the checks above against the intended revision.
3. Confirm the exact release commit has successful CI, dependency audit and
   full-history secret scanning. If the dependency workflow did not run for that
   commit, dispatch it manually against that revision's branch.
4. For user-facing changes, exercise the affected workflow with synthetic or
   openly licensed data. Include Chinese/English, keyboard use, narrow screens,
   light/dark appearance and refresh/recovery where relevant. Separate provider
   failures from application failures and list untested integrations.
5. For a hosted deployment, use the private configuration and follow the
   [deployment guide](deployment.md). Record the commit, Worker versions,
   migration requirements and smoke-test outcome. A failed database upgrade
   needs its own recovery plan; rolling back a Worker does not undo SQL.
6. Create a version tag and GitHub release on the verified commit. Summarize
   changes, compatibility, operator actions and known limitations. Publish only
   reviewed source or artifacts; exclude environment files, local deployments,
   credentials, account exports and private screenshots.

A green build is necessary, but not evidence that an AI-generated interpretation
is correct or that unattended research is validated. Keep those claims separate
from software release notes.
