# Continuous deployment

The `CI` workflow tests pull requests and pushes to `main`. After both `checks` and `secrets` succeed, pushes to `main` in `YQ-Wang/ClioForge` deploy the private installation. A manual run on `main` follows the same checks. Forks and pull requests cannot run the production job.

The deployment job uses the GitHub `production` environment, restricted to the `main` branch. It installs locked dependencies, validates the private configuration, builds the app, validates the research Worker, and checks that the commit is still the latest `main` revision. It then applies pending D1 migrations, deploys the research Worker, deploys the app, and checks that unauthenticated page, API and asset requests remain blocked with `noindex` and `no-store` headers. The Actions run summary records the deployed commit.

Runs are serialized and running deployments are not cancelled by newer pushes. Do not run a separate Cloudflare Builds deployment against these Workers: that would bypass the checks and compete with this workflow.

## Environment secrets

Configure these under **Settings → Environments → production**:

- `CLOUDFLARE_API_TOKEN`: a dedicated deployment token scoped to the installation's Cloudflare account and zone. Grant Workers Scripts edit, D1 edit for migrations, Queues edit for the consumer, Workers R2 Storage read for binding validation, Workers Routes edit and Zone read for the custom domains. Add a permission only if a deployment actually requires it. Do not use a global API key or a developer's interactive OAuth token.
- `CLIOFORGE_APP_CONFIG`: the contents of the private app Wrangler JSONC file.
- `CLIOFORGE_RESEARCH_CONFIG`: the contents of the private research Worker Wrangler JSONC file.

The configuration secrets contain infrastructure identifiers and ordinary Worker variables, not application secrets. Both configurations must point to the same existing database, bucket and queue. The app must enable the GitHub access gate and worker-first assets; alternate Worker URLs remain disabled. Login and encryption secrets already stored in Cloudflare remain in place when Wrangler deploys. Each user's model credentials remain in the application database.

The preparation step writes ignored files with owner-only permissions and removes them at the end. No production credentials are available to pull-request checks. Restrict who can push to `main` and change environment secrets: such users can change the deployed code.

## Failures and rollback

A failed check prevents deployment. A migration failure stops before either Worker is deployed. The two Worker deployments are sequential, not atomic; if one fails, inspect the Actions log and rerun after fixing the cause. A failing smoke check reports the deployment as failed but does not automatically roll back the database or Workers.

Keep schema changes compatible with the previous Worker revision. Never edit migrations already applied in production. Prefer reverting faulty code with a new commit and letting CI deploy it. For an urgent incident, use Cloudflare's Worker version rollback for both Workers only after checking schema compatibility; D1 restoration requires a separate decision.

### Cloudflare challenges

A `cf-mitigated: challenge` response means Cloudflare intercepted the probe before it could verify the application. The check deliberately fails and prints the Ray ID for correlation in **Security → Events**. A 403 challenge must not count as a successful GitHub access check. A successful check still requires the application's 401 response, GitHub gate content, and `noindex` / `no-store` headers on every tested route.

Cloudflare's free [Bot Fight Mode](https://developers.cloudflare.com/bots/get-started/bot-fight-mode/) can challenge GitHub-hosted runners and cannot be skipped using a WAF custom rule. The site owner must explicitly choose whether to disable that optional feature or use a bot-management plan that supports narrowly scoped exceptions. Do not disable the GitHub allowlist, expose an alternate Worker URL, or broadly allow GitHub's shared IP ranges to make a smoke check pass. After resolving the edge challenge, rerun the failed deployment job.

This is the maintainer's private installation pipeline. Self-hosters should use [deployment.md](deployment.md) and configure their own workflow and resources; cloning this repository does not give access to its production environment.
