# Per-talk discussions: live release

This feature was approved and deployed on October 14, 2026 as Worker version 988b8a55-099b-4f3a-bb0c-f481306423e5. The baseline was GitHub main 5484ba3 and Worker version 9846bb71-dad1-45c6-a8c1-ed706b2a5a41. The live photo feature is retained. The organizer/directory WIP and canceled sign-in persistence task are excluded.

## Attendee experience

Canonical talk cards and details offer Join discussion. Each opens its own full-page mobile discussion. Joining is an explicit step; reading the welcome screen creates no membership. A saved display name is required. Only messages deliberately typed into the composer are posted. Notes, agenda contents, connections, email and AI preferences are not inputs to the discussion API. No attachments, email/SMS notices, browser notifications or subscriptions are created.

Rooms are fixed to the ThunderPlains conference site and a bundled, verified conference/session pair, including supported InnoTech talks in that planner. Custom sessions and non-talk entries such as breaks and registration have no discussion. The room heading uses the canonical public title, rather than an attendee's private edits. New canonical sessions require a source update.

## Access, limits and moderation

Every endpoint requires the server-verified Clerk attendee identity, the fixed conference event, matching client user/session pins, and exact-origin mutations. The client drops stale identity responses. The server renders no HTML from user content; React escapes message/name/reason text. Only HTTPS URLs without embedded credentials become links, with no referrer and safe external-link attributes.

Posting limits are persisted in the shared chat-message table: 1,500 characters, at least two seconds apart, six per minute and 300 per day across conference and talk rooms. Deleted-message tombstones still count. Owner-and-room-scoped retry IDs prevent duplicates after an uncertain result. Reporting allows 300-character reasons, at most 30 new reports daily and ten hide/report writes per minute. Repeated reports are idempotent.

The new central /discussion-moderation queue is available only to an explicitly configured moderator. No organizer or moderator privileges are granted by installation. Moderators see reported message text, chosen display names and report reasons; reporter IDs, private profiles and notes are excluded. They can remove text for everyone or resolve reports while preserving each reporter's personal hide. Both actions require a review reason and create an audit record. Moderators must be assigned and the queue staffed before activation. Empty or malformed moderator configuration fails closed.

## Schema and production approval

The additive migration deploy/sql/talk-discussions-prepared.sql adds two tables, four indexes and six triggers. It reuses existing chat_messages, chat_memberships and chat_flags. It does not copy attendee records, delete data, change credentials or grant roles. Existing account-deletion receipt triggers are required.

Future rollouts require approval before applying this migration to devyo-production-db, deploying the code to devyo-production, activating DEVYO_TALK_DISCUSSIONS_ENABLED=true and DEVYO_TALK_DISCUSSIONS_SCHEMA_READY=true, and assigning verified named Clerk user IDs in DEVYO_TALK_MODERATOR_USER_IDS. The latter grants access to reported talk messages and their reasons, plus rights to remove text from canonical talk messages and resolve reports, until the ID is removed or the feature is paused. It grants no organizer access and no rights over private agendas, notes, account data or photos. Exactly one current server-verified attendee account was approved and assigned talk-chat moderation. Its identifier and verified login methods are private deployment evidence and are not published here. The example environment remains off with an empty moderator list.

An approved rollout should preserve existing secrets, vars, Images/D1 bindings, routes and cron; deploy disabled first, check the existing hosted sign-in and photo controls, then activate only after the schema and named moderator configuration are verified. Inspect live discussion/read/report access without real account deletion or unnecessary SMS. Keep all provider configuration out of Git.

For a safe pause, set DEVYO_TALK_DISCUSSIONS_ENABLED=false while retaining the discussion-aware, photo-aware code and schema. This preserves cleanup of moderator audit records. Do not roll back to pre-discussion code after audit writes without checking deletion compatibility.

## Retention and account deletion

Messages are not private notes. They are visible to other signed-in attendees who explicitly join the discussion. Removing a message clears its text for everyone; the owner/name/timestamp tombstone remains for persisted rate limits until account cleanup. Moderator removal similarly clears text and retains an audit until its associated message/author or moderator account is cleaned up. Resolving a report clears its reason and keeps a non-text reviewed-report marker so the personal hide and daily report quota remain effective.

A self-service deletion request immediately blocks the closing account and invalidates room ETags so others' next refresh excludes its messages. After Clerk identity deletion is confirmed, the existing transactional cleanup removes that owner's talk messages, memberships and flags, flags on their messages, and associated moderation audit records. Other attendees' data and photos are preserved. Canonical room metadata is not personal data. Existing minimal deletion receipts and provider backup retention are governed by the existing deletion process.

Seven-day automatic event-wide purge remains off. This feature does not enable it or promise automatic event-wide deletion. The discussion UI states this accurately.

## Polling and verification limits

Only an open, joined, visible and online discussion polls. Active polling averages 15 seconds with jitter; after three unchanged conditional responses it slows to 30 seconds, and errors back off to 60 seconds. Requests do not overlap. Hidden tabs stop issuing polls, and visibility/online restoration triggers a check. Unchanged rooms return a private/no-store 304 with no message payload. Moderation polling uses the quieter interval. No subscription service is added.

At 200–300 simultaneously active discussion viewers, nominal polling is about 13–20 requests per second, or roughly 384,000–576,000 requests over an eight-hour day before idle/hidden-tab reductions. This uses the existing Worker/D1 resources; it is an estimate, not a claim that usage is free or a hosted capacity guarantee. The local fixture includes a 300-attendee conditional-read burst. Hosted latency, ongoing billing/quotas, real Clerk sessions and mobile operating-system keyboards still require release verification.

Validation commands: npm test; npx tsc --noEmit; npm run build; node tests/talk-discussion-d1.mjs. The local browser fixture tests/talk-discussion-browser-stage.mjs uses synthetic attendees and must never be deployed. Screenshots, local databases and execution traces remain outside Git.

## Hosted rollout verification

All 12 additive schema definitions were verified. The disabled stage preserved encrypted secrets, unrelated dashboard variables and existing photo bindings. The current attendee account was verified using a temporary server account-ID view with matching Clerk client identity and masked verified login methods; that view was removed before activation. The existing signed-in sign-in route returned to the planner and the Add image control loaded. The enabled version serves all production traffic. The live discussion link, explicit join screen, moderator navigation and moderator report queue were verified with the approved existing account. No real discussion messages were posted, no real account was deleted and no SMS was sent during verification. Anonymous discussion/photo requests returned 401 and off-site writes returned 403. Local validation passed 55 unit/render tests, TypeScript, build and 415 Worker/D1 fixture requests. Two-user hosted isolation and real mobile operating-system keyboards were not exercised.
