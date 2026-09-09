# Branding and public contact

The public identity is ClioForge 参伍. `lib/platform-contact.ts` provides the
installation contact route (`/privacy#contact`) and source repository URL. Privacy,
account settings and account-closure pages share these details. Transactional
messages use the operator-configured `EMAIL_FROM`. Configure `INSTANCE_CONTACT_EMAIL` for the administrator address shown on the privacy page. Researcher profile and membership addresses
are personal data and are not rewritten by a platform-domain migration.

Each operator supplies their own email delivery and administrator contact. The
upstream repository is for software issues, not account recovery or private research
data. Email forwarding is optional and belongs to the deployment configuration.

Google consent-screen support email must be an eligible Google account or a
managed Google Group. A Cloudflare forwarding rule alone does not make an address
eligible for that selector. See [Google setup](cloud-drive-setup.md).
