# Self-hosting ClioForge

ClioForge is a personal open-source research experiment, distributed as software under AGPL-3.0-only. There is no maintainer-operated hosted research service. You control your installation and use your own model credentials. No registration with the upstream project is required.

## Choose a runtime

| Use                                                    | Supported setup                                                                    | Requirements                                                             |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Personal experimentation on one computer               | Local Workers emulator; follow the [README](../README.md#run-on-your-own-computer) | Node.js 22.19+, Git; no Cloudflare account                               |
| Persistent installation for you or your research group | Workers, D1, private R2 and Queues in **your** Cloudflare account                  | Your account, domain, verified email sender and deployment configuration |

The app currently depends on Cloudflare runtime bindings. It is not a standalone Node server, and a generic Docker/VPS production deployment is not supplied. `npm run dev:cloudflare` runs locally on loopback; do not expose it through a public tunnel as a production service. Local scheduled Cron execution is not automatic, while queue processing runs with the local auxiliary research Worker.

## First use

1. Install dependencies, create `.dev.vars` with two independent secrets, apply migrations and start the local app as described in the README.
2. Open `http://127.0.0.1:3000`. Create an account in this installation. Accounts and sessions from other deployments are separate.
3. Create a project and import a text file or a reviewed [Adams excerpt](adams-source-rights.md). Reading, notes and manual evidence work do not need a model key.
4. For AI tasks, add your own provider key under assistant settings, choose a model and start a small task. Providers charge their own fees; app estimates are not a billing cap.
5. Review the result against its source. Export a project backup including original files and test restoring it into a separate project.

For a persistent deployment, follow [Cloudflare setup](deployment.md). It provisions no resources in the upstream maintainer's account and must not point to the retired project domain. Google sign-in and Drive are optional and require [your own Google application](cloud-drive-setup.md); password-based sign-in does not require Google. Public password registration and recovery require configured email delivery. The localhost-only verification bypass is not suitable for a public hostname.

## Data and responsibilities

- Keep `.dev.vars`, ignored deployment configuration, local `.wrangler/state`, D1 exports and R2 backups private. Stop the local runtime before copying its storage directory. A project ZIP does not replace an installation backup of accounts and configuration.
- Back up `FOLIOTRACE_ENCRYPTION_KEY` securely and use the same value in your app and research Worker. It is needed to decrypt saved provider credentials. Never copy someone else's key or submit yours to GitHub.
- Uploaded documents and model keys stay with your installation, except for the selected content sent to configured external services when a task runs. BYOK does not mean requests bypass your server; the operator controls that server and its encryption key.
- Each operator configures email, Google OAuth, model access, data retention and backups. Set `INSTANCE_CONTACT_EMAIL` and review `/privacy` before allowing other people to register.
- All application pages send `noindex, nofollow` by default. This does not replace authentication or project permissions, and it does not prevent indexing of the public GitHub repository.
- Bundled source examples and assets retain their own notices. The software license does not grant rights to arbitrary imported material.

## Updating

Back up data and secrets, review changes and migrations, install with `npm ci`, apply migrations to the correct installation, and rebuild both workers. Use [deployment validation](deployment.md) for remote targets. CI tests the code but never deploys to your account. Existing legacy resource names are intentionally preserved for local-storage compatibility.
