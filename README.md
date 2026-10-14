# Devyo conference planner

Devyo is a ThunderPlains and Techlahoma conference planner with registered attendee accounts, private agendas and notes, connections, group conversations and revocable schedule sharing.

This branch contains the sanitized source associated with live Cloudflare version 988b8a55-099b-4f3a-bb0c-f481306423e5, released October 14, 2026. The release includes private-by-default profile photos and per-talk attendee discussions. The organizer, attendee filtering and self-identity work remains on the WIP branch.

## Local development

Use Node.js 24 and the locked npm dependencies. Run npm ci, npm test, npx tsc --noEmit, and npm run build. Runtime authentication requires privately supplied Clerk configuration. The public .env.example contains placeholders only. Cloudflare D1 bindings and schema must be configured separately in an isolated environment. SQL schema files are source code, not database exports.

## Deployment and privacy

Publishing this repository does not deploy it. No GitHub workflows or repository webhooks were configured at the time of this sync, and the existing production Worker had no connected Git build. No automatic deployment configuration is added here. Deployment, production secrets, access grants, databases and hosted authentication changes require separate review.

Actual environment files, credentials, provider account configuration, local databases, private notes or attendee records, browser screenshots, test logs and generated build/cache files are excluded. Only public application assets and generated test fixtures are included. Never commit filled environment files or live configuration.

## Profile photos

New and replacement photos start private. Attendees can crop a still JPEG, PNG or WebP in their browser; only the bounded crop is uploaded and sanitized into a 512-pixel WebP. Showing a photo to signed-in ThunderPlains attendees is a separate choice. Initials and Gravatar remain separate fallback choices.

The release requires the reviewed additive schema in deploy/sql/profile-photos-local.sql, a DEVYO_PROFILE_IMAGES binding, and the three explicitly configured photo feature variables. The example environment remains disabled by default. Limits are 10 processing attempts per account per UTC day, 2,000 per UTC month across the app, and 500 stored photos. The monthly budget is reserved before image output processing and is never refunded.

To pause uploads, keep this photo-aware code and its schema, and set DEVYO_PROFILE_PHOTOS_ENABLED to false. Retain DEVYO_PROFILE_PHOTOS_SCHEMA_READY=true so privacy preferences and account-deletion cleanup remain supported. Rolling back to pre-photo code after photo writes could disregard photo privacy choices or cleanup. No rollback command or live provider configuration is committed.

Validation: 49 unit/model tests, TypeScript and the production build passed. The separate local D1 fixture exercised 74 photo requests and the real managed image-processing test completed two transformations. Hosted verification used an existing signed-in account: account settings and the sign-in return flow worked, the photo settings loaded with the real client session pins, and Add image was enabled. Anonymous photo access returned 401 and off-site writes returned 403. No real production profile was edited; a fresh SMS sign-in and two-user hosted isolation were not exercised.

## Talk discussions

Talk cards and details open their own attendee discussion. Joining and posting are explicit, and private notes and AI preferences are not shared. The approved moderator can review reports at /discussion-moderation. Moderator identities are configured privately and are excluded from this repository. See [release, limits and retention details](docs/talk-discussions-release.md). Automatic seven-day event purge remains off.
