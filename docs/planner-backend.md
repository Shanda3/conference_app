# Planner data contract

`GET /api/planner` and `PUT /api/planner` require the existing Sites ChatGPT authentication. Both respond with private, non-cacheable JSON. Identity comes exclusively from `getChatGPTUser()`; request bodies cannot contain an owner ID.

## Storage

`db/schema.ts` defines `planner_states`: one `owner_id` primary-key row, `state_json`, integer `revision`, and `updated_at`. Enable the Sites D1 binding and generate/apply its migration before running against a new database. The implementation does not create tables at request time.

- A new owner receives `{ state: emptyState(), revision: 0 }`.
- PUT accepts exactly `{ state, revision }` and returns the normalized `{ state, revision }` with the incremented revision.
- Revision 0 writes use insert-on-conflict-do-nothing. Later writes use an owner-and-revision conditional update. Both are atomic single statements.
- A stale/concurrent save receives 409. Reload explicitly before trying to save new changes; do not silently retry a stale snapshot against a new revision.
- Authentication failures return 401, origin violations 403, invalid data 400, oversized requests 413, unsupported media type 415, and unavailable/corrupt storage 503.
- A streamed body limit of 500,000 bytes applies even without Content-Length.

## Model

`lib/planner.ts` exports `Conference`, `Session`, `Connection`, `ConnectionStatus`, `PlannerState`, `emptyState()`, `validateState()`, and date/conflict helpers. `validateState()` returns a fresh normalized state or throws `PlannerValidationError`. Unknown fields, broken references, repeated IDs, unsafe URLs, oversized text/lists, invalid dates, and out-of-conference sessions are rejected.

Notes have an 8,000-character limit. Conferences are limited to 100, sessions to 2,000, and connections to 1,000. URLs must be complete HTTP(S) links without embedded credentials. Links are never fetched by this API.

Source program metadata is separate from the persisted state. Explicitly project the allowed conference/session fields when preparing starter data; spreading raw source records preserves unsupported provenance fields and fails validation.

## Time and conflicts

Persist session instants as ISO UTC timestamps. Conference dates are inclusive local calendar dates in an IANA zone. A final session may end exactly at midnight following the last conference day.

`localToUtc(localInput, timeZone)` rejects nonexistent local times and repeated/ambiguous local times around DST changes. It does not silently shift the time or pick an offset. `formatLocalInput()` returns a datetime-local value in the chosen zone; `dateInZone()` returns that instant's local date.

`getConflicts(sessions, savedIds)` returns `[Session, Session][]` across every saved conference. Intervals include their start and exclude their end; adjacent sessions are not conflicts. Travel time is not included.

No API sends email, notifications, or connection information to other users.

## Verification

Run from the application directory:

```sh
node --experimental-strip-types --test tests/planner.test.ts
./node_modules/.bin/eslint lib/planner.ts db/schema.ts app/api/planner/route.ts tests/planner.test.ts
./node_modules/.bin/tsc --noEmit --incremental false
```

The tests use the actual route handler source with isolated in-memory auth/database adapters. They verify owner filtering, revision conflicts, origins, payload caps, and validation without touching a live account or database. They do not replace a deployed D1 smoke test or authentication-gateway verification.

## Profiles, chat, and sharing

The original private snapshot and revision model is unchanged. The additive `0001` migration adds profiles, share snapshots, conference chat memberships/messages, and private message flags.

- Profiles are keyed by authenticated owner ID. A display name must be explicitly chosen, is limited to 60 characters, and cannot be an email-shaped value. Account email is never copied to public content.
- Chat rooms are restricted to the verified conference catalog. Reading a room requires sign-in and explicit joining; posting additionally requires a saved profile. Responses omit owner IDs and only report whether each message is the current user's own message.
- Chat messages are rendered as plain text, at most 1,500 characters. A single atomic SQL statement enforces a two-second posting interval, six messages per minute, and 300 messages per day, across all rooms per account. Deleted messages still count toward the rate limit.
- Message deletion checks both the owner and room and clears its text. Hide/report records affect only the reporter's view. Reports are stored but no monitored moderation queue or automated enforcement is claimed.
- The client polls every five seconds only while the chat view is mounted and the document is visible. It displays the latest 100 visible messages. No third-party realtime service is used.
- Sharing is disabled by default. An authenticated owner reviews a canonical public-session projection before creating a link. The planner revision and a SHA-256 preview fingerprint bind approval to the exact reviewed profile name and public session details.
- Shared snapshots include only a chosen display name, snapshot timestamp, and verified public session details. Custom/private session fields, internal IDs, email, notes, and connections are never projected, even if a private session reuses a canonical ID.
- Link tokens have 32 random bytes. Only SHA-256 token hashes are stored. The full URL is returned once at creation; an independent random share ID allows owner-only revocation. Atomic SQL caps active links at 20 and creations at 10 per rolling day.
- `/share/[token]` is read-only and anonymous at the application layer, with no-store, no-referrer, and noindex headers. The private Sites audience still limits who can reach it. Revoked links return 404. Audience changes must be performed separately by the owner; `FRIEND_ACCESS_ENABLED` remains false for the private test build.

Additional checks:

- `node --experimental-strip-types --test tests/planner.test.ts tests/sharing.test.ts` runs all 51 source-level tests.
- After building and applying local migrations, `node --experimental-strip-types tests/social-worker-smoke.mjs` runs 62 real built-Worker/D1 HTTP checks with temporary test identities. It verifies canonical projection, anonymous share HTML/headers/revocation, profile-preview races, cross-user read/write isolation, plain-text chat, atomic concurrent sending limits, and preservation of original notes/connections/revisions. It writes ignored diagnostics under `.preview/` and closes its own server.

Hosted identity-gateway login and visual browser behavior have not been checked in this restricted executor. No hosted data, sharing policy, or external notifications are changed by these local tests.

### Optional private profile details

The additive `0002_sharp_nomad.sql` migration gives existing and new profiles empty company/LinkedIn defaults. `company` is trimmed plain text of at most 120 characters. `linkedInUrl` is blank or a direct HTTPS LinkedIn `/in/` profile URL; it is canonicalized to `www.linkedin.com` without a trailing slash. Credentials, ports, extra path segments, encoded path tricks, queries, and fragments are rejected before URL normalization. Links open with `noopener noreferrer`.

Both fields remain owner-private and do not participate in public profile names, chat sender payloads, share snapshots, or share preview hashes. A legacy display-name-only update preserves the saved fields, while explicit empty values clear them. The tests exercise the real SQL migration against a legacy row, cross-owner access boundaries, private-field omission from shared HTML, and live D1 persistence.
