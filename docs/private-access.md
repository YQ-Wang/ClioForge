# Private GitHub access

An operator can put an installation behind an invitation-only GitHub gate. This is separate from project membership: passing the gate does not grant access to another researcher's projects. The regular workspace login remains inside the gate, preserving existing accounts and Google Drive connections.

The source project remains self-hosted. The maintainer domain is not a public registration service and is not submitted for search promotion.

After GitHub verification, `/` shows the introduction, research example and workflow guide. Its sign-in links open `/?view=projects`: users without a workspace session sign in there, while returning users enter their research directly. The introduction remains available at `/` even when a workspace session already exists.

## Configuration

1. Create a GitHub OAuth application with your installation's HTTPS homepage and the exact callback `https://YOUR_HOST/api/private-auth/callback/github`. Do not enable wildcard redirects or device flow.
2. Resolve each invited GitHub username using the GitHub users API. Configure the numeric `id`, not the mutable username, email, repository role or organization membership.
3. In the ignored deployment configuration, set:

   ```json
   {
     "main": "workers/app.ts",
     "assets": { "binding": "ASSETS", "run_worker_first": true },
     "workers_dev": false,
     "preview_urls": false,
     "vars": {
       "BETTER_AUTH_URL": "https://YOUR_HOST",
       "PRIVATE_GITHUB_ACCESS": "1",
       "PRIVATE_GITHUB_USER_IDS": "123,456",
       "PRIVATE_GITHUB_CLIENT_ID": "YOUR_OAUTH_CLIENT_ID"
     }
   }
   ```

   Merge this with your existing bindings and configuration. Keep the invitation list out of the public repository.

4. Store `PRIVATE_GITHUB_CLIENT_SECRET` and a separate, randomly generated `PRIVATE_GITHUB_AUTH_SECRET` (at least 32 characters) in Cloudflare Secrets. Never reuse the workspace authentication or encryption secret. Never put real secrets in the checked-in configuration.
5. Build with this configuration and deploy only after the gate tests pass. Missing configuration fails closed. Verify anonymous HTML, API, source downloads and built assets, then complete a real GitHub login.

GitHub OAuth requests `read:user` and `user:email`, not repository access. Better Auth handles the authorization code flow, PKCE, state and encrypted cookies. Provider tokens are not retained in the gate's cookies or application database. The gate is independent of existing workspace sessions and does not link accounts by email.

## Access lifecycle

- The gate checks the GitHub numeric ID against the current list on every request. Removing an ID and deploying revokes that account's entrance even if its eight-hour gate session has not expired.
- Sessions have a fixed eight-hour lifetime and do not silently renew. Rotate `PRIVATE_GITHUB_AUTH_SECRET` to invalidate every gate session. Sign-out does not provide individual server-side revocation for a copied stateless cookie; use allowlist removal or secret rotation if a device is lost.
- Site access and project permissions are distinct. An invitation to this installation does not create a project invitation or share existing research.
- The worker runs before static assets. Keep R2 buckets private and Workers development/preview URLs disabled. Never deploy the framework handler directly for a private installation.
- Pages and responses use `noindex, nofollow, noarchive` and `private, no-store`. Authentication is the privacy control; crawler instructions alone are not access control. Keep sitemap submissions removed and do not cancel an existing Search Console removal request.
- Background processing is configured separately. Do not resume a paused queue or scheduler without reviewing its existing pending research work and cost settings.

## Optional background research

To enable background progress, resume queue delivery and set the research worker's `triggers.crons` to `["*/15 * * * *"]` in your private deployment configuration. Deploy the research worker with that configuration. Use an empty array to disable periodic checks again.

Each check advances already-started research plans and recovers interrupted dispatches. It does not start draft or paused plans. Model steps use the plan creator's saved model connection and API key, recheck project write permission before calling the provider, and reserve the project's configured budget. Missing or deleted connections fail without a platform-key fallback. Budget estimates depend on the configured rates; provider billing remains authoritative. Human review checkpoints and uncertain model calls require attention rather than automatic approval or blind retries.

Enabled source watches query Crossref metadata at their configured daily or weekly interval; they do not call a model. Background checks also perform existing account/file cleanup. GitHub access restrictions and search-index exclusion remain in effect when scheduling is enabled.

If GitHub or the gate is unavailable, requests remain blocked. An installation can be returned to the offline worker without deleting its research database or files.
