# Devyo conference planner

Devyo is a ThunderPlains and Techlahoma conference planner with registered attendee accounts, private agendas and notes, connections, group conversations and revocable schedule sharing.

This branch contains the sanitized source associated with the live Cloudflare version a232881b-d253-4b30-abcb-50d03bc82248, released October 13, 2026.

## Local development

Use Node.js 24 and the locked npm dependencies. Run npm ci, npm test, npx tsc --noEmit, and npm run build. Runtime authentication requires privately supplied Clerk configuration. The public .env.example contains placeholders only. Cloudflare D1 bindings and schema must be configured separately in an isolated environment. SQL schema files are source code, not database exports.

## Deployment and privacy

Publishing this repository does not deploy it. No GitHub workflows or repository webhooks were configured at the time of this sync, and the existing production Worker had no connected Git build. No automatic deployment configuration is added here. Deployment, production secrets, access grants, databases and hosted authentication changes require separate review.

Actual environment files, credentials, provider account configuration, local databases, private notes or attendee records, browser screenshots, test logs and generated build/cache files are excluded. Only public application assets and generated test fixtures are included. Never commit filled environment files or live configuration.
