# People, source relationships and spelling search: production validation

This trial continues the existing five-letter Adams project from the [annotation and follow-up trial](adams-harness-validation-2026-09-07.md). It uses imported transcriptions with their original source links; these are not manuscript facsimiles. No model call is needed for this work.

## Defects and changes

- The old keyword search returned no pages for `adam`, although the project contained five pages mentioning `Adams`. The source search now enables similar Latin spellings by default, using bounded word prefixes and a terminal-s variant. Exact words and saved alias matches precede approximate matches; approximate results are labelled. Researchers can disable approximate matching. Short terms and Chinese queries are not automatically expanded by the Latin rule. This is not arbitrary typo correction or identity resolution.
- Automatic research tasks retain exact retrieval by default. The approximate mode must be explicitly requested at the search API, so word counts and fixed research scopes are not silently changed.
- Snippets now map normalized text back to its original positions. Heavy whitespace, combining accents and ligatures no longer shift the excerpt away from the matching passage. Returned snippets remain continuous original text.
- Live alias testing exposed another snippet issue: a `Portia` query displayed the earlier `Abigail Adams` header instead of the requested name. Snippets now prefer the user's wording over expanded aliases when it occurs on the page. The search page explains that editorial notes can also produce matches and that a match does not establish authorship.
- New historical entries now save the creation reason in the same database transaction. Previously the form required a reason but the create path discarded it. Older entries are not given invented creation reasons; later edits retain their explicit revision reasons.
- Entry cards expose supporting source names, links and a readable history of creation, revisions and identity grouping. Dates are labelled as source-supported ranges, with their meaning explained by the researcher. Empty name searches show a useful message. The entry form uses the shared select components.
- Source-relation cards link both materials and provide an explicit action to revise the basis or review status. The link opens the current material version; a source relationship is not a new immutable page citation. New relation forms start with two different documents, and read-only members cannot submit changes.

## Historical checks

The May 7 Abigail letter identifies its sender and criticizes absolute power over wives. The April 27 letter to Warren is attributed to Abigail and ends with the signature **Portia**. It also retells John's response to her proposed code of laws. The April 14 John letter contains the corresponding laughter, disobedience and “coarse a Compliment” language. Recording the April 27 letter as depending on the April 14 response prevents treating that retelling as independent corroboration.

The identity and relationship judgments in this trial are operator-reviewed working records, not independent historian verification. A matching surname does not merge Abigail and John, and page counts include the supplied transcription files' editorial preparation notes.

## Live browser validation

- Created separate Abigail Adams and John Adams records. Added Portia to Abigail after reading the Warren letter's signature and attribution. Verified her saved revision reason and John's saved creation reason, together with their original-page links. The early Abigail creation predated the reason-persistence fix; its missing initial reason was not backfilled.
- The people filter returned both people for `adam`, only Abigail for `Portia`, and a helpful empty result for an unknown name.
- Source search returned five pages for `adam` with similar spellings enabled and zero with that mode disabled. Each approximate result carried its spelling label. After reviewing the Portia alias, that query also returned five pages, including a preparation note that explicitly says Sullivan, not Abigail, was the recipient. This is useful discovery, not five authorship claims.
- Recorded the Warren letter's dependence on John's April 14 response. Reopened the relationship, verified its prefilled materials and basis, changed the review status and reasoning, and confirmed that only one relationship remained. The linked source opened the April 14 letter on page one.
- Saved a search log with the five-transcription scope, observed counts, exact versus approximate comparison and editorial-text limitations. Verified its persisted display.

Merge/unmerge, permission denial and historical-version restrictions were covered by automated regressions in this pass, not exercised by making artificial identity changes in the live research project. No model request, subscription change or extra infrastructure was needed.

## Automated validation

The complete suite passed **222 tests, no failures or skips**, including restore from the existing project archive. Focused tests cover exact-before-approximate ordering, pagination without duplicate pages, `adam`/`adams` in both directions, latest versus pinned historical versions, page and project restrictions, normalized-to-original snippet offsets, saved creation reasons, reviewer permissions, merge cycles and reversible grouping. TypeScript, lint, formatting, the Cloudflare app build and research-worker dry run passed.
