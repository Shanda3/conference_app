# Export note

This sanitized source omits the original Site identity. The intended domain is `devyo.app` (owner-reported); no hosting, DNS, or authentication migration has occurred. The existing Sites gateway requirement remains in force.

# Cloudflare and managed-auth portability notes

This is an implementation inventory, not an authentication migration. The current private test deployment still uses the Sites identity gateway. No new identity provider, Cloudflare account resource, OAuth application, persistent credential, audience change, or password system has been created.

## Already portable

- Runtime: Cloudflare Workers through Vinext, using the supported Sites build integration.
- Storage: D1/SQLite, with checked-in Drizzle schema and additive migrations.
- Private ownership: immutable owner IDs key planner snapshots, profiles, chat membership, messages, flags, and schedule links.
- Public read-only schedules: random bearer link tokens stored only as SHA-256 hashes; projection excludes all private profile and planner fields.
- Frontend: ordinary React forms, navigation, same-origin fetches, and short polling. No external realtime service or payment provider is required.

## Identity boundary to replace when a managed provider is selected

`app/chatgpt-auth.ts` is the only source of application identity. It currently trusts the identity headers supplied by the Sites gateway. Those headers MUST NOT be trusted directly on an independent public Worker. Keep the current Sites path unchanged until the replacement deployment has a verified managed-auth adapter.

The future adapter must validate the selected provider's signed token or server-side session using the provider's supported Worker integration. Validate issuer, audience, expiry, and the immutable subject; fail closed. Map that subject to a stable app owner ID. Do not key ownership on email, editable display name, company, or LinkedIn URL.

Use a managed login/session flow rather than implementing passwords, password reset, email delivery, or OAuth token storage from scratch. Where cookie sessions are used, keep them Secure, HttpOnly, appropriately SameSite, short-lived, and protected against cross-origin mutation. Preserve every existing API's owner filters, request-size checks, and same-origin validation.

## Preserve existing records

A new provider's subject will not equal the current per-Site owner ID. Before changing authentication, define an explicit account-linking or migration step that proves control of both identities. Never merge accounts solely because their email addresses or profile fields match. Test existing saved agendas, private notes/connections, chat ownership, report/hide rows, and revocation rights after mapping. Existing public snapshot links should remain revocable by their original verified owner.

Back up D1 and retain the immutable migration history before a deployment migration. Apply migrations in order and test rollback/recovery without deleting user records. Deploy a private staging instance first; move real audience access only after the owner approves it.

## Configuration and verification still required

The independent auth research task determines the supported managed provider and its current Cloudflare setup. Before implementation, confirm: provider account, tenant/domain, redirect URLs, session handling, sign-in choices, registration restrictions, cost limits, required secrets, and how the owner will approve/manage credentials. Keep keys out of source and browser bundles.

Required verification includes two real attendee identities without ChatGPT accounts, anonymous shared-link reads and revocation, CSRF rejection, expired sessions, logout, cross-account isolation, and preservation of existing owner data. Local test identity headers are a test fixture only and cannot establish that a hosted gateway is secure.

## New private profile fields

`profiles.company` and `profiles.linkedin_url` are optional strings, defaulting to empty on existing rows. Neither contributes to public schedule projections, preview fingerprints, chat sender payloads, or identity matching. Legacy profile updates that contain only a display name preserve these stored values. This remains true under any future auth provider.
