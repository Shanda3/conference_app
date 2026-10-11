# Source export verification

Verified October 11, 2026. This is a source-only copy of the requested deployed application, prepared in an isolated directory. The original Site checkout and deployment were not edited or published during export.

## Sanitization

- Source files were selected from the requested deployed commit using an explicit allowlist; no Git history, `.git` data, or repository credentials are included.
- The previous deployment identity was removed from `.openai/hosting.json`. The manifest contains only logical `DB` storage binding configuration and an unused null R2 binding.
- Runtime databases/state, real profiles, connections, chat messages, private notes, share tokens, environment files, screenshots/captures, local auth state, package installations, logs, compiled output, and generated test results are excluded.
- Migrations contain schema changes only. Public event data, application source, the dependency lockfile, required build integration source, license files, and tests are included.
- The unused starter example application was omitted.
- Test identities and records written inline in test code are deliberately fabricated. They are clearly labeled and are not captured user fixtures. Running the smoke test creates disposable local test data, which must not be committed.

## Checks on the sanitized source

- Clean dependency installation from the checked-in lockfile: passed.
- TypeScript typecheck: passed.
- 51 unit/API tests, including migration compatibility and private-data isolation: passed.
- Production Worker build without the old Site project identity: passed.
- All three migrations applied to a new local D1 database: passed.
- 62 HTTP checks against the built local Worker/D1: passed, covering profile validation/persistence, two-user isolation, legacy updates, private-field exclusion, shared-link projection/revocation/headers, chat safety/rate limits, and preserved planner data.
- Explicit source-file and file-type checks: no symlinks, archive payloads, binary captures, runtime/database paths, or generated dependencies/build output included.
- Secret-pattern scan and contextual review found no existing Site identity, private Site/source origin, recognizable OpenAI/GitHub/AWS credential, PEM private key, or literal JWT in the selected source.
- A separate read-only reviewer inspected source/manifest, authentication limitations, schema/public-data provenance, and final archive membership.

## Limits

Pattern scanning and review are not proof that arbitrary secrets cannot exist. This is not a dependency-vulnerability, penetration, license, or legal audit. Browser visual behavior and the hosted identity gateway were not re-tested by the export. Local synthetic identity headers do not establish production authentication security.

The application still requires the trusted Sites identity gateway for its present hosted sign-in. It must not be independently exposed on a public Worker until managed authentication and owner-data migration are implemented and verified. `devyo.app` is an intended, owner-reported domain only; the export made no DNS, hosting, access-policy, or authentication changes. No GitHub repository was created or pushed by this export.
