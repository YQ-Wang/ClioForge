# ClioForge domain migration

ClioForge 参伍 is the public name of the former Canwoo project. The canonical
application is `https://clioforge.com`; the repository is
`https://github.com/YQ-Wang/ClioForge`. Public support is
`support@clioforge.com` and transactional messages use `noreply@clioforge.com`.

## Existing users and links

Projects, originals, notes, memberships and provider credentials stay in the same
database and bucket. Sign in with the same account on the new domain. Existing
sessions are host-bound; cookies are not copied between domains.

The old homepage checks for browser-local drafts. With no drafts it continues to
the matching new URL, preserving project, version and page parameters. With local
drafts it offers a JSON backup and a link to `/migrate-drafts` on the new site.
That file includes only recognized draft keys, never login cookies or API-key
settings. Import preserves existing drafts rather than overwriting them. It is
browser-local; the researcher still saves each draft to its project as usual.
The old `/migrate-drafts` page remains available for recovery. Keep the downloaded
file until the recovered work has been saved. If browser storage is unavailable,
the old page stays put and reports the problem rather than silently redirecting.

Other old GET/HEAD links redirect to the canonical host. Absolute return URLs in
old verification emails are updated to the new host. Old write requests return a
clear migration error instead of forwarding a request with the wrong session or
origin. `www.clioforge.com` redirects to the apex host.

## Provider configuration

- Google OAuth uses the existing client and secret, with the new JavaScript
  origin and both `/api/auth/callback/google` and `/api/connections/callback/google`
  redirect URIs. The old origin, callbacks and authorized domain have been removed.
- Google Picker retains Drive/Picker API restrictions and permits the new site
  alongside `docs.google.com`; the old site is no longer allowed.
- Google branding and developer contact use the new project name and domain.
  The consent-screen support selector separately requires an eligible Google
  account or managed Google Group; a forwarding address alone is not selectable.
  The existing Google support identity remains pending a separate solution.
  Email stays on Cloudflare; the new domain is not added to Google Workspace.
- The GCP display name is `clioforge`. Its immutable project ID remains `canwoo`.
- Cloudflare Email Sending has its own DKIM, SPF, bounce and DMARC records for
  clioforge.com. Email Routing forwards support mail to the existing verified
  private destination. Old support routing remains to receive replies to older
  messages. No personal destination address is published in the repository.

## Stable internal identifiers

Versioned backup, replay, manuscript and artifact format IDs stay unchanged.
The `.clioforge.json` writing export keeps its v1 payload and accepts previous
`.canwoo.json` files. Draft keys, internal actor IDs, encryption secrets, database,
bucket and queue names remain compatible with existing data. These names are not
public service addresses. Historical reports and cached artwork retain their
original filenames and licensing.

Private deployments use `CLIOFORGE_CONFIG` and `CLIOFORGE_JOBS_CONFIG`; previous
`CANWOO_CONFIG` and `CANWOO_JOBS_CONFIG` remain fallback aliases. The production
config keeps the old host attached for draft recovery, and sets `BETTER_AUTH_URL`
to the new host with its verified `EMAIL_FROM` and matching email binding.

## Migration validation

The migration passed 289 tests, type checking, lint, formatting, the production
build and the research-worker dry run. All 23 database migrations were unchanged.
Dependency audit reported no vulnerabilities. Source and Git-history scans found
no secrets; the built-client scanner match was the existing Excalidraw public
Firebase configuration, not a platform credential.

Live Google sign-in returned to clioforge.com and opened the existing research
account and projects. The existing Drive connection was retained and Google
Picker successfully listed available files on the new origin. The new privacy
page returns 200, the old privacy link
redirects with 307, and www.clioforge.com redirects to the apex with 308 while
preserving the query. The legacy draft-recovery page remains available. Legacy
write requests were checked in the production-build preview and return 409.

Cloudflare reports sending DNS ready and the support forwarding rule enabled.
No migration test email was sent; actual receipt has not been independently
verified for the new sender domain.
