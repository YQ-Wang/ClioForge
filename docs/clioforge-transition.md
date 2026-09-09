# ClioForge naming transition

ClioForge 参伍 is the new public name of Canwoo. Its long-term scope is an
open-source research IDE for humans and agents; current workflows focus on
history and humanities. The rename does not add scientific computing or
experimental validation capabilities.

## Public identity

The UI, page titles, email display names, current guides, package name and new
download filenames use ClioForge. The original fan and Qiji 參伍 lettering remain;
the lowercase Latin wordmark uses outlined Geist Sans lettering.

The repository remains `https://github.com/YQ-Wang/canwoo`, the hosted origin
remains `https://canwoo.com`, and public support remains `support@canwoo.com`.
These are working destinations, not placeholders for domains that have not yet
been configured. Google consent-screen branding is managed separately in Google
Cloud and is not changed by an application-code rename.

## Compatibility identifiers

Do not globally replace `canwoo` or `foliotrace` in persisted records:

- Versioned backup, replay, manuscript and artifact format IDs remain unchanged.
  New `.clioforge.json` writing downloads retain the existing v1 payload format;
  the importer also accepts previous `.canwoo.json` files.
- Browser draft keys, theme/language cookies, internal event names, execution
  actor names, search-engine IDs and rate-limit keys retain their existing names.
  This preserves drafts, preferences, running-task ownership and stored traces.
- Cloudflare Workers, D1, R2 and Queues retain existing resource names. The public
  example configurations use the same identifiers as before to preserve local
  development data. Resource names do not determine the application's brand.
- Existing authentication and encryption secrets are unchanged. Renaming a
  secret or generating a replacement can invalidate sessions or encrypted keys.
- Earlier public font/SVG paths and their licenses remain for cached clients.
  Dated research records and release history retain the name used at the time.

Use `CLIOFORGE_CONFIG` and `CLIOFORGE_JOBS_CONFIG` for private deployment configs.
`CANWOO_CONFIG` and `CANWOO_JOBS_CONFIG` remain fallback aliases, independently
for each worker. The new name takes precedence when both are set. Build and
deployment scripts use the same resolver.

## Moving to a new domain later

Buying a domain does not move the service. Before switching the public origin:

1. Verify ownership, configure DNS/TLS and attach the chosen host to the existing
   application Worker. Keep the same database, bucket and queue.
2. Configure the new Google OAuth origins and both callback routes, Picker key
   restrictions, verified sending domain and support-mail routing.
3. Update `BETTER_AUTH_URL`, deployment routes, public contact/source links and
   export-link defaults together. Check login, Drive, email and source deep links.
4. Plan the old-origin transition: browser-local drafts, preferences and sessions
   do not automatically cross domains. Let users save/export local work before
   redirecting; preserve existing project/version/page links.

The application rename alone does not rename the GitHub repository, buy domains,
change DNS, or migrate the authentication origin.
