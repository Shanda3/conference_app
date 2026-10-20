# Connections design review

These screenshots render the actual directory/profile components with invented attendees and initials. They contain no production attendee data or reference-image photos. They are component previews, not signed-in production screenshots.

- [Attendee directory](connections-attendees.png)
- [Attendee profile](connections-profile.png)
- [Private saved connections](connections-saved.png)

The attendee directory exposes only existing shared display names, avatars, optional LinkedIn links, community choices and shared schedules. Job titles, company, location, email and phone are not added to the public projection. Notes in a profile come only from the viewer's own saved connection and remain private.

Generate HTML previews with `node tests/connections-visual-preview.mjs <output-directory>`. The preview uses synthetic initials instead of requesting account images. Interaction tests use `tests/connections-directory-dom.mjs` and the existing planner test runner.
