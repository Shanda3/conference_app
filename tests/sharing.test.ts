// Test-only synthetic fixtures: no captured attendee records or real account identities.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as sharing from "../lib/sharing.ts";
import { profiles, scheduleShares } from "../lib/social-schema.ts";
import { emptyState, validateState } from "../lib/planner.ts";
import type { PlannerState } from "../lib/planner";
import type { SharedSchedule, VerifiedCatalog } from "../lib/sharing";

const catalog = JSON.parse(await readFile(new URL("../lib/event-data.json", import.meta.url), "utf8")) as VerifiedCatalog;
const NOW = "2026-10-11T20:00:00.000Z";
const PRIVATE_COMPANY = "PRIVATE PROFILE COMPANY";
const PRIVATE_LINKEDIN = "https://www.linkedin.com/in/private-profile-person";
const invalidCompanies: unknown[] = [null, false, 42, {}, [], "C".repeat(121), "Acme\nLabs", "Acme\rLabs", "Acme\tLabs", "Acme\u0000Labs", "Acme\u007fLabs"];
const invalidLinkedInUrls: unknown[] = [
  null, false, 42, {}, [],
  "http://www.linkedin.com/in/alex", "javascript:alert(1)", "//www.linkedin.com/in/alex",
  "https://evil.example/in/alex", "https://www.linkedin.com.evil.example/in/alex",
  "https://linkedin.com.evil.example/in/alex", "https://evil-linkedin.com/in/alex",
  "https://www.linkedin.com./in/alex", "https://sub.linkedin.com/in/alex",
  "https://user@www.linkedin.com/in/alex", "https://user:password@www.linkedin.com/in/alex",
  "https://@www.linkedin.com/in/alex", "https://www.linkedin.com@evil.example/in/alex",
  "https://www.linkedin.com:443/in/alex", "https://www.linkedin.com:8443/in/alex",
  "https://www.linkedin.com/in/alex?tracking=1", "https://www.linkedin.com/in/alex?",
  "https://www.linkedin.com/in/alex#details", "https://www.linkedin.com/in/alex#",
  "https://www.linkedin.com", "https://www.linkedin.com/in/", "https://www.linkedin.com/company/acme",
  "https://www.linkedin.com/in/alex/details", "https://www.linkedin.com/in/alex//",
  "https://www.linkedin.com/in/../alex", "https://www.linkedin.com/in/alex/../blair",
  "https://www.linkedin.com/in/%61lex", "https://www.linkedin.com/in/alex%2Fdetails",
  "https://www.linkedin.com/in/alex%3Ftracking", "https://www%2elinkedin.com/in/alex",
  "https:////www.linkedin.com/in/alex", "https:/www.linkedin.com/in/alex",
  "https://www.linkedin.com\\in\\alex", "https://www.linkedin.com/in/alex smith",
  "https://www.linked\nin.com/in/alex", "https://www.linkedin.com/in/alex\t",
];

function fixture(): PlannerState {
  const state = emptyState();
  state.initialized = true;
  const conf = catalog.conferences[0];
  state.conferences = [{ id: conf.id, name: "Private edited conference", timeZone: conf.timeZone, startDate: "2026-10-21", endDate: "2026-10-21", location: "Secret office", url: "https://example.com/private", description: "PRIVATE CONFERENCE DESCRIPTION" }];
  state.sessions = catalog.sessions.filter((entry) => entry.conferenceId === conf.id).slice(0, 2).map((entry) => ({ id: entry.id, conferenceId: conf.id, title: "PRIVATE MODIFIED TITLE", start: new Date(entry.start).toISOString(), end: new Date(entry.end).toISOString(), speaker: "PRIVATE SPEAKER", room: "PRIVATE ROOM", track: "PRIVATE TRACK", description: "PRIVATE DESCRIPTION", url: "https://example.com/private-session", sourceUrl: "https://example.com/private-source" }));
  state.sessions.push({ ...state.sessions[0], id: "user-created-private-session" });
  state.savedSessionIds = [state.sessions[0].id, state.sessions[2].id];
  state.sessionNotes = { [state.sessions[0].id]: "PRIVATE NOTES" };
  state.connections = [{ id: "private-person", conferenceId: conf.id, name: "PRIVATE CONTACT", role: "", company: "", status: "met", notes: "PRIVATE CONTACT NOTES", linkedInUrl: "https://example.com/private-contact", followUpDate: "" }];
  return state;
}

function expectedSchedule(): SharedSchedule {
  return sharing.projectSharedSchedule(fixture(), "Alex", catalog, NOW).preview;
}

test("additive profile migration preserves legacy names and supplies non-null empty private fields", async () => {
  const legacy = new DatabaseSync(":memory:");
  try {
    legacy.exec(await readFile(new URL("../drizzle/0001_lowly_phantom_reporter.sql", import.meta.url), "utf8"));
    legacy.prepare("INSERT INTO profiles (owner_id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)").run("legacy-owner", "Legacy chosen name", NOW, NOW);
    legacy.exec(await readFile(new URL("../drizzle/0002_sharp_nomad.sql", import.meta.url), "utf8"));
    assert.deepEqual({ ...legacy.prepare("SELECT * FROM profiles WHERE owner_id = 'legacy-owner'").get() }, {
      owner_id: "legacy-owner", display_name: "Legacy chosen name", created_at: NOW, updated_at: NOW, company: "", linkedin_url: "",
    });
    legacy.prepare("INSERT INTO profiles (owner_id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)").run("new-owner", "New chosen name", NOW, NOW);
    assert.deepEqual({ ...legacy.prepare("SELECT company, linkedin_url FROM profiles WHERE owner_id = 'new-owner'").get() }, { company: "", linkedin_url: "" });
    assert.throws(() => legacy.prepare("UPDATE profiles SET company = NULL WHERE owner_id = 'legacy-owner'").run(), /NOT NULL constraint/);
    assert.throws(() => legacy.prepare("UPDATE profiles SET linkedin_url = NULL WHERE owner_id = 'legacy-owner'").run(), /NOT NULL constraint/);
  } finally { legacy.close(); }
});

test("profile requires an explicitly chosen bounded display name and rejects extra fields", () => {
  assert.deepEqual(sharing.validateProfileBody({ displayName: "  Alex  " }), { displayName: "Alex" });
  assert.equal(sharing.validateDisplayName("A".repeat(60)).length, 60);
  assert.equal(sharing.validateDisplayName("<Alex & Friends>"), "<Alex & Friends>");
  for (const value of [null, 1, "", "   ", "A".repeat(61), "Alex\nSmith", "Alex\u0000", "\tAlex", "alex@example.com", "Alex <alex@example.com>"]) {
    assert.throws(() => sharing.validateProfileBody({ displayName: value }), sharing.SharingError);
  }
  for (const body of [{}, { displayName: "Alex", email: "secret@example.com" }, { displayName: "Alex", ownerId: "victim" }, null, []]) {
    assert.throws(() => sharing.validateProfileBody(body), sharing.SharingError);
  }
});

test("optional profile fields trim plain company text and canonicalize personal LinkedIn links", () => {
  assert.deepEqual(sharing.validateProfileBody({ displayName: "  Alex  ", company: "  Acme & Friends  ", linkedInUrl: "  https://linkedin.com/in/alex-smith-123  " }), {
    displayName: "Alex", company: "Acme & Friends", linkedInUrl: "https://www.linkedin.com/in/alex-smith-123",
  });
  assert.deepEqual(sharing.validateProfileBody({ displayName: "Alex", company: "   ", linkedInUrl: "   " }), { displayName: "Alex", company: "", linkedInUrl: "" });
  assert.deepEqual(sharing.validateProfileBody({ displayName: "Alex", company: "C".repeat(120), linkedInUrl: "" }), { displayName: "Alex", company: "C".repeat(120), linkedInUrl: "" });
  for (const linkedInUrl of ["https://www.linkedin.com/in/alex", "https://linkedin.com/in/alex/"]) {
    const result = sharing.validateProfileBody({ displayName: "Alex", company: "", linkedInUrl });
    assert.equal(result.linkedInUrl, "https://www.linkedin.com/in/alex");
  }
});

test("optional profile fields reject invalid types, control characters and deceptive LinkedIn URLs", () => {
  for (const company of invalidCompanies) {
    assert.throws(() => sharing.validateProfileBody({ displayName: "Alex", company, linkedInUrl: "" }), sharing.SharingError, `Accepted company ${JSON.stringify(company)}`);
  }
  for (const linkedInUrl of invalidLinkedInUrls) {
    assert.throws(() => sharing.validateProfileBody({ displayName: "Alex", company: "", linkedInUrl }), sharing.SharingError, `Accepted LinkedIn URL ${JSON.stringify(linkedInUrl)}`);
  }
  for (const extra of [{ email: "secret@example.com" }, { ownerId: "owner-b" }, { linkedIn: PRIVATE_LINKEDIN }]) {
    assert.throws(() => sharing.validateProfileBody({ displayName: "Alex", company: "Acme", linkedInUrl: PRIVATE_LINKEDIN, ...extra }), sharing.SharingError);
  }
});

test("public projection includes only saved canonical sessions and catalog-owned values", () => {
  const state = validateState(fixture());
  const { preview, excludedSessionCount } = sharing.projectSharedSchedule(state, "Alex", catalog, NOW);
  const canonical = catalog.sessions.find((item) => item.id === state.savedSessionIds[0])!;
  assert.equal(excludedSessionCount, 1);
  assert.equal(preview.sessions.length, 1);
  assert.deepEqual(Object.keys(preview).sort(), ["createdAt", "displayName", "sessions"]);
  assert.deepEqual(Object.keys(preview.sessions[0]).sort(), ["conferenceName", "end", "room", "speaker", "start", "timeZone", "title", "url"]);
  assert.equal(preview.sessions[0].title, canonical.title);
  assert.equal(preview.sessions[0].conferenceName, catalog.conferences[0].name);
  assert.equal(preview.sessions[0].room, canonical.room);
  assert.equal(preview.sessions[0].url, canonical.url);
  assert.doesNotMatch(JSON.stringify(preview), /PRIVATE|private-session|user-created|sessionNotes|connections|conferenceId|sourceId|sourceUrl|ownerId|email/);
});

test("projection ignores duplicate and unverified catalog entries", () => {
  const state = fixture();
  const duplicate = { ...catalog.sessions[0] };
  const custom = { ...catalog.sessions[0], id: "user-created-private-session", verifiedAt: "" };
  assert.equal(sharing.projectSharedSchedule(state, "Alex", { ...catalog, sessions: [...catalog.sessions, duplicate, custom] }, NOW).preview.sessions.length, 1);
  assert.equal(sharing.projectSharedSchedule(state, "Alex", { ...catalog, conferences: catalog.conferences.map((entry) => ({ ...entry, verifiedAt: "" })) }, NOW).preview.sessions.length, 0);
});

test("strict public snapshot validation rejects added secrets, unsafe links, dates and zones", () => {
  assert.deepEqual(sharing.validateSharedSchedule(expectedSchedule()), expectedSchedule());
  for (const mutate of [
    (p: Record<string, unknown>) => { p.ownerId = "private-owner"; },
    (p: Record<string, unknown>) => { p.email = "secret@example.com"; },
    (p: Record<string, unknown>) => { p.company = PRIVATE_COMPANY; },
    (p: Record<string, unknown>) => { p.linkedInUrl = PRIVATE_LINKEDIN; },
    (p: Record<string, unknown>) => { (p.sessions as Record<string, unknown>[])[0].notes = "private"; },
    (p: Record<string, unknown>) => { (p.sessions as Record<string, unknown>[])[0].url = "javascript:alert(1)"; },
    (p: Record<string, unknown>) => { (p.sessions as Record<string, unknown>[])[0].url = "https://user:secret@example.com"; },
    (p: Record<string, unknown>) => { (p.sessions as Record<string, unknown>[])[0].start = "2026-02-30T09:00:00.000Z"; },
    (p: Record<string, unknown>) => { (p.sessions as Record<string, unknown>[])[0].timeZone = "Not/AZone"; },
  ]) {
    const value = structuredClone(expectedSchedule()) as unknown as Record<string, unknown>;
    mutate(value);
    assert.throws(() => sharing.validateSharedSchedule(value), sharing.SharingError);
  }
});

test("share tokens contain 32 random bytes and are looked up only through SHA256", async () => {
  const tokens = new Set(Array.from({ length: 100 }, () => sharing.createShareToken()));
  assert.equal(tokens.size, 100);
  for (const token of tokens) {
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(Buffer.from(token, "base64url").byteLength, 32);
  }
  const token = [...tokens][0];
  const hash = await sharing.hashShareToken(token);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.notEqual(hash, token);
  let lookedUp = "";
  assert.deepEqual(await sharing.loadSharedSchedule(token, async (value) => { lookedUp = value; return { payloadJson: JSON.stringify(expectedSchedule()), revokedAt: null }; }), expectedSchedule());
  assert.equal(lookedUp, hash);
  assert.equal(await sharing.loadSharedSchedule("short", async () => { throw new Error("Should not query malformed tokens"); }), null);
  assert.equal(await sharing.loadSharedSchedule(token, async () => undefined), null);
  assert.equal(await sharing.loadSharedSchedule(token, async () => ({ payloadJson: JSON.stringify(expectedSchedule()), revokedAt: NOW })), null);
  assert.equal(await sharing.loadSharedSchedule(token, async () => ({ payloadJson: "PRIVATE corrupt content", revokedAt: null })), null);
});

// Current hosted-auth runtime coverage is verified separately with local Worker/D1 fixtures.
// The historical ChatGPT-auth injection harness remains recoverable in Git history.
