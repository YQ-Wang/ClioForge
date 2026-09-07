# Adams correspondence: continued production trial

September 7, 2026, Pacific time. This trial continued the existing Adams project from [the September 6 pilots](research-pilots-2026-09-06.md), using the authorized account in Chrome and its existing OpenRouter connection. It did not create a clean demonstration project to hide earlier failures.

## Productivity assessment

Canwoo provided a useful connected workspace for supervised reading, evidence organization, bibliographic work and a defensible working note. It did **not** demonstrate reliable AI acceleration in this run: all three new GLM 5.3 Flash calls timed out without a usable answer, including a single-source, approximately 60-character request. The completed research synthesis was written by the trial operator, not produced by those failed calls.

This is an operational trial by an AI coding assistant, not independent historical scholarship or a historian-led usability study. There was no timed comparison with an established workflow. No percentage speedup, historical novelty or readiness for unattended research is claimed.

## Question and sources

The continued question was how legal protection, representation language, voting qualifications and a proposed petition differ across the correspondence. The original three sources remain:

- [Abigail Adams to John Adams, March 31–April 5, 1776](https://founders.archives.gov/documents/Adams/04-01-02-0241).
- [John Adams to Abigail Adams, April 14, 1776](https://founders.archives.gov/documents/Adams/04-01-02-0248).
- [Abigail Adams to Mercy Otis Warren, April 27, 1776](https://founders.archives.gov/documents/Adams/04-01-02-0257).

Two explicitly labelled excerpts were imported through the real file chooser:

- [Abigail Adams to John Adams, May 7–9, 1776](https://founders.archives.gov/documents/Adams/04-01-02-0259): selected paragraphs from the May 7 portion.
- [John Adams to James Sullivan, May 26, 1776](https://founders.archives.gov/documents/Adams/06-04-02-0091): selected paragraphs on consent and voting qualifications.

Import notes retain canonical URLs, editorial boundaries, omitted context and the distinction between public-domain historical text and modern editorial material. These files are transcriptions/excerpts, not manuscript facsimiles. Their one-page file layout is not original historical pagination.

The working note distinguishes a criticism of a husband's absolute power from a complete electoral program; John's warning about changes to voter qualifications from an endorsement of women's voting; and the intention to petition from evidence of submission. It also records that the selected letters cannot establish that a petition was never submitted, or that the May 26 letter was caused by Abigail's May 7 letter. The Warren letter's retelling of John's reply is not independent corroboration.

## Live coverage and retained outputs

| Area                      | What was actually exercised                                                                                  | Result                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Authentication            | Existing Google login and return to the requested project                                                    | Passed                                                                                                       |
| Import and reading        | Two text files uploaded, five sources read, fixed-version/page navigation                                    | Passed                                                                                                       |
| Search                    | `petition \| Vote`, two matching pages, return from a result to the Warren letter                            | Passed                                                                                                       |
| Parallel reader           | Opened two existing sources together and inspected version/page controls                                     | Open/read verified; selection-to-note not completed                                                          |
| Evidence                  | Three exact excerpts with interpretation and support/challenge/context relationships                         | Saved and reopened                                                                                           |
| Evidence management       | Relationship filter, question/source matrix, select-all and CSV export                                       | Three exported records retained source and version identifiers                                               |
| Bibliography              | Manual entry, four-record CSL import, editing to associate all five originals, Chicago footnote, CSL export  | Passed after repairing standard CSL type support; structured author/date fields survived editing             |
| Writing                   | Evidence-to-note, find/replace, a useful 3-column comparison table, preview, save/reopen, version comparison | Two versions of the new note retained; three source links preserved                                          |
| Note management           | Pinning the new note and locating it in the project library                                                  | Passed                                                                                                       |
| Argument organization     | Research question, one provisional claim, link to its supporting saved excerpt                               | Passed; left as awaiting historical review                                                                   |
| AI comparison             | Five-source comparison, narrower follow-up, then one-source comparison                                       | **0/3 usable results; response timeouts**                                                                    |
| Deterministic research    | Phrase search, counts, textual comparison, citation checks, review and compilation                           | Completed with no model calls                                                                                |
| Correction cycle          | Reject irrelevant page-prefix excerpts, rerun search, invalidate downstream results, rerun comparison/checks | Passed after fixing the search excerpt selection; old attempts and rejection rationale retained              |
| Work assignment and board | Assign review to the signed-in account, keyboard-open the move menu, move to in-progress, submit and accept  | Saved successfully; pointer drag was not independently completed in this trial                               |
| Workflow visualization    | List, board and dependency graph with running, blocked and review states                                     | Inspected live                                                                                               |
| Research findings         | Accept bounded review text and the compiled result; reopen from the findings list                            | Passed; intermediate accepted records remain distinguishable by step                                         |
| Google Drive              | Existing connection and native Google Picker opened; cancelled without importing unrelated files             | Connection/picker verified; Drive import not exercised in this case                                          |
| Downloads                 | CSV, CSL JSON, Markdown, rich Word and complete ZIP                                                          | Actual files downloaded; explicit prepared-file links repair recovery when automatic downloads do not appear |
| Backup integrity          | Five originals plus project metadata and manifest                                                            | Six payload checksums and lengths verified; real archive used by isolated restore regression                 |

The new note is titled **1776 五信续读 · 法律保护、代表权与请愿边界**. It contains the comparison table, three evidence excerpts, fixed-version links and an explicitly provisional conclusion. The completed deterministic plan is **三条关键措辞 · 固定版本复核**. These are useful retained outputs, not empty test scaffolding.

Word inspection found one table and three real footnote references. Markdown retains the table and three absolute Canwoo source links. Links remain subject to project access controls. The ZIP contains five original text files and the project records, including note versions, claims, bibliography, task attempts and review decisions. Local trial exports are ignored by Git; account details, private project identifiers and credentials are not published in this report.

## Corrections driven by this trial

1. Accept standard CSL types such as `personal_communication`, while preserving legacy `letter` entries and exporting them with the standard type. Import errors now identify the problematic row/field. Less common imported types survive editing.
2. Keep the essential bibliography fields visible and group optional publication/archive fields. Existing records remain fully editable.
3. Give findings research-plan context and a summary, with project-scoped access checks. Label an active plan as started rather than implying a model is currently running.
4. Resolve internal source links to the current site on Markdown download, without changing stored notes or literal code examples.
5. Cite the matching search snippet and its exact source offset rather than the first characters of a page. The same repair applies to project-source discovery candidates.
6. Avoid recording verification checks twice and stop numbering arbitrary checks as though they were citation numbers.
7. Keep an explicit, reusable download link for prepared Word files and project archives. Do not claim that file generation proves successful browser download.
8. Keep Canwoo file-page numbers out of Chicago's original-page locator. Exported notes identify them explicitly as file pages alongside the immutable version.

Application and background-worker fixes were deployed to the existing Cloudflare resources; no migration, new service or subscription was required.

## Cost and validation boundaries

The three model calls each reached a response timeout after approximately 90 seconds of server execution. Their retained budget reservations total **$0.014117**. This is not a confirmed provider charge. No usage result was available to settle them, and no automatic retries were performed. The later keyword workflow made no model calls. Provider billing was not independently reconciled.

The full regression suite passed **215 tests, zero failures and zero skips**, using this trial's newly downloaded archive for the isolated restore test. TypeScript, lint and the English-comment policy passed. Focused Word tests cover tables, native formula/image export, source footnotes, invalid references and the distinction between file-page and original-page locators. These checks complement, rather than replace, the live observations above.

## Remaining work before a stronger productivity claim

1. **Model reliability is the priority.** Diagnose routing/latency with provider identifiers and confirmed usage, then benchmark a short representative workload before changing defaults. A larger timeout or repeated paid attempts is not evidence of a solution.
2. The two-source follow-up narrowed the prompt but retained its original five-source context. Let researchers explicitly narrow inherited sources, with a visible scope summary, instead of relying on prose to reduce the workload.
3. The findings list still exposes intermediate accepted steps alongside compiled reports. Improve this distinction and shorten long follow-up titles without discarding the research history.
4. Keep historical text, preparation notes and bibliographic metadata distinct when importing. Text searches over a transcription file also search its preparation notes; counts must not be presented as a historical corpus statistic without inspecting what was counted.
5. Run a historian-led comparison measuring time to usable evidence, erroneous inferences caught, corrections required, citation recovery and time to an exportable note.

Fresh OCR, new source annotations, semantic indexing, scheduled external discovery, external-agent execution, new collaborator invitations/removals, simultaneous multi-user editing, and Zotero account import were not exercised end to end in this case. Relevant automated checks and earlier pilots exist, but they do not establish new live coverage here. The text-letter case did not justify adding artificial OCR or math exercises solely to increase a feature count.

The appropriate release description remains **a supervised research alpha with practical organization and traceability value**. Reliable automated humanities research at scale has not yet been established.
