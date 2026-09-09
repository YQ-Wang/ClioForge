# Hosted service retirement

The maintainer-operated service at `clioforge.com` and `www.clioforge.com` was retired on September 9, 2026. ClioForge continues as [self-hosted open-source software](self-hosting.md) in [YQ-Wang/ClioForge](https://github.com/YQ-Wang/ClioForge).

## What changed

- All former webpages, downloads and API routes return HTTP 410 with `X-Robots-Tag: noindex, nofollow, noarchive`. There is no sign-up, login, Google callback or model execution through the retired website.
- A minimal `workers/offline.ts` handler replaces the hosted application. It has no database, object-store, email or queue access. The old application assets are not served.
- The research queue is paused and its Cron Triggers are removed. Existing private databases, files and encryption secrets are retained, not erased or published. Undelivered queue messages remain subject to the provider’s retention period; database research records are separate.
- Google Search Console received a removal request for the whole site, covering www/non-www and HTTP/HTTPS variants. Submission does not mean Google has finished processing it. The 410 responses provide the persistent removal signal after temporary search suppression expires.
- The source repository stays public. Removing the hosted website from search does not remove GitHub pages or independent third-party references from search.

The DNS and minimal 410 handler remain to let crawlers observe removal; this is not an operational research service. Infrastructure subscriptions and retained storage may still incur charges. Domain ownership and email routing are separate from the retired web application.

## Independent installations

Use your own account, domain, Google OAuth application, sender address and model credentials. Existing account records are not transferred automatically. Exported project backups can be restored into another installation. Local resource names and `foliotrace` storage identifiers remain unchanged for compatibility; they do not connect a self-hosted installation to the retired service.

The normal deployment wrapper refuses the retired domain to avoid accidentally restoring it. CI does not deploy. Do not roll an old hosted application version back into service while search removal is intended.
