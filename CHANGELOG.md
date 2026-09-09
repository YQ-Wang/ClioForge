# Changelog

## Unreleased

- Retire the maintainer-operated website and background research service. The retired domain returns HTTP 410; search removal was requested separately.
- Make self-hosting the primary setup: direct workspace entry, no search indexing or canonical links to a shared service, and per-installation administrator contact.
- Remove hosted-service links from setup documentation and package metadata. Preserve research features, existing data formats and user-provided model credentials.

- Add server-rendered public research pages, a source-verified Adams walkthrough with attributed downloads, and an introductory workflow guide. Keep the bundled examples and guide available to self-hosted installations, with indexing disabled and no shared-service canonical URLs.
- Keep public-page browser titles intact when switching languages instead of replacing them with the workspace title.

- Pin Miniflare’s Sharp dependency to 0.35.4 to include the libheif security fixes (GHSA-rgj7-g3m4-5g8c).

- Rename the public project to ClioForge 参伍, update the wordmark and download names, and add ClioForge deployment configuration aliases while preserving existing data, file formats and live service addresses.

- Simplify document import with localized file-selection buttons shared by writing, replay, archive manifests and backup restore; improve import errors, keyboard disclosures and narrow-screen editor controls.
- Preserve researcher-edited citation bindings when assembling findings; remap each contribution's references before combining reports.
- Remove unused draft citations from explicitly cited human reviews, retain legacy uncited context, and clarify the final acceptance and save-to-findings step.
- Resolve bare repeated passage labels only when the model already selected that exact passage explicitly; reject ambiguous or unselected labels.
- Add bounded research investigations with persisted search/read/finish operations, long-page continuation, exact passage citations and a final researcher-review gate.
- Export research execution traces and validate source quotations, dependency graphs, tool decisions and ledger continuity offline without new model calls.
- Recover confirmed saved answers after local delivery or output-validation failures without repeating paid requests; retain provider-stage diagnostics and uncertain reservations.
- Version reusable research methods, preserve caveats in bounded follow-up context, and show manual evaluation evidence when choosing exploration and synthesis models.
- Append migration `0022_research_harness.sql` for optional model diagnostics and task failure stages; apply it before upgrading both workers.
- Reject malformed collection pages and invalid continuation cursors before they can loop or expose a partial collection as complete.
- Run a frozen, synthetic v1 backup compatibility test by default, without a private account export.
- Enforce append-only database migrations in CI, including unique migration numbering and unchanged existing SQL.
- Audit the dependency lockfile on dependency changes and weekly; document release checks and vulnerability triage.

## 0.1.0-alpha.2

- Restore the original Latin wordmark from `8338c9b`, retaining the Qiji Chinese lettering and fan; use a colon in both browser-tab titles.
- Repair third-party notice formatting so the repository-wide CI format check passes.
- Make workspace breadcrumbs navigable and improve research draft recovery and selected-region transcription.
- Accept standard CSL bibliography types, preserve imported metadata, and show research-plan context in findings.
- Cite matching source passages in automated research, avoid duplicate citation checks, and retain rejection and rerun history.
- Preserve absolute source links in Markdown exports, provide reusable Word and backup download links, and distinguish file pagination from original historical pagination in footnotes.
- Document continued production trials using the Adams correspondence. The release remains alpha: three GLM 5.3 Flash calls timed out in the latest trial, and reliable automated research has not been established.

## 0.1.0-alpha.1

Initial public alpha of Canwoo, including the private research workspace, source reading and annotations, versioned evidence and writing, project collaboration, research task board and bounded AI workflows.

This release adds open-source licensing and attribution, English contributor documentation, independent local and deployment configurations, automated CI and secret scanning. It also includes the current brand artwork and the writing, annotation and recovery improvements developed before publication.

The release remains alpha. Read the limitations in the README and validate your own deployment and research workflows before relying on it for important material.
