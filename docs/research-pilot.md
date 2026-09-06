# Canwoo real-account research pilot — 2026-09-05

## Question and material boundary

How do the preliminary (1862) and final (1863) Emancipation Proclamations delimit time, territory and execution? This is a software acceptance exercise on public historical material. It does not establish research time savings, scholarly originality or historical validity.

The owner's real Canwoo account contains the project **解放宣言的适用范围 · 公开史料研究** (`66aadf17-d517-45ee-aa69-d12d845c735b`). Its notes are available at [the project](https://canwoo.com/?project=66aadf17-d517-45ee-aa69-d12d845c735b&tab=notes), subject to project permissions.

| Material | Origin | Saved input |
| --- | --- | --- |
| Preliminary proclamation and accompanying material | [Library of Congress](https://www.loc.gov/resource/mal.1859300/) | Five-page PDF transcription; source version `f84d8a45-a769-48e1-a0f2-25a98e575473` |
| Final proclamation | [Library of Congress](https://www.loc.gov/resource/lprbscsm.scsm1031/) | Two-page PDF transcription; source version `c2ee4bfe-7dc3-4c6a-833a-575330c765cb` |

These are LOC-generated text transcriptions, not manuscript image scans. The first PDF includes Seward's covering letter and editorial notes; they must not be attributed indiscriminately to Lincoln. The date in a bibliography identifies the proclamation, not necessarily the printing date of the preserved edition. Two additional project files came from Google Drive connector testing and duplicate the final proclamation. One exposed the metadata-version bug below. They are retained test records, not independent evidence; the project has four files but two distinct historical texts.

## Observed end-to-end behavior

1. Imported both public PDFs through the real browser and saved immutable, page-addressable source versions. Added two source-linked bibliography records without inventing missing catalog metadata.
2. Created the four-step plan **两份解放宣言的时间、地域与执行条件**: model comparison → exact quotation verification → review → final report. The existing graph presents persisted task and review states.
3. Used the owner's encrypted OpenRouter connection with fixed model `z-ai/glm-5.3-flash`, high effort for comparison and a $0.10 project background budget. This does not authorize spending the entire $10 provider balance.
4. After the failures described below were repaired, all five quotations matched fixed source versions and pages. Opened a quotation in the original reader and checked the page and version.
5. Corrected the candidate's citation-number error, its treatment of editorial material and an unsupported colonization-clause description. Review was performed by Codex for software acceptance, explicitly not by a professional historian. The final report uses the edited review text while retaining the model candidate in its dependency history.
6. Saved the reviewed report to a pinned project note. Reload confirmed the persisted item. Saved a second note with the material inventory, duplicate warning and next research questions.
7. Connected Google Drive through two owner-controlled Google accounts, returning to the same Canwoo project. Uploaded one public PDF to the owner's Drive with the connector, selected only that file in Picker and imported it successfully. No private Drive file was selected or processed. Restricted Picker key, API activation, branding URLs and test users are configured. Google OAuth remains Testing pending explicit approval to publish to all Google users.
8. Ran one low-effort OCR call on page 2 of the clear final-proclamation PDF. The candidate was displayed without replacing the saved original. This validates image transport and review behavior, not historical handwriting recognition or character accuracy.
9. Local browser checks covered independent note drafts, close/resume/reload/save, counts, search, pinning, archive/undo and Chinese/English layouts at desktop and 390 px. Batch selection of two PDFs completed with both marked ready. Existing 40-record LED project data was preserved.
10. After the Drive deduplication fix, re-selected and imported the same public PDF in production. The UI reported “新增 0 份，1 份已在项目中，未重复保存”; the source count remained four. “Read imported sources” opened the correct Drive PDF. Reload also confirmed two note items, with the material inventory at v2, and the research plan showed all four steps completed or accepted.

## Real failures and resulting fixes

| Observed problem | Change and validation |
| --- | --- |
| Cloudflare workerd rejected Fetch `redirect: 'error'` before contacting the model | Use `manual`, reject non-success status, and never follow redirects with credentials. Added a real Miniflare/native-Fetch test, including a redirect that must not reach its target. Applied to provider, Drive and watch adapters. |
| PDF spaces and line wraps caused valid-looking quotations to fail | Align only a unique same-page match under whitespace normalization; preserve all letters, punctuation and hyphens. Store the exact original substring and offset, then independently validate it. Tests reject ambiguous, changed, dehyphenated and cross-page matches. |
| Model JSON contained invalid literal newlines | Request JSON-object output and constrain output length. Record output format and prompt version with the run. Unparseable output remains a failed candidate; no invented repair or automatic paid retry. |
| Candidate confused an interpretation and citation numbers | Preserve manual review as a required stage. Exact quotation matching cannot verify an interpretation or which numbered quotation supports it. |
| Final report reused the model summary instead of the edited review | Final publication selects reviewed text and deduplicates inherited quotations; a regression test checks the edited summary and preserved original candidate. |
| New notes were hard to find and local drafts looked saved | Added a dedicated note library with explicit project-save status, drafts, search, pin/archive, revision labels and readable preview/export. Stable save identifiers protect retries and versions retain the original edit parent. |
| “Read imported sources” kept an older source selected | Carry the imported source ID into the reader and clear prior page location and search. |
| Re-selecting a Drive PDF created another source although its bytes were identical | Production records showed Drive version 4 → 6 with identical SHA-256. Google `version` includes invisible metadata changes. Match downloaded bytes against the same external file within the same project before storing another original. Record the new ingestion revision against the existing source and tell the user it was already present. Regression checks preserve genuinely changed contents and prohibit cross-project reuse. |

## Model usage for this pilot

The project ledger records three analysis responses and one OCR response: **13,790 input tokens and 14,441 output tokens**. At the configured $0.15/M input and $0.50/M output rates, this is **$0.009289 estimated**, not the provider's billed amount. Analysis high effort took approximately 64, 45 and 47 seconds; OCR low effort took approximately 6 seconds. Earlier project-specific attempts failed before outbound Fetch and retain conservative budget reservations; those reservations are not evidence of provider charges. Other runs outside this pilot are excluded.

Local evidence: `work/research-pilot/final-model-usage.json`, `work/research-pilot-final-tests.log`, `work/research-drive-dedup-tests.log`, build/deploy logs in `work/`. No credentials are included in these docs. All **47 tests**, type checking, lint and Cloudflare production builds passed. Migration `0008_note_library.sql` was applied locally and remotely.

Deployed main Worker: `152ca32c-d00e-4dd8-8dcd-dc51b5559435`. Deployed research Worker: `439116a6-3b5a-4684-b1c1-5f4f9ca22acd`.

## What to improve next, based on this run

1. Test with a historian on a defined corpus and compare time to a checked finding, missed relevant passages, quotation accuracy, correction time and cost per accepted finding. Keep failed or unsupported findings in the evaluation. This pilot found useful workflow failures but did not measure scholarly acceleration.
2. Unify OCR and background budgets; add resumable page batches and quality review on a specified language and scan type. A single clear printed page is insufficient evidence for old newspapers, manuscripts or damaged pages.
3. Add complete original-inclusive project export and verified restore, and self-service account deletion. Current project JSON and Markdown exports are not a full attachment backup.
4. Evaluate semantic retrieval only when measured keyword recall or context size becomes a bottleneck. This seven-page comparison does not justify another database. Keep R2 originals and D1 metadata/versions. If cross-language or concept search demonstrates value, first evaluate [Cloudflare Vectorize](https://developers.cloudflare.com/vectorize/) with project/version filters and original-passage links. [LanceDB vector search](https://docs.lancedb.com/search/vector-search) is an alternative for a demonstrated workload, not a prerequisite for OCR or storing photos.
5. Continue the UI permission audit, citation numbering/claim-support checks and upstream provider provenance. Do not describe the whole three-stage roadmap as complete based on this narrow pilot.


## Reading and transcription continuation — 2026-09-05

The production LOC project was reused to validate continuity without altering its saved research notes or source transcriptions. Resuming the existing final-proclamation page-2 OCR candidate and reloading restored the local review draft; discarding those local edits preserved the server candidate. Batch transcription of final-proclamation pages 1–2 produced one new page-1 candidate and reused page 2. The new call returned 2,207 input / 730 output tokens and settled to a configured-rate estimate of $0.000697. A preceding budget-insufficient attempt made no call. Project allowance was temporarily increased from $0.10 to $0.25 for conservative image reservation and restored to $0.10. No automatic retry was used. The new text remains a candidate, not an accepted correction or historian-validated transcription.

Local comparison testing saved a clearly labeled software-test note with source/version/page links and confirmed recovery of an interrupted comparison draft. The mobile comparison view and batch review view were inspected at 390 pixels. Real task data exposed raw JSON in the inbox; this was replaced with concise notices and readable full results. Fifty-five regression checks passed, including rejection of model-authored automatic-check claims in the display parser.


## Backup recovery and account lifecycle verification — 2026-09-05

The previously downloaded 477,367-byte public-source project ZIP was restored to a new local disposable account through the real application APIs. Four originals (two historical texts plus retained Drive test copies), four source versions, three note revisions and four research tasks were retained. All original bytes matched. The two latest logical notes remained visible; pinned state survived. The reviewed note's final-proclamation citation was remapped into the new project and opened v1/page 2 with the original PDF and saved transcription. Historical accounts were not granted access, no keys transferred, and no model jobs started. No new model expenditure occurred.

Chrome file chooser testing was blocked by the extension's file-URL permission. The same archive reader was tested directly and the HTTP restore upload flow completed, but a Chrome ZIP-picker upload is not claimed verified. Desktop and 390-pixel deletion confirmation layouts were inspected. Only the disposable account and its restored copy were deleted through the actual UI. The cleanup reached complete; owned projects, reservations and sessions were zero, and the old cookie was rejected with 401. The live user's project was not deleted or overwritten. This checks data portability and lifecycle reliability, not historical interpretation quality or researcher time savings.
