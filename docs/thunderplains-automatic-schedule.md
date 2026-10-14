# Automatic ThunderPlains updates and conflict alerts

This release supersedes the earlier attendee-applied ThunderPlains review flow. The explicit instruction was to force the current official schedule for everyone, while preserving private attendee data.

The current official program is applied automatically to canonical ThunderPlains session titles, start/end times, rooms, speakers, tracks and descriptions. Existing custom links are retained. Session IDs, saved selections, notes, connections, private preferences, custom sessions, InnoTech and the organizer after-party are preserved. New official sessions become available without being automatically selected. The removed RAG session retains its original ID and notes with a removal warning.

## Server and stored plans

The initial guarded transaction updated all nine existing eligible plans. Aggregate verification found nine eligible, zero malformed, zero skipped and zero remaining stale plans. The transaction changed only session metadata and appended missing official records; it did not change saved selections, notes, connections, private-data revisions or save timestamps. Preserving revisions allows an existing client's pending note to save without an artificial revision conflict. Ordinary compare-and-swap protection still rejects a genuinely stale private-data revision.

Authenticated GET and PUT on the ThunderPlains planner reconcile against the current shared public program. Older clients therefore cannot persist outdated official session fields, even when their request also contains a new private note. Other conference origins and attendee-owned custom sessions remain outside this rule. GET returns a reconciled view; subsequent normal saves persist it. Future public-program changes do not require another bulk job to appear through this API.

## Browser behavior

The new client applies program refreshes on load, focus, reconnect, becoming visible and a 60-second visible/online interval. A tab that was already running the previous JavaScript version needs one reload. An offline device's already loaded memory cannot be remotely rewritten; current metadata is applied when it loads/refetches through the new version. Open note-editor drafts are not replaced by program refreshes.

ThunderPlains no longer requires Review updates acceptance. InnoTech retains its separate optional review flow.

## Conflict alert

The banner identifies newly overlapping saved pairs by comparing the previous and current official intervals for moved talks, retaining the same saved choices and custom meetings. Existing overlaps, back-to-back intervals, breaks, registration, receptions and removed sessions do not create a new schedule-change alert. The count is affected pairs, not the number of sessions. Review conflicts opens the agenda filtered to affected sessions; Show my full agenda restores the full view. The attendee decides which selection to remove. The banner clears when those conflicts are resolved.

The previous/current comparison uses public program history, not a retained historical copy of each attendee's private session edits. Announcement deduplication stores only the public schedule version under an account-scoped device key; the warning itself remains visible while affected conflicts exist. Account deletion clears these device hints. No emails, SMS or push notifications are sent.

## Verified release

- Automatic reconciliation implementation: `cddab7b`; alert implementation: `6687654`.
- Core automatic-sync Worker: `85f7494c-183f-41bf-b38f-f1a2bdbd4200`.
- Final active Worker: `d5209455-c266-406e-9e40-830768168744`, 100% traffic.
- 65 unit/render checks, TypeScript and production build passed.
- Eight real Worker-route requests against disposable D1 passed, covering authoritative reads, stale-source writes with pending private notes, stale revision rejection, owner/origin/session boundaries, the public change-history payload, and the exact idempotent backfill transaction.
- Actual Planner UI verified with synthetic plans: readable 320px banner, no horizontal overflow, 16px text, 49px review button, navigation to two affected cards, quiet repeat announcement after reload, banner removal after resolving a conflict, and no banner for the loaded unaffected plan. Synthetic private notes remained intact.
- Source privacy guard and Gitleaks found no unapproved private content or secrets; synthetic browser markers were absent from the production bundle.
- Existing deployment configuration was unchanged and uploaded with keep-vars; no access, DNS, Clerk, secrets, moderator grants or social-feature settings were changed. The optional version-detail read was rejected by automatic approval review, so final verification used deployment metadata and aggregate data checks without reading Worker variable values.

Direct live HTTP verification is limited: the CLI client received Cloudflare 1010, and the in-app browser blocked the public status URL. Live deployment and stored-plan convergence were verified through the existing authenticated Cloudflare CLI. The actual-route and visual behavior checks used isolated synthetic accounts; no real attendee selection was changed for a test.

No source was pushed to GitHub. Automatic approval review rejected public main-branch publication for missing explicit applicable authorization; that separate publication remains pending. Social features remain local and undeployed.
