# ThunderPlains cleanup preparation

This change publishes no deletion job, provider calls, email delivery or recipient list. `lib/event-cleanup-review.ts` is a review-only helper and is not imported by the Worker scheduler or an API. The notice says the requested deadline is not yet scheduled; it must be revised if a later approved operation changes that status.

The conference ended October 21, 2026 at 5:30 p.m. America/Chicago. The requested 48-hour deadline is October 23 at 5:30 p.m. CDT, or October 23 at 22:30 UTC. The old unused seven-day planning stub is not a cleanup scheduler.

## Scope that requires action-time confirmation

The present account-deletion implementation deletes whole Devyo accounts, across conferences. It is not a ThunderPlains-only data purge. It removes owner-bound planner JSON (agendas, private notes, saved connections and preferences), profile/photo/avatar data, shared-plan projections and links, authored chat/talk/private-group messages, memberships, invitations, social settings and relationships, push subscriptions, read/reaction records and per-owner AI records. Relationships involving a deleted peer can disappear from a preserved account's social views.

The organizer exemption must be resolved to a verified Clerk user ID under the pinned production issuer and instance. A display name, moderator role, contact email listed on the website, or a key for a different test instance is insufficient. Inventory must include Clerk-only accounts without a planner, D1-only owners and accounts created after an earlier review. The review hash binds the instance, issuer, deadline, exemption and complete target inventory; a changed inventory needs a new review. No actual target manifest is included in this repository.

Existing self-service cleanup retains archived private-group names and owner references so remaining members keep read-only conversations. It also retains minimal account-deletion receipts that prevent stale-session restoration and anonymous money totals. Before a bulk operation, explicitly decide whether archived group metadata is retained, anonymized, or removed, and how the organizer's messages and access in other people's groups are preserved. Independently written notes/connections owned by the exempt organizer are preserved; they can still refer to other attendees. These boundaries must appear in the approved scope and confirmation wording.

Clerk identity removal must succeed (or an authoritative not-found result must be reconciled) before the existing transactional D1 cleanup reports completion. A group-metadata residual must not be treated as zero remaining active owner data. Backups, provider logs, safety receipts and independently saved copies are separate from active-data deletion. Whole-database recovery can also restore other users' removed records and lose later writes; do not promise selective restoration or use a backup rollback without a separately reviewed reconciliation plan.

## Success-only confirmation delivery

The requested sender is a verified `devyo.app` address; personal Gmail is not selected. A proposed address is `privacy@devyo.app`, but it is not currently verified or configured. Existing Clerk authentication emails do not establish arbitrary transactional sending capability.

Cloudflare Email Sending can use an existing Worker's native binding without a new API key. Before enabling it, approve and verify:

1. Current Workers Paid entitlement and account-specific daily sending quota.
2. Onboarding `devyo.app` under Compute > Email Service > Email Sending, reviewing bounce MX/SPF, DKIM and DMARC records. Preserve existing mail and Clerk DNS records; merge compatible policy records rather than blindly replacing them.
3. A dedicated `send_email` binding, restricted to the approved sender using `allowed_sender_addresses`, and reviewed delivery code. Do not enable generic public send endpoints. Domain and binding changes are separate from deletion authorization.
4. One verified recipient per message; no attendee addresses in CC/BCC, Git, browser bundles, logs, screenshots or public artifacts.

Published Workers Paid pricing includes 3,000 outbound emails/month, then $0.35/1,000; daily quotas can still constrain a new sending domain. DNS verification may require propagation. No upgrade, domain onboarding, binding, credential, send or quota request is performed by this change.

Prefer the verified primary email, then another verified email. A phone-only account needs a separately approved SMS route; count such production accounts before proposing a service. Do not reuse an authentication OTP as a deletion notice, guess an address or use an unverified phone number.

Proposed temporary-contact policy, requiring approval: capture only one verified destination immediately before an approved removal; retain it in access-controlled server-side storage until provider acceptance or at most 24 hours from capture, whichever comes first. This is an explicit, temporary exception to account-data removal, not implicit additional retention. Do not capture recipients before that policy is approved. Remove contact fields on expiry even if delivery failed, then report an undelivered notice without indefinite retries. Provider mail logs/queues may retain a destination under their policies separately.

A future private recipient/result manifest needs a schema version, reviewed scope hash, canonical target ID, contact channel/destination, capture/expiry times, identity-deletion and app-cleanup results, and a unique confirmation receipt. It must stay outside Git and public outputs. No actual contacts have been captured for this work.

Confirmation eligibility requires both verified identity deletion and completed transactional cleanup, zero remaining active owner data under the approved scope, a non-exempt target and an unexpired verified destination. A durable outbox must deduplicate by deletion receipt. Provider acceptance is not proof of inbox delivery. An uncertain send must be reconciled before any retry; the currently inspected Worker API does not establish a documented idempotency guarantee. No delivery adapter or outbox is activated here.

Confirmation should describe the actual active-data scope and retained boundaries, provide the organizer's contact, contain no marketing or tracking, and never promise to prevent unrelated spam. Tests must use synthetic identities and mocked transports without sending notices.

## Validation and publication

Tests cover the exact deadline, missing/wrong-instance exemption, identity-only accounts, changing inventory hashes, verified contact preference, header-injection rejection, incomplete cleanup, residual data, expired contacts and truthful before/after-deadline notice rendering. `/notes` reuses the existing authenticated planner, session boundary and private notes download. No production schedule or data edits are needed for tests.

Publishing the review branch does not activate cleanup or authorize deployment. Final counts and canonical exemption must be checked again at action time, followed by explicit approval of the permanent scope.

References checked October 23, 2026: [Cloudflare setup](https://developers.cloudflare.com/email-service/get-started/send-emails/), [binding restrictions](https://developers.cloudflare.com/email-service/configuration/send-bindings/), [pricing](https://developers.cloudflare.com/email-service/platform/pricing/), [sending limits](https://developers.cloudflare.com/email-service/platform/limits/), [D1 recovery retention](https://developers.cloudflare.com/d1/reference/time-travel/), [Clerk log retention](https://clerk.com/docs/guides/dashboard/logs/overview).
