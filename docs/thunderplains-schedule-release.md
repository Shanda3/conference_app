# ThunderPlains schedule update — October 14, 2026

The live ThunderPlains shared program was synchronized with the current Sessionize GridSmart feed linked by https://2026.thunderplainsconf.com/. The source was rechecked immediately before release.

All times below are October 21 in America/Chicago (CDT).

| Entry | Previous | Current |
| --- | --- | --- |
| Let's build our own Claude Code | 9:30–10:30 AM | 3:30–4:30 PM |
| How to build an Agent Harness for AI Code Review | 3:30–4:30 PM | 9:30–10:30 AM |
| Next generation web development with TanStack Start | 1:30–2:30 PM | 9:30–10:30 AM |
| Panel Discussion: AI Implementation Stories | Not listed | 1:30–2:30 PM, Room 301 CD |
| RAG for Data Engineers | Previously listed | Removed from the current published program; retained under its original ID |

No speakers or abstract were invented for the new panel. Disappearance from the feed is described as removal from the current program, not as an organizer-confirmed cancellation.

Fifteen matching canonical IDs remain unchanged. The panel has its own canonical ID and discussion route. The removed RAG entry retains its existing ID, saved choices, private notes and discussion identity. It is hidden from Explore, excluded from new share projections and conflict/duration calculations, and clearly warned about when retained in a saved agenda. Future checks retain this reviewed removal; newly missing scheduled entries still fail completeness checks.

The existing planner review flow remains deliberate: signed-in attendees reload, choose **Review updates**, then **Apply updates to my plan**. Only source-owned fields that match a known prior public version are updated. Personal descriptions, custom links, edited fields, choices, notes and connections remain intact. Previously created share links remain snapshots; a newly created link uses the current public program and excludes removed sessions.

InnoTech's public source row was verified byte-for-byte unchanged. Its previous incomplete-check status and last successful snapshot were preserved. The after-party remains October 21, 5:30–7:30 PM at Social Capital; Room 301 AB/CD corrections remain active.

## Release and verification

- Schedule-only source commit: `4c6b2b3`.
- Active Cloudflare Worker: `a6c3a5ff-d55d-4e31-b9aa-64ada9ac093e`, 100% traffic.
- All 21 existing bindings and variables compare equal to the preceding live version. Secrets, access settings, moderator configuration, Images binding, domains and cron were preserved.
- One guarded public-data transaction updated the ThunderPlains snapshot and five public history records. No attendee planner, note, connection or chat table was updated by this transaction.
- Verified live D1 result: 16 scheduled ThunderPlains entries plus one retained removed entry; InnoTech unchanged.
- 59 unit/render checks, TypeScript and production build passed. The existing isolated D1 schedule suite passed 13 checks. The exact production SQL passed SQLite atomic rollback, stale/repeat guard, unchanged InnoTech and private-sentinel checks.
- Publication-content scan and Gitleaks found no secrets or unapproved private content in the release source.

The final signed-in browser screen check is pending Mac unlock. Direct command-line HTTP checks received Cloudflare error 1010 (browser-signature rejection); no security protection was changed to bypass it. Deployment and live public data were verified through the existing authenticated Cloudflare CLI.

Communities and connection-notification work remains in its separate local branch. No social schema migration, feature-variable change or social release is included here.
