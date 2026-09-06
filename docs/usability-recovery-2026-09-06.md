# Research continuity review — 2026-09-06

This pass focuses on recovering interrupted research work. It follows the earlier LED end-to-end validation and does not claim that every external integration has been retested.

## Problems corrected

- Import details previously cleared the unfinished queue when closed. Collapsing details now preserves it; adding files retains pending items and uploaded-original receipts. Pausing acknowledges the request, unsupported files can be removed individually, and leaving a project stops subsequent files without navigating back on completion.
- Follow-up answer citations previously bypassed the reader's return-to-task path. Ordinary clicks now use the same navigation as the main answer; modified clicks remain normal links.
- Follow-up submission feedback no longer promises that an assistant is running when the actual task is paused, blocked or failed. The current follow-up is directly accessible beside the explanation.
- Word/print exports no longer turn unrelated external URLs containing an `evidence` parameter into local source footnotes. External labels and links are retained; missing internal references still fail clearly. Bibliographic page locators are no longer appended twice.
- The writing citation picker now supports refreshing and retrying, distinguishes an empty search from an empty project, and retains previously loaded citations when refresh fails.
- Google login, email login and signup verification preserve the current research page. Return URLs retain supported project, page, annotation, task, inbox and settings parameters, and strip authentication secrets and external redirect parameters. Password reset behavior is unchanged.

## Verification evidence

- Full regression suite after the import, conversation and writing changes: **172 passed, 0 failed, 0 skipped**, including restoration of the previously downloaded LED archive.
- Actual ProjectDesk browser fixture: pause acknowledgement, collapse/reopen, retained pending files, receipt reuse after a simulated commit failure, removal of an unsupported file, and leaving the project while an import is running. The component and client upload calls are real; HTTP responses and text files are isolated fixtures.
- Actual TaskConversation browser fixture: reproduced the old citation-navigation defect, verified the corrected callback and modified clicks, simulated a budget failure, resumed a paused task into a blocked state, and checked that the unsent draft survived. HTTP responses are fixtures; no model requests were made.
- Export regressions cover plain Word, rich Word and print output, internal missing references, external URLs, localhost with no saved citations, and real CSL bibliography formatting.
- Signed-in production access to the existing 40-source LED project was checked through Google login. This exposed the additional loss of the original research URL after login, which is addressed in the final update below.

Local scripts, screenshots and logs are in ignored `work/usability-recovery/`. These fixtures do not contain model credentials. This pass did not send invitations or email, change cloud subscriptions, or make paid model calls.

## Final update

- Four additional authentication-return tests passed. The final ten-test authentication/export subset, TypeScript, lint, diff check and Cloudflare build passed.
- Actual WritingTools browser regression reproduced the earlier blank search and missing refresh, then verified refresh, new evidence, failed-refresh retention, retry, initial-load retry and insertion of the correct reference. All six requests were local fixture GETs; no browser errors occurred.
- Final deployed main Worker version: `7fae5d58-899a-46dd-af27-7a161350ee3c`. No migration or new cloud resource was required.
- The deployed login component was checked from a fresh isolated browser at a fixed-source URL. Its real outgoing Google-login request was intercepted before sending: both success and error callbacks retained the research location, and unrelated authentication parameters were removed. This checks deployed callback wiring without claiming a new-user OAuth consent test.
- Signed-in production WritingTools displayed the new no-match explanation and refreshed the saved LED evidence. A fresh Word download was 2,845 bytes, with two real footnote references, the fixed source version and the historian-review caveat intact; duplicate page locators were absent.
- Visual inspection found adjacent export buttons touching. Their native fieldset now has an 8-pixel flexible gap, and status text has consistent spacing. The actual component with its stylesheet passed desktop and 390-pixel browser layout checks and the citation-refresh regression again. Final TypeScript and lint checks passed after the accessibility adjustment.

Import queues still belong to the open project page; they are not a persistent background upload service. Expert evaluation of historical interpretations, fresh-user consent, Drive picker access, and simultaneous editing remain separate validation work.
