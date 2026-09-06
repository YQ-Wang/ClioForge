# Security policy

Canwoo is public alpha. Security fixes target the latest main branch; older releases do not currently have a separate maintenance commitment.

Please report vulnerabilities privately through [GitHub private vulnerability reporting](https://github.com/YQ-Wang/canwoo/security/advisories/new). If that option is unavailable, contact support@canwoo.com. Do not put credentials, private research materials or exploitable account details in a public issue.

Include the affected revision, a minimal reproduction using synthetic data, the expected access boundary, and the impact. There is no guaranteed response time or paid bounty program.

Deployment operators must keep their dependencies current, protect their Cloudflare account and secrets, back up the encryption key and research data, and configure their own verified email and OAuth origins. Never share a production encryption key with a development installation.

## Known dependency audit limitation (2026-09-06)

The initial release's npm audit reports four moderate entries in the development-only `drizzle-kit` → `@esbuild-kit/esm-loader` → `@esbuild-kit/core-utils` → old `esbuild` chain, concerning [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99). The advisory concerns esbuild's development server. Canwoo's application build uses the separately installed current esbuild; this transitive development dependency is not part of the deployed application bundle. Do not expose development or database-administration servers to untrusted networks. The audit's suggested forced Drizzle Kit downgrade is not applied; track an upstream-compatible fix instead. This is an audit observation, not a claim that the application has undergone a complete security audit.
