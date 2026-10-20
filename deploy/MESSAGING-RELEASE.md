# Phone installation and messaging operations

Devyo supports an installable web app, member-only chat navigation, unread tracking, optional Web Push and emoji reactions. Installing the app does not subscribe a device to notifications. The planner's prominent installation banner remains until the browser supplies installation evidence; Safari tabs cannot universally detect an installed iPhone app.

## Configuration

The messaging migration is `sql/messaging-local-prepared.sql`. It depends on the existing chat/group, attendee-social and account-deletion schemas. It adds message ordering, reads/mute state, unique per-user reactions, browser subscriptions and a bounded delivery queue. Its identifier backfill does not rewrite existing messages, agendas, notes, profiles or memberships. Apply all indexes, cleanup/write guards and backfills before activation.

`DEVYO_MESSAGING_SCHEMA_READY=true` enables unread/reaction APIs after schema validation. Existing attendee-social and account-deletion schema gates must also be ready. Missing safeguards fail closed. Joined groups remain accessible before activation, without unread/reaction controls.

Web Push additionally requires:

- `DEVYO_PUSH_ENABLED=true` after configuration checks.
- `DEVYO_VAPID_PUBLIC_KEY`: an uncompressed 65-byte P-256 public point, URL-safe base64 without padding; a public Worker variable.
- `DEVYO_VAPID_PRIVATE_KEY`: the matching 32-byte private scalar, URL-safe base64 without padding; an encrypted Worker secret.
- `DEVYO_VAPID_SUBJECT`: a monitored `mailto:` contact.

Generate keys using a cryptographic library. Never commit or log a private key, write it into browser code or use public test vectors as operator keys. Keep the pair stable; rotation requires planned browser resubscription. Preserve unrelated secrets and bindings when updating a Worker.

## Privacy and delivery

No device is automatically subscribed. Permission is requested only after an explicit Enable action. Devices can pause, resume or unsubscribe; each joined chat can be muted separately. Account and membership cleanup revoke delivery capability and remove associated metadata.

Push-service requests carry an empty payload. Lock-screen alerts contain no private message text, sender or group names, private links or counts. Badge counts are fetched separately from the authenticated same-origin API. There is no service-worker fetch cache for account pages or authenticated APIs. An internet connection is required.

Delivery rechecks membership, blocking, account status, mute and unread state. Only recognized HTTPS browser-push hosts are accepted; redirects are not followed. Jobs expire after five minutes and retry at most three times. Expired subscriptions and 404/410 endpoints are removed. Delivery is best effort. The scheduled Worker handler retries pending work; successful message posts also start a background delivery pass.

## Release and recovery

Before database changes, record the active Worker version and confirm a D1 recovery bookmark. Validate prerequisites and object names before applying the additive migration. Keep push disabled while preparing the release. Preserve existing attendee data, access controls, routes and memberships.

If activation fails, disable the new feature flags first and retain cleanup safeguards. Keep additive tables/data for review rather than dropping them blindly. A full database restore can rewind later attendee activity and needs an explicit recovery decision.

Run `npm test`, TypeScript checks, `npm run build`, and the isolated Worker tests in `tests/messaging-d1.mjs` and `tests/attendee-social-d1.mjs`. In-memory interaction runners cover the install banner, mobile Chat and the existing tour; they use installed jsdom or `DEVYO_TOUR_JSDOM` pointing to its `api.js`. Fixtures intercept external requests and are not production authentication paths.

Real device checks require consenting testers and an appropriate private test conversation. Verify installation, permission refusal, background delivery, mute, unsubscribe, sign-out and deletion. Do not send test messages to general attendee rooms.

## Platform requirements

On iPhone/iPad, add Devyo to the Home Screen, open its icon and then enable notifications. Web Push needs iOS/iPadOS 16.4 or later and a direct user gesture. [WebKit guidance](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

Android launchers may show a notification dot rather than an exact unread number. In-app unread counts do not depend on OS badges. [Chrome badge guidance](https://developer.chrome.com/docs/capabilities/web-apis/badging-api).

Installation detection uses standalone mode, browser installation events and the same-origin related-app API where supported. An accepted prompt alone is not treated as successful installation, and no permanent guessed installation flag is stored. [Related-app detection](https://developer.chrome.com/docs/capabilities/get-installed-related-apps).

The server uses [RFC 8292 VAPID](https://www.rfc-editor.org/rfc/rfc8292.html). This feature requires no notification-vendor account or app-store enrollment; existing hosting usage limits still apply.
