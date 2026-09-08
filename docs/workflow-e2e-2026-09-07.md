# Research workflow validation, 7 September 2026

## Scope and environment

This pass reorganizes the project sidebar around four research stages: **Gather & read → Evidence & arguments → Research & review → Write & export**. Project administration is grouped separately. The overview links these stages to their inputs and outputs, including the previously missing argument-review step. The stages are guidance, not prerequisites: researchers can take notes or return to sources at any time.

The functional exercise used a local Cloudflare development server with D1, R2 and the research queue. An existing five-letter Adams project was restored into a separately labelled test project. HTTP requests exercised the application's authentication, permissions and public endpoints. These are integration exercises, not browser interaction tests. Production research records were not modified.

The focused question concerns [Abigail Adams's letter of 7 May 1776, continued on 9 May](https://founders.archives.gov/documents/Adams/04-01-02-0259): what can an excerpt criticizing absolute power over wives establish? Imported excerpts preserve preparation notes and original spelling. They are not full manuscript facsimiles. One duplicate source was subsequently uploaded to exercise transcription revision.

## Exercised paths

| Area                              | Observed outcome                                                                                                                                                                                                                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Import, backup and original files | Restored five sources, downloaded originals, uploaded a sixth test copy, and preserved earlier transcription versions. A final backup including live-model manuscript work was restored successfully into another project.                                                         |
| Search                            | Reindexed the collection; `adam` and `adams` returned the same source-version set with approximate matching. An exact phrase located the expected page. A search record preserved the scope. Similar spelling was not treated as verified identity.                                |
| Evidence and annotation           | Saved an exact excerpt with page and character offsets; read its discussion thread and added a scope-limited comment. Visual highlighting was not exercised in this pass.                                                                                                          |
| Questions and arguments           | Created a bounded question, reviewed claim and evidence link; inspected the manuscript dossier. An authorization defect was found and fixed, as described below.                                                                                                                   |
| People and source context         | Recorded a candidate person and alias with quoted evidence and a suspected source relationship. The relationship remained a hypothesis. This checks storage and retrieval, not historical identity resolution quality.                                                             |
| Bibliography                      | Exported and reparsed CSL JSON, BibTeX and RIS; exported Chicago references.                                                                                                                                                                                                       |
| Notes and writing                 | Saved and revised notes, pinned a version, rejected stale edits with HTTP 409, and exported DOCX with source footnotes. Rich-document print output included a table, marks and mathematics. Actual toolbar gestures and drawing interaction remain untested in this pass.          |
| Research plans and findings       | Moved a human task through board states via API, submitted a bounded review, accepted the functional result and inspected the artifact. Actual pointer dragging remains untested.                                                                                                  |
| External agents                   | Issued a temporary credential, claimed a task, renewed its lease, submitted an exact citation and ran the dependent built-in verifier. Checked cross-project denial and credential revocation. The external agent was a test client, not another autonomous model.                 |
| Collaboration                     | Accepted a local invitation; checked viewer, editor and removed-member access. No invitation email was sent.                                                                                                                                                                       |
| Methods, watches and inbox        | Saved an extraction method, created and immediately disabled a watch, and recorded an inbox read receipt. No scheduled external discovery was run.                                                                                                                                 |
| Account and privacy boundaries    | Read account, connections and project utilities through authenticated endpoints; anonymous project, manuscript and original-file requests returned HTTP 401.                                                                                                                       |
| Manuscript workflow               | A real provider completed two chapters, reference checking and initial-note creation. The note was read, revised to narrow overstatements, and exported to DOCX. The original note remained intact. The review was submitted and deliberately left awaiting researcher acceptance. |

The local exercise recorded 21 checkpointed steps, some covering multiple operations. That count is not a claim that every product feature has been tested.

## Defects found and corrected

### Editors could mark claims as reviewed

An editor could previously submit `status: reviewed` for a claim. That allowed an editor's claim to become eligible for manuscript drafting without a project owner or reviewer confirming it. The server now requires review permission for that status. The editor UI saves changes for review and explains who can confirm them; read-only participants cannot invoke editing controls. Editors can still revise an existing claim as a draft, which removes its eligibility until re-reviewed.

The regression checks both creation and update attempts, draft editing and subsequent reviewer confirmation. The real HTTP collaborator exercise was rerun successfully after the fix.

### Completed model output could choose unsupported excerpts

The first control-model response arrived in roughly five seconds, but it included additional source-page quotations outside the selected evidence. The application correctly rejected those citations. Requiring the model to construct quotation objects nevertheless made an avoidable formatting and selection problem part of the critical path.

New manuscript calls use `manuscript_section_v2`: paragraphs select numbered entries from the frozen dossier, and Canwoo fills the exact quotation, version and page. Unknown indices, mixed quotation modes and unlinked claims remain errors. Canonical saved results and the previous output schema remain readable. Validation finishes before canonicalized results are committed.

The live retry then completed both chapters and created a note. Inspecting that note exposed two presentation issues: repeated references acquired new numbers across chapters, and blank lines inside one model paragraph could visually separate its prose from its citation. Assembly now reuses reference numbers, and each paragraph item is rendered as one paragraph. Focused regression tests verify both behaviors. These final rendering changes were tested with injected responses; the already-created live note was preserved rather than regenerated.

## Provider behavior and costs

- The GLM 5.3 Flash attempt began responding but exceeded the existing 90-second completion limit. It remained uncertain, retained its cost reservation and did not start later chapters or retry automatically. This records an incomplete upstream response; it does not establish the root cause inside OpenRouter or its provider.
- A separately saved `google/gemini-2.5-flash-lite` connection was used as a low-cost control with the already-authorized OpenRouter key. The platform's default model was not changed. Its first completed response exposed the citation issue above; one explicit retry using the revised contract succeeded.
- The local project budget was $0.05. After these calls, its ledger showed $0.006919 committed: $0.003225 estimated from returned token usage and $0.003694 retained for the uncertain GLM request. This includes the completed control response rejected at the manuscript-validation stage. These application figures are not a verified OpenRouter invoice.
- Restored historical job records are not new calls and are excluded from these figures.

## Productivity assessment

The workflow now demonstrates a useful bounded loop: gather material, preserve its provenance, connect evidence to an explicit claim, draft from confirmed inputs, inspect the prose, revise it and export with source references. Background execution and deterministic references reduce repetitive assembly work.

The generated prose still repeated itself and overstated the boundary between marital criticism and political claims. The operator narrowed those statements in a new note version and documented remaining limitations. Citation validity did not detect or prove away those interpretive weaknesses. This is evidence of a usable assisted drafting workflow, **not** evidence that unattended, publication-ready historical research is established.

## Checks and remaining acceptance work

- Full automated suite: 232 passed, zero failures or skipped tests, using a real backup fixture.
- Seven focused manuscript tests passed again after the final reference-rendering changes.
- Nine lifecycle tests passed with the final live-case backup, including its manuscript and revision history.
- Type checking, lint, English-comment policy and formatting checks passed.
- The Cloudflare production build, research-worker deployment dry run and tracked-source secret scan passed.
- The Mac was locked during this pass. Sidebar appearance, responsive and dark layouts, actual drag gestures, editor toolbar interactions and Google Drive Picker therefore still require browser acceptance testing.
- OCR accuracy, new embedding generation, live scheduled web discovery, email delivery and multi-agent scholarly reasoning were not re-evaluated with this text-only case. Existing regression coverage is not a replacement for those live exercises.

No new Cloudflare resource, subscription or database migration is required for these changes.

## Browser follow-up after the Mac was unlocked

Chrome acceptance used the existing production Adams project and the isolated local copy. The following are actual UI interactions, supplementing the API checks above:

- Confirmed the ordered sidebar on desktop and mobile, including the final writing stage. Checked English, dark appearance and the mobile drawer at 390 × 844; restored Chinese and system appearance afterward.
- Searched for `adam`, opened an approximate `Adams` result at its fixed version and page, selected source text, saved a labelled test annotation and added a discussion comment.
- Created a labelled production note with bold text, preset highlighting, a table and a rendered equation, then saved it into the note library.
- Dragged a human review task from ready-for-review to active, confirmed the persisted board state, and restored it through the move menu. Dependent publication remained blocked; no scholarly approval was recorded.
- Opened the connected Google Drive Picker, searched and cancelled. No private file was imported. Completed Drive import remains outside this pass.

The browser exercise exposed four application issues, corrected in this follow-up:

1. Opening an annotation could leave its discussion below the visible page. It now receives focus and scrolls into view once per selection. A local deep link opened the discussion; returning to the source remained stable across subsequent synchronization.
2. Escape inside Excalidraw could dismiss its surrounding dialog and discard the unsaved scene. Escape now belongs to the drawing tool, and clicking the background does not dismiss the canvas. The actual regression drew a rectangle, edited its text, pressed Escape, inserted and saved the drawing, then reopened its editable scene with the text intact.
3. The drawing insertion button could fall below the visible area on a short desktop window. The canvas now shares the available dialog height with its caption and action buttons; verified at 1512 × 727.
4. Drawing-only notes appeared to have no body in the library. Cards now include drawing captions, with a focused regression for this case.

Eight focused note and rich-export tests passed. This follow-up made no model request. It does not extend the evidence for OCR accuracy, scheduled discovery, completed Drive import or autonomous scholarly reasoning.

## Drafting readiness and evidence-maintenance follow-up

Continued Chrome use of the Adams case exposed a gap between argument review and drafting: a question with an unreviewed claim showed a generic instruction, without identifying the claim or offering a direct route to resolve it. The drafting dialog now lists each claim's review, evidence, quotation and source-version blockers. Links focus the relevant claim; returning to drafting retains the research question. These checks are prerequisites, not a credibility score, and the existing preview and execution checks remain authoritative.

Evidence associations also needed maintenance controls. Researchers can now remove an association while retaining the original excerpt and its discussion. Adding evidence, changing its relationship or removing it returns the claim to draft in the same database transaction. Repeating an unchanged association preserves review. A stale removal fails without deleting the association. Existing manuscript snapshots remain marked as changed even after a subsequent review; their original notes are preserved.

The association dialog now shows the full excerpt, source, file page and saved interpretation, with a route back to the original page. Reading-question labels distinguish repeated excerpts used for different questions.

Actual browser acceptance on the isolated local copy:

1. Opened the formal question's preparation checklist and followed its blocker to the precise claim.
2. Removed the functional test claim's association. The four original excerpts remained, the claim became unreviewed, and drafting showed both missing evidence and pending review.
3. Used the association preview to open the May 7 source at the selected excerpt and inspect the surrounding passage, then returned and re-associated it. The claim still required review.
4. Confirmed the bounded functional claim after checking that passage. The checklist changed to one eligible claim; the next step showed one excerpt, its fixed version and page, one candidate person, and the attached bibliography. Continued to outline and budget without initiating a new model call.
5. Inspected the new checklist, focused claim, action layout and excerpt preview in English and dark appearance, including a 390 × 844 viewport. Scrolling exposed the complete mobile checklist and its action. The production project's formal claim remained unreviewed.

The default full suite passed 234 tests with one optional archive test skipped. Supplying the existing final Adams backup passed all nine lifecycle tests, including that archive test. Nine manuscript tests cover the new blockers, project isolation, atomic review invalidation, idempotent associations, stale removal and snapshot invalidation, alongside existing drafting and citation behavior. Type checking, lint, comment-policy and formatting checks passed.

This pass improves the repeatable handoff from evidence maintenance to reviewed inputs and drafting. It does not measure research time saved or establish unattended scholarly validity. It adds no model calls, database migration, Cloudflare resource or fixed subscription.
