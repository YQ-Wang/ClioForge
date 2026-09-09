# Branding and public contact

The public identity is ClioForge 参伍. `lib/platform-contact.ts` provides the
support address (`support@clioforge.com`) and source repository URL. Privacy,
account settings and account-closure pages share these details. Transactional
messages use `noreply@clioforge.com`. Researcher profile and membership addresses
are personal data and are not rewritten by a platform-domain migration.

Cloudflare Email Routing forwards platform support mail to the existing verified
private inbox. That destination is provider configuration, never public website
content. The previous support address remains active for replies to old mail.
DNS readiness and accepted sending responses do not prove inbox delivery; record
receipt confirmation separately when validating an actual email.

Google consent-screen support email must be an eligible Google account or a
managed Google Group. A Cloudflare forwarding rule alone does not make an address
eligible for that selector. See [domain migration](clioforge-transition.md).
