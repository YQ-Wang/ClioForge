# Browser regression — 2026-09-06

This pass verifies the local reliability changes after the maintainer unlocked the Mac. It also checks selected flows on the separately deployed application. The local code has not been pushed or deployed by this pass; online results do not validate the new collection API or sidebar fixes in production.

## Environment

- Chrome blocked the local address with `ERR_BLOCKED_BY_CLIENT`. No browser security settings were changed. Local testing used the existing Codex in-app browser and its existing local test session.
- The existing development server had stale optimized dependencies after the lockfile update and returned HTTP 500. Restarting that process with the same private Cloudflare configuration restored the application and preserved its local data.
- Chrome's production session initially showed the sign-in page. Clicking **Continue with Google** successfully restored the existing account and project list.

## Verified paths

| Environment   | Actual interaction and result                                                                                                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Local         | Opened a source/version/page deep link in a 40-source LED inscription project; the original transcription and version selector loaded.                                                                                                                       |
| Local         | Switched to the lightweight overview, reloaded it, and checked full counts: 40 sources, one evidence excerpt and initially zero notes. Entering writing loaded the detailed workspace.                                                                       |
| Local         | Created a clearly labelled regression note, saved v1, edited and applied bold with the keyboard, saved v2, and reloaded. The library contained one note; the editor retained its bold formatting and both revisions.                                         |
| Local         | Inserted a table and saved v3. Archived the note, found it under Archived, restored it and reopened it. The table, three bold paragraphs and all three revisions remained available.                                                                         |
| Local         | Searched the note by a phrase from its body. The matching note opened correctly. The pre-existing unrelated local draft remained intact.                                                                                                                     |
| Local         | Returned to overview after writing; the active-note count was one, rather than the number of revisions.                                                                                                                                                      |
| Local         | Checked the default-width library visually, then the 390px mobile navigation branch and overview. Neither the library nor overview overflowed horizontally. Selecting a mobile navigation item closed the drawer. The temporary viewport override was reset. |
| Local         | Collapsed the desktop sidebar and pressed Shift+Tab from its trigger. Focus moved to the skip link, skipping the hidden sidebar. The trigger reported `aria-expanded=false` and the collapsed container was inert. Expanded navigation remained usable.      |
| Online Chrome | Signed in with Google, opened the existing 40-source LED project, checked counts and opened its existing research note without editing it.                                                                                                                   |
| Online Chrome | Switched that note to reading preview and followed its source link. The new tab opened HD010004, v1, page 1, showing the cited `parentes filio dulcissimo` passage and its saved reading highlight.                                                          |

Local and online reader console checks returned no errors or warnings at the end of these paths. UI checks used DOM state, ordinary interactions and screenshots; they did not invoke private application functions or inject database records.

After the fixes, all 199 automated tests passed with zero failures or skips, including the private backup fixture. TypeScript, lint, English-comment checks, formatting and `git diff --check` also passed. Logs are retained locally under the ignored `work/solid-audit/browser-*` paths.

## Fixes found during testing

- Off-canvas desktop navigation remained keyboard reachable when collapsed. Its collapsed container is now inert, and the navigation trigger reports the actual desktop/mobile expanded state.
- The global navigation shortcut did not respect text-entry controls or handled keyboard events. It now leaves editor shortcuts alone; the browser check confirmed that bold formatting does not toggle the sidebar.
- Note-card summaries exposed markdown markers from rich text. Saved notes and local drafts now derive summaries from their validated rich document, preserving literal punctuation and word boundaries. Legacy or malformed documents retain the existing body fallback. A regression test covers formatting, literal symbols, adjacent text nodes, table cells and fallback behavior.

## Scope limits

These are focused interaction regressions, not an exhaustive production certification. This pass did not run paid model calls, OCR, Google Drive Picker, email delivery, simultaneous multi-user edits or production-scale load. It did not change production research records. The local regression note is retained as reproducible test evidence.
