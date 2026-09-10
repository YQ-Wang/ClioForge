# Resource names and compatibility

New installations use `clioforge` for the app Worker and D1 database, `clioforge-research` for the research Worker and queue, and `clioforge-originals` for the private R2 bucket. Deployment IDs belong in ignored operator configuration files.

R2 buckets and D1 databases require a copy-and-switch migration rather than an in-place name change. Pause writers and background dispatch before the final snapshot, preserve object keys and HTTP/custom metadata, and verify every copied object by SHA-256. Update both Workers' bindings before resuming the queue and cron. Do not remove the source resources until verification succeeds.

D1 export cannot include FTS5 virtual tables. Export the application tables explicitly, recreate all indexes and triggers, and rebuild `page_fts` from `source_pages`. Import table definitions before data, then insert referenced records before their dependents (including composite note-version references). Check every table's records against the source; row counts alone are insufficient. Keep database exports owner-readable and outside Git.

The application writes new backup, writing, manuscript and agent-trace formats with the ClioForge prefix. Readers still accept the previous format identifiers, and the frozen older backup fixture remains unchanged. Browser drafts migrate when opened; existing language and theme cookies remain readable. Older deployment environment variables are accepted as fallbacks, with `CLIOFORGE_*` taking precedence.

Historical design records and third-party font notices retain accurate attribution. These compatibility and provenance references do not point the running application at old infrastructure.
