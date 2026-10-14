# Attendee connections and communities — local release review

This change is based on the released schedule code at `b730414` (Worker `a6c3a5ff-d55d-4e31-b9aa-64ada9ac093e`). It is prepared locally only. It does not publish source, deploy a Worker, create a database, change Clerk, activate event cleanup, or send email/SMS/push notifications.

## Behavior

Saving an attendee through the reviewed connection form is an explicit action. The form discloses that a single in-app notice shares the sender's chosen display name and attendee-profile link, if the recipient allows notices. Connect-back opens another review form; it does not accept a relationship or save automatically. Notification responses contain no connection notes, company, email, phone, private LinkedIn, agenda, AI preferences, provider user ID, or session ID.

The new endpoint updates the private planner and creates the notice in one D1 transaction, guarded by the planner revision and verified authenticated account/session. It checks the exact origin, ThunderPlains event, both active accounts, both chosen profiles, the selected verified conference in both planners, and blocking. A missing sender name directs that account to Account settings. The client cannot supply owner or recipient account IDs. Other planner updates remain private and quiet.

Existing attendee connections are quietly recorded during migration. Later ordinary planner writes also record quiet receipts. The lifetime unique key is event/sender/recipient, so deleting and re-saving a connection, changing its conference, dismissing a notice, or unblocking someone never generates a repeat notice. Recipient opt-out permits private saves but suppresses notices and clears existing notices. Opting back in does not restore them.

Limits are one new attendee every 3 seconds, 6 per rolling minute and 50 per rolling 24 hours per sender, and 50 received notices per rolling 24 hours per recipient. Owner-only rate slots contain no peer identity or notification/connection ID. Removing a peer's account, blocking, dismissal and opt-out cannot reset another person's limits. Account deletion removes that account's own slots. Old slots expire on subsequent explicit saves.

My communities starts empty. The 19 choices are self-selected public labels for signed-in conference attendees, with distinct “I'm part of this community” and “Interested in joining” states. Membership is not verified. No group is joined and no information is sent to the external communities. Choices can be cleared, and directory filters use only explicitly saved labels. Private AI choices never infer memberships. OklahomAI OKC is one choice with `OK AI` and `Oklahoma AI` search aliases and the verified Meetup URL; there is no duplicate.

Blocking hides both accounts from each other's attendee directory/profile and profile images, and prevents notices. Blocked Gravatar access is rejected before any provider request. Existing group conversations, copied private contacts and separately shared schedule links are outside this block's scope; the UI explains this before blocking. Blocked accounts can be managed in Account settings.

## Exact migration

Apply `deploy/sql/attendee-social-prepared.sql` only after schema review and production authorization. It adds **5 tables, 5 indexes and 15 triggers** (25 exact definitions), plus a quiet backfill. It does not alter or rewrite existing planner/profile content or generate notifications.

| Table | Purpose |
| --- | --- |
| `attendee_social_settings` | Owner/event notification opt-out and revision-checked community settings writes. |
| `attendee_communities` | Explicit owner/event/group labels and member/interested relationship. |
| `attendee_blocks` | Owner/event blocked-peer records. |
| `attendee_connection_events` | One durable sender/recipient receipt per event; notification/read/dismiss state, with quiet legacy receipts. |
| `attendee_connection_limits` | Owner-only sent/received activity timestamps, without peer or notification identifiers. |

The triggers enforce eligibility and rate limits, record private activity slots, keep delivery timestamps immutable, make legacy saves quiet, hide notices on block/opt-out, prevent writes during account deletion, and immediately remove a closing account's projections. Final account cleanup also detects and removes all five tables' account-bound data. Other owners' planners, badges and private activity counts are preserved.

Prerequisites are the existing `DB` binding and reviewed planner/profile/community/account-deletion schema, including `profiles.linkedin_visible`. `lib/attendee-social-schema.ts` contains hashes of every expected normalized SQLite definition. Missing or altered definitions cause the new service to fail closed. Do not work around a mismatch by disabling the checks.

## Feature variables

All three default to `false` in `.env.example`; they are ordinary feature variables, not credentials.

| Variable | Purpose |
| --- | --- |
| `DEVYO_ATTENDEE_SOCIAL_SCHEMA_READY` | Enables use of the reviewed social schema and privacy/block controls; also requires the existing account-deletion schema-ready setting. |
| `DEVYO_CONNECTION_NOTIFICATIONS_ENABLED` | Enables explicit transactional attendee saves and the in-app notification screen/polling. |
| `DEVYO_COMMUNITIES_ENABLED` | Shows public self-selected badges, directory filters and the community chooser. |

Do not change Clerk, sign-in policy, SMS settings, moderator grants, existing photo bindings/variables, hostnames, production secrets, program sync or cron settings for this feature.

## Authorized production release sequence

1. Finish the outstanding browser checks and review the source/migration. Production implementation of the scoped social features was explicitly authorized; public GitHub publication remains blocked pending the specific applicable authorization. Do not retry the rejected public push.
2. Read the target D1 schema without exposing attendee data. Verify the prerequisite tables/column and whether any of the 25 new definitions already exist. Apply the reviewed migration once; after an uncertain result, compare exact definitions rather than dropping or blindly recreating tables.
3. Upload this code with new public features disabled and preserve the existing Worker variables, secrets, bindings and role configuration. Applying the migration while older code is still running is quiet: its planner writes create only legacy receipts.
4. Verify all expected definitions and enable schema readiness. Validate the new authenticated service, anonymous denial and existing account/photo/talk flows before enabling either public feature. No real attendee save is needed for read-only hosted checks.
5. Enable notifications and/or communities only as approved. Complete a consented hosted test with approved test accounts before broad release; local synthetic auth is not a live Clerk/SMS verification.

## Pause and rollback

To pause, set the two public feature switches to `false` while retaining schema readiness and this privacy/cleanup-aware code. Public badges disappear; existing choices remain available to their owner for removal. Blocking, opt-out and account cleanup continue to work. No notices are generated while notifications are paused.

After any writes, do **not** roll back to code that ignores social blocks or cleanup, set schema readiness to false as a privacy workaround, drop the new tables/triggers, or restore a backup that loses notification receipts/quota history. These actions can disregard privacy choices, leave account data behind or permit repeat notices. A full rollback needs a separately reviewed data/cleanup plan.

## Verification and remaining limits

The actual Worker routes with disposable D1 and synthetic verified-context accounts exercise authorization/origin/session/event checks, private projections, atomic saves, concurrent duplicates, quiet legacy/manual saves, opt-out/blocking, removal, read/dismiss ownership, daily limits across restart and peer deletion, malformed legacy data, tampered schema, paused-feature controls, and account deletion while preserving another owner's data. Unit/render checks cover explicit community validation, verified URLs/aliases, escaped names and bounded bodies. See the private local readiness evidence for final counts.

Browser checks completed before the Mac locked include desktop 1280px notices/review disclosure; 320px notices, keyboard save and scrolling dialog; and 390px directory/filter/settings, aliases, explicit labels, recipient projection, profile navigation and dismissal. A narrow-screen explanation/link wrap was corrected. The opt-out save and removal of notices after Refresh were verified with synthetic accounts; immediate unread-count refresh was then fixed and rebuilt, but the refreshed UI behavior still needs verification. Block confirmation/unblock, cleared-badge cross-account removal, delete/re-save through the UI and final refreshed layouts remain unverified. On resumption the Mac was available, but the browser confirmation API timed out/reset, and native fallback stopped when user activity switched Chrome to the official conference page. Do not claim these UI checks passed. Arrange a short uninterrupted browser window before completing them.

No real provider sign-in, SMS delivery, multi-user hosted test or production capacity guarantee is implied. The automatic seven-day event purge is still off. Any future event cleanup must include these five tables and requires its own reviewed implementation before an automatic deletion promise can be treated as fulfilled.


The combined local source passes 66 unit/render checks and TypeScript; the production build passes. The actual isolated social Worker/D1 suite passes 124 requests with synthetic identities and blocked provider calls. The deployed schedule is preserved; no social production schema, variables or Worker release has been applied. The schedule review remains attendee-applied by design.
