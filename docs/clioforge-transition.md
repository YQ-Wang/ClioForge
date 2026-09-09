# ClioForge domain configuration

ClioForge 参伍 is the public name of the former Canwoo project. The canonical
application is `https://clioforge.com`; the repository is
`https://github.com/YQ-Wang/ClioForge`. Public support is
`support@clioforge.com` and transactional messages use `noreply@clioforge.com`.

## Active service

The old canwoo.com test domain is retired. It has no application binding,
redirect, migration notice or browser-draft transfer page. Its support forwarding
and sending service are disabled. The domain registration is retained.
`www.clioforge.com` redirects to the apex while preserving the path and query.

Projects, originals, notes, memberships and provider credentials remain in the
same database and bucket. Sign in with the same account on clioforge.com.
Existing sessions and local drafts belong to the browser origin and do not
transfer automatically. Existing test documents retain their citation identity.

## Provider configuration

- Google OAuth uses the existing client and secret, with only the new JavaScript
  origin and both `/api/auth/callback/google` and `/api/connections/callback/google`
  redirect URIs. The old authorized domain and callbacks have been removed.
- Google Picker retains Drive/Picker API restrictions and allows only the new
  site alongside `docs.google.com`.
- The GCP display name is `clioforge`; its immutable project ID remains `canwoo`.
- Google branding and developer contact use the new name and domain. The
  consent-screen support selector requires an eligible Google account or managed
  Google Group. That existing support identity remains pending a separate
  solution; forwarding alone does not make an address selectable.
- Email stays on Cloudflare. The domain is not added to Google Workspace.
  Email Sending has its own DKIM, SPF, bounce and DMARC records. Email Routing
  forwards support mail to the existing verified private destination, which is
  never published in the repository.

## Stable internal identifiers

Versioned backup, replay, manuscript and artifact format IDs stay unchanged.
The `.clioforge.json` writing export keeps its v1 payload and accepts previous
`.canwoo.json` files. Draft keys, internal actor IDs, encryption secrets, database,
bucket and queue names remain compatible with existing data. These names are not
public service addresses. Historical reports and cached artwork retain their
original filenames and licensing.

Private deployments use `CLIOFORGE_CONFIG` and `CLIOFORGE_JOBS_CONFIG`; previous
`CANWOO_CONFIG` and `CANWOO_JOBS_CONFIG` remain fallback aliases. Production sets
`BETTER_AUTH_URL` to the new host, with the verified `EMAIL_FROM` and matching
email binding.

## Validation boundaries

Live Google sign-in on clioforge.com opened the existing research account and
projects. The existing Drive connection was retained and Google Picker listed
available files on the new origin. No new private files were imported.

Cloudflare reports sending DNS ready and the new support forwarding rule enabled.
No migration test email was sent; actual receipt has not been independently
verified for the new sender domain.
