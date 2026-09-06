# End-to-end validation — 2026-09-06

The core reading-to-writing workflow was exercised in production using the signed-in account, public LED inscriptions, and one successful paid GLM request. The issues found below were fixed and deployed. This is software workflow validation, not expert validation of a historical interpretation or a claim that every product integration has been retested.

## Production workflow

The validation project and its account-specific export are private; this report contains only the public-source procedure and observed results.

1. Created a clearly labelled software-validation research project through the UI.
2. Imported 40 public LED inscription samples with their provenance and rights metadata.
3. Searched for `parentes`, opened HD010004, and saved `parentes filio dulcissimo` as evidence tied to an immutable source version, page 1.
4. Submitted a source-grounded question. The initial attempt stopped at the budget gate before a model call. Set this test project's budget to $0.02 and created a new execution attempt.
5. One GLM request completed; the application recorded approximately $0.0003. This is the application's usage record, not an independently reconciled provider invoice.
6. Followed the answer's citation to the fixed original page and returned to the research task.
7. Completed the human review step with a rewritten, explicitly provisional interpretation. Accepted the final artifact only as a software acceptance fixture, with the lack of expert historical review stated in the artifact itself.
8. Converted the final artifact to a note, saved it, reloaded the note list, and reopened version 1: **LED 阅读验收 · parentes 的解释与限制**.
9. Downloaded Markdown and Word through the UI. Inspected the actual Word archive before and after the export fix: the original download had zero footnote references; the post-deployment download has two real Word footnote references, source bibliography, fixed version/page links, and the human review caveat.
10. Downloaded the project archive with originals. All 41 manifest entries passed checksum validation; the archive contains 40 originals. Passed this exact downloaded archive through the actual backup reader and project restoration engine in isolated Miniflare.

## Fixes shipped

| Observed problem                                                         | Resulting behavior                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First sample import remained on an indefinite preparing message.         | Both entry points import in batches of four and show completed records out of 40. Failure stops further requests; a user restart skips previously imported records.                                                                                                          |
| Forty materials stretched the reading page and hid the selected item.    | The source list scrolls independently, preserves its search/filter controls, and reveals the selected material on selection and container resize.                                                                                                                            |
| Opening budget settings interrupted a question about a specific passage. | A return action preserves the original version, page and annotation URL; a local browser round-trip confirmed the unsent discussion draft survived.                                                                                                                          |
| A budget-blocked request still announced that the assistant was reading. | Submission acknowledgement is separated from actual task execution status.                                                                                                                                                                                                   |
| Artifact-to-note source links silently disappeared as footnotes in Word. | Fixed-page links resolve against the authenticated project's saved pages and become source footnotes in rich Word, Markdown Word and print output. Missing or foreign references cannot silently become valid citations. A page reference does not invent a saved quotation. |
| Export controls disabled without a clear explanation.                    | An accessible progress message explains that citations and the export are being prepared.                                                                                                                                                                                    |

## Verification

- Full suite: **169 passed, 0 failed, 0 skipped**.
- Actual newly downloaded backup restore: **1 passed, 0 failed, 0 skipped**.
- TypeScript, lint and Cloudflare production build passed.
- Local UI: new batched import completed with 40 records; budget-to-reader return retained the fixed passage and an unsent draft. The temporary draft was cleared after verification.
- Responsive reading check at 390 × 844: document width remained 390, the material list was bounded to 160 pixels, and the selected source was fully inside that scroll container after resize. The test viewport was reset afterward.
- Deployed production reading check: the 40-item list is bounded to 640 pixels rather than its roughly 3,006-pixel content height.
- Actual post-deployment Word download: 2,848 bytes, two footnote references, historical-review caveat preserved. Both links in this note refer to the same source page, so they produce two footnote occurrences.
- Main Worker deployed version: `9d07e487-2f4c-4162-a4f4-6d6337695337`. No new cloud resources or database migration were required; the background Worker was unchanged.

Detailed local logs and the downloaded validation archive are under ignored `work/e2e-september6/`. No model keys, login credentials, or private account exports belong in this report or Git.

## Scope limits

This pass used an existing authenticated session and text inscriptions. Fresh-account OAuth consent, Google Drive's external picker, image/PDF OCR accuracy, multi-user invitation delivery and simultaneous editing were not newly exercised end to end. The archive was downloaded in the browser and restored through the actual engine; its browser upload/file-picker path was not retested. Automated tests cover additional behaviors but do not substitute for these external browser flows or historian review.

The validated core workflow is usable for a supervised alpha: import, find, cite, ask, review, write and take the research away. Broader production readiness still requires the integration-specific checks above and feedback from researchers using their own materials.
