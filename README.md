# Devyo conference planner source

Sanitized source for the Techlahoma / ThunderPlains conference planner, with the verified ThunderPlains + InnoTech Oklahoma 2026 program. This archive is intended for source review and a new GitHub repository. It does not contain deployment credentials, a Git repository/history, runtime databases, attendee records, or generated build output.

## Current deployment and authentication status

**This source currently requires the Sites identity gateway for hosted sign-in. It is not ready for independent production deployment to Cloudflare.** `app/chatgpt-auth.ts` reads identity headers supplied by the Sites gateway. An independent public Worker must never trust caller-supplied versions of those headers.

The intended future domain is `devyo.app`, which the project owner reports owning. No DNS changes, Cloudflare hosting migration, managed-auth setup, or domain attachment has been performed by this export. The previous Site identity is deliberately absent from `.openai/hosting.json`. Do not add the previous production identity or publish this source to the old deployment accidentally.

The local Vinext starter can provide development/mock identity behavior. This is for local tests only and is not production authentication. A managed identity-provider integration, verified account linking, and a separate staging/security review are required before an independent attendee-facing deployment. See `docs/cloudflare-auth-portability.md` for the migration inventory. Do not implement passwords or trust unverified identity headers as a shortcut.

## Included functionality

- Multiple conferences, IANA timezones, session search/filtering, and a saved personal agenda
- Cross-conference conflict detection with end-exclusive intervals
- Private session notes, connections, and in-app follow-up dates
- Explicit display-name profiles with optional private company and LinkedIn fields
- Signed-in, joined-room text chat with persistent limits and plain-text rendering
- Opt-in read-only schedule snapshots, exact previews, hashed unpredictable tokens, and owner revocation
- Verified Techlahoma Slack links; no automatic enrollment or cross-posting
- D1 schema and three additive migrations
- Dependency lockfile, application/build source, source-level tests, and local Worker smoke-test code

Private notes, connections, company, LinkedIn, email, and custom-session fields are excluded from public schedule snapshots. Company and LinkedIn are also excluded from chat sender payloads. `FRIEND_ACCESS_ENABLED` remains false for the private test build; this flag is a UI disclosure, not a substitute for platform access control.

## Program provenance

`lib/event-data.json` contains only public organizer information checked October 11, 2026: 61 timed entries, comprising 16 ThunderPlains and 45 InnoTech entries. It retains source links and cautions about possible duplicate Island demos, differing luncheon times, and the ThunderPlains final-session end time. October 20 workshops are excluded. Conference and exhibit windows remain separate from talk conflict checks.

Public speaker names and descriptions are organizer-published program data, not an attendee contact database. The ThunderPlains mark comes from its official 2026 site. Source and vendor license files are retained; review brand/content reuse rights before any public distribution or rebranding.

## Local setup

Use Node.js 24.x for the included native TypeScript/SQLite tests and npm with the checked-in lockfile.

1. `npm ci`
2. `npm run build`
3. For a new local D1 database, apply each existing migration exactly once, in order:

   `node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_windy_lockheed.sql`

   `node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_lowly_phantom_reporter.sql`

   `node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_sharp_nomad.sql`

4. `npm run dev` for development, or `npm run start` for the built local Worker.

All D1 commands above explicitly use local storage. A clean checkout has no local execution-profile file and defaults to the portable profile. If your environment requires a writable configuration directory, set `XDG_CONFIG_HOME` to a local ignored directory. Never put secrets in source, environment files in Git, or production credentials in the hosting manifest.

## Verification

- `./node_modules/.bin/tsc --noEmit --incremental false`
- `node --experimental-strip-types --test tests/planner.test.ts tests/sharing.test.ts`
- After a build and local migrations: `node --experimental-strip-types tests/social-worker-smoke.mjs`

The test code uses deliberately fabricated inline identities such as `owner-a` and `example.test` addresses. It creates temporary records only in its local/in-memory test databases. No captured user fixture files, real account IDs, attendee profiles, chat history, private notes, or database files are included in this archive.

See `EXPORT_AUDIT.md` for checks performed on this sanitized export and their limits. Keep generated directories (`node_modules`, `dist`, `.wrangler`, `.preview`, `.config`) and all credentials out of Git. The `build/` directory contains required source code for the starter's build integration; it is not compiled output.
