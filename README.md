# Devyo conference planner

Devyo is a ThunderPlains and Techlahoma conference planner with registered attendee accounts, private agendas and notes, connections, group conversations and revocable schedule sharing.

**Work in progress:** this branch adds unfinished profile photos, attendee directory/networking filters, organizer review and identity helpers on top of the published live-source snapshot. These changes have not been deployed and are not conference-release approval.

## Local development

Use Node.js 24 and the locked npm dependencies. Run npm ci, npm test, npx tsc --noEmit, and npm run build. Runtime authentication requires privately supplied Clerk configuration. The public .env.example contains placeholders only. Cloudflare D1 bindings and schema must be configured separately in an isolated environment. SQL schema files are source code, not database exports.

## Deployment and privacy

Publishing this repository does not deploy it. No GitHub workflows or repository webhooks were configured at the time of this sync, and the existing production Worker had no connected Git build. No automatic deployment configuration is added here. Deployment, production secrets, access grants, databases and hosted authentication changes require separate review.

Actual environment files, credentials, provider account configuration, local databases, private notes or attendee records, browser screenshots, test logs and generated build/cache files are excluded. Only public application assets and generated test fixtures are included. Never commit filled environment files or live configuration.

The photo flow is being tested locally using generated images and synthetic authentication. A separate bounded real Images encoder test passed. Remaining browser checks and hosted Clerk/SMS checks do not become verified merely by this source publication. Photo and organizer feature flags default off.
