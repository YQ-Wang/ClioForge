# Self-hosting ClioForge on your Cloudflare account

This guide creates your own installation. Do not reuse another operator's resources or encryption secrets. Cloudflare services and model providers can incur usage charges; check their current pricing before enabling them.

## Resources and configuration

Install dependencies, sign in with `npx wrangler login`, and create a D1 database, private R2 bucket and queue in your own account:

```sh
npx wrangler d1 create clioforge
npx wrangler r2 bucket create clioforge-originals
npx wrangler queues create clioforge-research
cp wrangler.jsonc wrangler.production.local.jsonc
cp wrangler.jobs.jsonc wrangler.jobs.production.local.jsonc
```

The `*.local.jsonc` files are ignored by Git. Set both copies to your own Worker names, account ID, database ID, database name, bucket and queue names. The default resource names in the local templates preserve existing local data and are not shared infrastructure. Keep the binding names `DB`, `FILES` and `JOB_QUEUE`. The main producer, background producer and consumer must use the same queue. Use separate resources and secrets for development, staging and production.

In the application copy:

- Set `vars.BETTER_AUTH_URL` to your own HTTPS origin. The retired project domain is not a deployment target.
- Set `vars.INSTANCE_CONTACT_EMAIL` to your installation administrator’s public email. This is displayed on `/privacy`; use your own contact, not the upstream maintainer’s. Review and adapt that page to your actual data practices before inviting others.
- Add a route such as `{"pattern":"research.your-domain.org","custom_domain":true}` for that origin, in a zone you control.
- Set `vars.EMAIL_FROM` and the `EMAIL` binding's `allowed_sender_addresses` to the same verified sender on your domain.
- Keep R2 private and `workers_dev` and preview URLs disabled for this custom-domain deployment.
- Do not enable `AUTH_ALLOW_UNVERIFIED_LOCAL` in production. Real verification and password reset require working email delivery.

Enable Cloudflare Email Sending for your domain and complete the required DNS verification in your account. See [Cloudflare Email Service](https://developers.cloudflare.com/email-service/). Registering a domain alone does not make email delivery work.

## Secrets and release

Keep these environment selections active through building and deploying:

```sh
export CLIOFORGE_CONFIG=wrangler.production.local.jsonc
export CLIOFORGE_JOBS_CONFIG=wrangler.jobs.production.local.jsonc
npm run build:cloudflare
npx wrangler secret put BETTER_AUTH_SECRET --config dist/server/wrangler.json
npx wrangler secret put FOLIOTRACE_ENCRYPTION_KEY --config dist/server/wrangler.json
npx wrangler secret put FOLIOTRACE_ENCRYPTION_KEY --config "$CLIOFORGE_JOBS_CONFIG"
```

Generate independent high-entropy authentication and encryption secrets. The **encryption key must be identical in the two workers**. Back it up securely; losing or replacing it prevents decrypting saved model credentials. `.dev.vars` is local configuration and does not set production secrets.

After reviewing your selected account and configuration:

```sh
npm run db:migrate:remote
npm run check:jobs
npm run deploy:jobs
npm run deploy:cloudflare
```

The deployment wrapper rejects placeholder databases, local origins, inconsistent resources and a build that does not match the chosen target. It does not provision resources, verify DNS, confirm billing limits or replace your review of the deployment target. For Google sign-in and file selection, follow [Google setup](cloud-drive-setup.md).

## Validate and operate

Verify registration and actual verification-email delivery, sign-in, file upload and authenticated preview. With an authorized model key, run a small queued research task and review its source references. Check that an unrelated account cannot access the project. Export a backup and test restoring it into a separate project before relying on the service for important material.

The background worker checks scheduled work every 15 minutes. Queue concurrency starts at one to limit simultaneous work. Application budgets estimate provider charges; monitor both provider and Cloudflare usage independently. Back up D1, original files and encryption secrets. Test migrations in a separate environment before production.

CI checks builds and tests but never deploys. Maintain your own release and rollback process. If you deploy a modified version, make its corresponding source available under the AGPL and update `SOURCE_CODE_URL` in `lib/platform-contact.ts` to that source. Identify your installation's operator in its privacy information. Self-hosted pages default to `noindex, nofollow`, and the sitemap is empty; authentication remains the actual access control.
