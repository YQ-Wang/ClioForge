# Project loading and API limits

The workspace API separates a lightweight overview from bounded collection reads. The browser keeps the last successfully loaded project visible during a refresh and discards superseded requests. A continuation failure must not replace the library with a partial result or produce an incomplete JSON export.

## Read contract

All endpoints below require a session and project access. Every continuation checks access again. Responses use `Cache-Control: private, no-store`.

- `GET /api/workspace?project_id=<id>&overview=1` returns the project, up to six recent sources and complete source/evidence/active-note counts. Notes are counted by their root rather than by saved revisions. Archived note families are excluded.
- `GET /api/workspace?project_id=<id>` returns project metadata, the current user's model summaries and an insertion checkpoint for the project collections. It no longer returns all research bodies in one response.
- `GET /api/workspace?project_id=<id>&collection=<name>&before=<cursor>` returns `{ rows, next }`. Collection names are allowlisted. Pass the checkpoint's value for the first page, then each returned `next`, until `next` is null. Cursors are opaque to clients; never increment or reuse them as record identities.
- `GET /api/workbench?project_id=<id>` returns the current budget. Its research collections use the same collection API.

`projectHeader`, `loadSnapshot`, `loadWorkbench` and `projectRows` in `lib/client-api.ts` implement this protocol. `ProjectDesk` passes one header to both loaders. Other consumers that need only a single collection can request it directly.

Each collection page contains at most 50 rows and approximately 4 MiB of serialized row data. SQL sizes records before fetching their bodies; a byte limit is necessary because a few historical source versions can be much larger than hundreds of metadata entries. The largest identifier query uses 51 parameters, within the current [D1 bound-parameter limit](https://developers.cloudflare.com/d1/platform/limits/). Single records that exceed the page budget produce an explicit error instead of truncation.

The insertion boundaries come from one SQL read. They keep newly inserted source/version/evidence records out of an in-progress project load, and keyset pagination avoids OFFSET shifts. This is **not** a transaction snapshot of mutable job results, budgets, bibliography or note-state updates across all subsequent requests. Mutations continue to enforce their own permissions and revision/attempt checks. A refresh picks up later inserts.

Opening the overview does not fetch historical bodies. Entering a research section currently assembles the complete detailed workspace in the browser, through bounded requests. Very large archives still need finer-grained reader/history loading and browser-memory measurements. Server-side writing export also retains its existing full-project assembly path. Do not describe these changes as unlimited-scale support.

## Throttling

Authenticated application requests share two fixed one-minute counters per account:

- 600 reads (`GET`, `HEAD`, `OPTIONS`).
- 120 writes (other methods).

Project agent credentials share their owner's counters, so creating additional credentials does not create additional capacity. Authentication endpoints retain their separate Better Auth limits. The counters reuse the existing `rate_limit` table with an application-specific key namespace; no migration or new cloud service is required.

The counter update is atomic. Rejected requests neither increase the counter nor extend the current window. A blocked request receives HTTP 429 and `Retry-After` in seconds. Reads and writes use separate lanes so ordinary polling cannot consume the save allowance. These are abuse controls, not billing caps or a replacement for source-storage quotas, model reservations and execution fences. Long-term quotas for growing text/version history remain separate work.

The client does not automatically replay writes. A researcher can wait for the reported interval and retry; note drafts and existing mutation-id/version checks remain in place. HTML gateway errors are converted to a readable error instead of exposing a JSON parse exception.

## Verification

Regression coverage includes concurrent requests at the limit, window rollover, account isolation, an actual Worker 429 response, multi-page large-text collections, quote-heavy valid source versions, cross-project access rejection, concurrent insertions, shared insertion boundaries, cancellation propagation and failed continuations. A 20,000-revision note chain verifies linear root-state resolution without recursion.

No deployment or data migration is part of this change. After the maintainer unlocked the Mac, browser regression covered the local paginated workspace and the separately deployed site. See [Browser regression](browser-regression-2026-09-06.md) for the tested paths and remaining limits.
