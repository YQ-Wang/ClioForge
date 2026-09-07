# Security policy

Canwoo is public alpha. Security fixes target the latest main branch; older releases do not currently have a separate maintenance commitment.

Please report vulnerabilities privately through [GitHub private vulnerability reporting](https://github.com/YQ-Wang/canwoo/security/advisories/new). If that option is unavailable, contact support@canwoo.com. Do not put credentials, private research materials or exploitable account details in a public issue.

Include the affected revision, a minimal reproduction using synthetic data, the expected access boundary, and the impact. There is no guaranteed response time or paid bounty program.

Deployment operators must keep their dependencies current, protect their Cloudflare account and secrets, back up the encryption key and research data, and configure their own verified email and OAuth origins. Never share a production encryption key with a development installation.

## Dependency advisory mitigation (2026-09-06)

The initial alpha reported four moderate entries in the `drizzle-kit` → `@esbuild-kit/esm-loader` → `@esbuild-kit/core-utils` → old `esbuild` chain, concerning [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99). Better Auth's optional Drizzle Kit peer also made these entries appear in the production npm installation graph.

The working code now pins only `@esbuild-kit/core-utils`'s esbuild dependency to **0.25.12**, the patched version already used by Drizzle Kit itself. Drizzle Kit is not downgraded and unrelated packages are not upgraded. Full and production npm audits report zero advisories against this lockfile. CommonJS and ESM TypeScript transformations and actual schema generation are checked for compatibility. Keep this override until the upstream chain has a compatible fix, and rerun the tooling checks before removing it.

An advisory-free dependency audit is not a complete application security audit. Do not expose development or database-administration servers to untrusted networks.
