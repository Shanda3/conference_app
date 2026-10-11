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
// @ts-expect-error Node's native TypeScript runner requires the .ts extension.
import * as sharing from "../lib/sharing.ts";
// @ts-expect-error Node's native TypeScript runner requires the .ts extension.
import { profiles, scheduleShares } from "../lib/social-schema.ts";
// @ts-expect-error Node's native TypeScript runner requires the .ts extension.
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

// Run actual route SQL against SQLite through a minimal D1 adapter. Identity is
// mocked; no hosted database or account is accessed. This tests ownership and
// the atomic conditional INSERT, rather than replacing those checks with stubs.
const sqlite = new DatabaseSync(":memory:");
sqlite.exec(`
  CREATE TABLE profiles (owner_id TEXT PRIMARY KEY, display_name TEXT NOT NULL, company TEXT NOT NULL DEFAULT '', linkedin_url TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE planner_states (owner_id TEXT PRIMARY KEY, state_json TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE schedule_shares (token_hash TEXT PRIMARY KEY, share_id TEXT NOT NULL UNIQUE, owner_id TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT);
`);
let beforeExecute: ((query: string) => void) | undefined;
const d1 = {
  prepare(query: string) {
    return {
      bind(...params: unknown[]) {
        const execute = (kind: "run" | "all" | "raw") => {
          beforeExecute?.(query);
          const statement = sqlite.prepare(query);
          if (kind === "raw") statement.setReturnArrays(true);
          return kind === "run" ? statement.run(...params as (string | number | null)[]) : statement.all(...params as (string | number | null)[]);
        };
        return {
          run: async () => ({ success: true, meta: execute("run") }),
          all: async () => ({ success: true, results: execute("all") }),
          raw: async () => execute("raw"),
        };
      },
    };
  },
};
const db = drizzle(d1 as unknown as D1Database);
const plannerStates = sqliteTable("planner_states", { ownerId: text("owner_id").primaryKey(), stateJson: text("state_json").notNull(), revision: integer("revision").notNull(), updatedAt: text("updated_at").notNull() });
let currentUser: { userId: string; email: string; displayName: string } | null = { userId: "owner-a", email: "secret-a@example.com", displayName: "secret-a@example.com" };
const adapter = { ...sharing, and, asc, desc, eq, isNull, sql, getChatGPTUser: async () => currentUser, getDb: () => db, plannerStates, profiles, scheduleShares, verifiedCatalog: catalog, validateState, notFound: () => { throw new Error("NOT_FOUND"); } };
(globalThis as unknown as Record<symbol, unknown>)[Symbol.for("sharing-test-adapter")] = adapter;
async function loadRoute(path: string) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const injectable = source.replace(/^import .*;\n/gm, "");
  const compiled = ts.transpileModule(`const { ${Object.keys(adapter).join(",")} } = globalThis[Symbol.for("sharing-test-adapter")];\n${injectable}`, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    fileName: path,
  }).outputText.replace('"react/jsx-runtime"', JSON.stringify(import.meta.resolve("react/jsx-runtime")));
  return await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
}
const profileRoute = await loadRoute("../app/api/profile/route.ts") as { GET: () => Promise<Response>; PUT: (r: Request) => Promise<Response> };
const sharesRoute = await loadRoute("../app/api/shares/route.ts") as { GET: (r: Request) => Promise<Response>; POST: (r: Request) => Promise<Response>; DELETE: (r: Request) => Promise<Response> };
const page = await loadRoute("../app/share/[token]/page.tsx") as { default: (props: { params: Promise<{ token: string }> }) => Promise<React.ReactNode>; metadata: { robots: { index: boolean; follow: boolean }; referrer: string }; dynamic: string; revalidate: number };
function request(path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://compass.example${path}`, { method, headers: { "Content-Type": "application/json", Origin: "https://compass.example", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
function reset() {
  sqlite.exec("DELETE FROM profiles; DELETE FROM planner_states; DELETE FROM schedule_shares;");
  beforeExecute = undefined;
  currentUser = { userId: "owner-a", email: "secret-a@example.com", displayName: "secret-a@example.com" };
}
async function seed(ownerId = "owner-a") {
  sqlite.prepare("INSERT INTO profiles (owner_id, display_name, company, linkedin_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(ownerId, ownerId === "owner-a" ? "Alex" : "Blair", PRIVATE_COMPANY, PRIVATE_LINKEDIN, NOW, NOW);
  sqlite.prepare("INSERT INTO planner_states VALUES (?, ?, ?, ?)").run(ownerId, JSON.stringify(validateState(fixture())), 1, NOW);
}
async function create() {
  const preview = await (await sharesRoute.GET(request("/api/shares?preview=1"))).json() as { previewHash?: string };
  return sharesRoute.POST(request("/api/shares", "POST", { revision: 1, previewHash: preview.previewHash ?? "0".repeat(64) }));
}
async function created() {
  const response = await create();
  assert.equal(response.status, 201, await response.clone().text());
  return await response.json() as { path: string; shareId: string; preview: SharedSchedule };
}
function lookup(hash: string) {
  return Promise.resolve(sqlite.prepare("SELECT payload_json AS payloadJson, revoked_at AS revokedAt FROM schedule_shares WHERE token_hash = ?").get(hash) as { payloadJson: string; revokedAt: string | null } | undefined);
}

test("all profile and share management routes require authenticated identity", async () => {
  reset(); currentUser = null;
  for (const response of [await profileRoute.GET(), await profileRoute.PUT(request("/api/profile", "PUT", { displayName: "Alex" })), await sharesRoute.GET(request("/api/shares")), await create(), await sharesRoute.DELETE(request("/api/shares", "DELETE", { shareId: crypto.randomUUID() }))]) assert.equal(response.status, 401);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM profiles").get()!.n, 0);
});

test("profile API never falls back to auth email and persists only the owner's chosen name", async () => {
  reset();
  assert.deepEqual(await (await profileRoute.GET()).json(), { profile: null });
  const response = await profileRoute.PUT(request("/api/profile", "PUT", { displayName: "  Alex  " }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { profile: { displayName: "Alex", company: "", linkedInUrl: "" } });
  assert.match(response.headers.get("Cache-Control")!, /no-store/);
  assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
  currentUser = { userId: "owner-b", email: "secret-b@example.com", displayName: "secret-b@example.com" };
  assert.deepEqual(await (await profileRoute.GET()).json(), { profile: null });
  assert.equal((await profileRoute.PUT(request("/api/profile", "PUT", { displayName: "Blair", ownerId: "owner-a" }))).status, 400);
  assert.equal((await profileRoute.PUT(request("/api/profile", "PUT", { displayName: "Blair" }))).status, 200);
  assert.equal(sqlite.prepare("SELECT display_name FROM profiles WHERE owner_id = 'owner-a'").get()!.display_name, "Alex");
});

test("profile API persists private fields, isolates owners, and preserves fields omitted by legacy clients", async () => {
  reset();
  const original = { displayName: "Alex", company: PRIVATE_COMPANY, linkedInUrl: PRIVATE_LINKEDIN };
  const saved = await profileRoute.PUT(request("/api/profile", "PUT", { displayName: " Alex ", company: ` ${PRIVATE_COMPANY} `, linkedInUrl: PRIVATE_LINKEDIN.replace("www.", "") }));
  assert.equal(saved.status, 200);
  assert.deepEqual(await saved.json(), { profile: original });
  assert.deepEqual(await (await profileRoute.GET()).json(), { profile: original });
  assert.deepEqual({ ...sqlite.prepare("SELECT display_name, company, linkedin_url FROM profiles WHERE owner_id = 'owner-a'").get() }, { display_name: "Alex", company: PRIVATE_COMPANY, linkedin_url: PRIVATE_LINKEDIN });
  const legacy = await profileRoute.PUT(request("/api/profile", "PUT", { displayName: "Alex updated" }));
  assert.equal(legacy.status, 200);
  assert.deepEqual(await legacy.json(), { profile: { ...original, displayName: "Alex updated" } });
  assert.deepEqual(await (await profileRoute.GET()).json(), { profile: { ...original, displayName: "Alex updated" } });
  currentUser = { userId: "owner-b", email: "secret-b@example.com", displayName: "secret-b@example.com" };
  assert.deepEqual(await (await profileRoute.GET()).json(), { profile: null });
  const other = await profileRoute.PUT(request("/api/profile", "PUT", { displayName: "Blair" }));
  assert.equal(other.status, 200);
  assert.deepEqual(await other.json(), { profile: { displayName: "Blair", company: "", linkedInUrl: "" } });
  assert.deepEqual(await (await profileRoute.GET()).json(), { profile: { displayName: "Blair", company: "", linkedInUrl: "" } });
  currentUser = { userId: "owner-a", email: "secret-a@example.com", displayName: "secret-a@example.com" };
  const cleared = await profileRoute.PUT(request("/api/profile", "PUT", { displayName: "Alex updated", company: "", linkedInUrl: "" }));
  assert.equal(cleared.status, 200);
  assert.deepEqual(await cleared.json(), { profile: { displayName: "Alex updated", company: "", linkedInUrl: "" } });
  assert.deepEqual(await (await profileRoute.GET()).json(), { profile: { displayName: "Alex updated", company: "", linkedInUrl: "" } });
});

test("profile API rejects invalid optional fields without changing any existing private value", async () => {
  reset(); await seed();
  const before = sqlite.prepare("SELECT * FROM profiles WHERE owner_id = 'owner-a'").get();
  for (const company of invalidCompanies) {
    const response = await profileRoute.PUT(request("/api/profile", "PUT", { displayName: "Changed name", company, linkedInUrl: PRIVATE_LINKEDIN }));
    assert.equal(response.status, 400, `Accepted company ${JSON.stringify(company)}`);
    assert.deepEqual(sqlite.prepare("SELECT * FROM profiles WHERE owner_id = 'owner-a'").get(), before);
  }
  for (const linkedInUrl of invalidLinkedInUrls) {
    const response = await profileRoute.PUT(request("/api/profile", "PUT", { displayName: "Changed name", company: "Changed company", linkedInUrl }));
    assert.equal(response.status, 400, `Accepted LinkedIn URL ${JSON.stringify(linkedInUrl)}`);
    assert.deepEqual(sqlite.prepare("SELECT * FROM profiles WHERE owner_id = 'owner-a'").get(), before);
  }
});

test("profile and share mutations reject foreign origins, unsupported body fields and oversized streams", async () => {
  reset(); await seed();
  const cases = [
    (headers: Record<string, string>) => profileRoute.PUT(request("/api/profile", "PUT", { displayName: "Alex" }, headers)),
    (headers: Record<string, string>) => sharesRoute.POST(request("/api/shares", "POST", { revision: 1 }, headers)),
    (headers: Record<string, string>) => sharesRoute.DELETE(request("/api/shares", "DELETE", { shareId: crypto.randomUUID() }, headers)),
  ];
  for (const action of cases) {
    assert.equal((await action({ Origin: "https://evil.example" })).status, 403);
    assert.equal((await action({ Origin: "null" })).status, 403);
    assert.equal((await action({ "Sec-Fetch-Site": "cross-site" })).status, 403);
    assert.equal((await action({ "Content-Type": "text/plain" })).status, 415);
    assert.equal((await action({ "Content-Length": "8193" })).status, 413);
  }
  assert.equal((await profileRoute.PUT(request("/api/profile", "PUT", { displayName: "x".repeat(8192) }))).status, 413);
  assert.equal((await sharesRoute.POST(request("/api/shares", "POST", { revision: 1, ownerId: "owner-b" }))).status, 400);
  assert.equal((await profileRoute.PUT(new Request("https://compass.example/api/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: "{" }))).status, 400);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM schedule_shares").get()!.n, 0);
});

test("share creation needs an explicit profile, persisted agenda, reviewed revision, and canonical selections", async () => {
  reset();
  assert.equal((await create()).status, 409);
  await profileRoute.PUT(request("/api/profile", "PUT", { displayName: "Alex" }));
  assert.equal((await create()).status, 409);
  sqlite.prepare("INSERT INTO planner_states VALUES (?, ?, ?, ?)").run("owner-a", JSON.stringify(fixture()), 1, NOW);
  assert.equal((await sharesRoute.POST(request("/api/shares", "POST", { revision: 2, previewHash: "0".repeat(64) }))).status, 409);
  for (const revision of [0, -1, "1", 1.5, null]) assert.equal((await sharesRoute.POST(request("/api/shares", "POST", { revision, previewHash: "0".repeat(64) }))).status, 400);
  const state = fixture(); state.savedSessionIds = ["user-created-private-session"];
  sqlite.prepare("UPDATE planner_states SET state_json = ?").run(JSON.stringify(state));
  assert.equal((await create()).status, 409);
});

test("preview and creation expose exact public field projection; tokens are returned once and never stored", async () => {
  reset(); await seed();
  const previewResponse = await sharesRoute.GET(request("/api/shares?preview=1"));
  const preview = await previewResponse.json() as { preview: SharedSchedule; revision: number; excludedSessionCount: number };
  assert.equal(preview.revision, 1); assert.equal(preview.excludedSessionCount, 1);
  assert.equal(preview.preview.displayName, "Alex");
  assert.doesNotMatch(JSON.stringify(preview), /PRIVATE PROFILE COMPANY|private-profile-person|company|linkedInUrl/);
  const result = await created();
  assert.deepEqual(Object.keys(result).sort(), ["path", "preview", "shareId"]);
  assert.deepEqual(result.preview.sessions, preview.preview.sessions);
  const token = result.path.split("/").at(-1)!;
  const row = sqlite.prepare("SELECT * FROM schedule_shares").get()!;
  assert.equal(row.token_hash, await sharing.hashShareToken(token));
  assert.doesNotMatch(JSON.stringify(row), new RegExp(token));
  assert.doesNotMatch(String(row.payload_json), /PRIVATE|ownerId|owner-a|secret-a@example.com|connections|sessionNotes|company|linkedInUrl|private-profile-person/);
  const listResponse = await sharesRoute.GET(request("/api/shares"));
  assert.match(listResponse.headers.get("Cache-Control")!, /no-store/);
  assert.equal(listResponse.headers.get("Referrer-Policy"), "no-referrer");
  const list = await listResponse.json() as { shares: unknown[] };
  assert.deepEqual(list, { shares: [{ shareId: result.shareId, createdAt: result.preview.createdAt, revoked: false, sessionCount: 1 }] });
  assert.doesNotMatch(JSON.stringify(list), /tokenHash|token_hash|payloadJson|ownerId|\/share\//);
});

test("different owners cannot list or revoke another owner's shares, including injected owner fields", async () => {
  reset(); await seed(); const result = await created();
  await seed("owner-b"); currentUser = { userId: "owner-b", email: "secret-b@example.com", displayName: "secret-b@example.com" };
  assert.deepEqual(await (await sharesRoute.GET(request("/api/shares"))).json(), { shares: [] });
  const preview = await (await sharesRoute.GET(request("/api/shares?preview=1"))).json() as { preview: SharedSchedule };
  assert.equal(preview.preview.displayName, "Blair");
  assert.equal((await sharesRoute.DELETE(request("/api/shares", "DELETE", { shareId: result.shareId }))).status, 404);
  assert.equal((await sharesRoute.DELETE(request("/api/shares", "DELETE", { shareId: result.shareId, ownerId: "owner-a" }))).status, 400);
  assert.equal(sqlite.prepare("SELECT revoked_at FROM schedule_shares").get()!.revoked_at, null);
});

test("anonymous share page is read-only, escaped, non-indexed and revocation invalidates the token", async () => {
  reset(); await seed();
  sqlite.prepare("UPDATE profiles SET display_name = ?").run("<Alex & Friends>");
  const result = await created(); const token = result.path.split("/").at(-1)!;
  currentUser = null;
  const markup = renderToStaticMarkup(await page.default({ params: Promise.resolve({ token }) }));
  assert.match(markup, /&lt;Alex &amp; Friends&gt;/);
  assert.match(markup, /America\/Chicago/);
  assert.match(markup, /no-referrer/);
  assert.doesNotMatch(markup, /PRIVATE|secret-a@example.com|owner-a|sessionNotes|user-created-private-session|private-profile-person|company|linkedInUrl|<form/);
  assert.equal(page.dynamic, "force-dynamic"); assert.equal(page.revalidate, 0);
  assert.equal(page.metadata.robots.index, false); assert.equal(page.metadata.robots.follow, false); assert.equal(page.metadata.referrer, "no-referrer");
  currentUser = { userId: "owner-a", email: "secret-a@example.com", displayName: "secret-a@example.com" };
  const response = await sharesRoute.DELETE(request("/api/shares", "DELETE", { shareId: result.shareId }));
  assert.deepEqual(await response.json(), { revoked: true });
  assert.equal(await sharing.loadSharedSchedule(token, lookup), null);
  await assert.rejects(() => page.default({ params: Promise.resolve({ token }) }), /NOT_FOUND/);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM schedule_shares").get()!.n, 1);
  assert.equal((await sharesRoute.DELETE(request("/api/shares", "DELETE", { shareId: result.shareId }))).status, 200);
});

test("atomic share insertion rejects a planner change after its preview was read", async () => {
  reset(); await seed();
  beforeExecute = (query) => {
    if (/INSERT INTO "schedule_shares"/i.test(query)) {
      beforeExecute = undefined;
      sqlite.prepare("UPDATE planner_states SET revision = revision + 1 WHERE owner_id = 'owner-a'").run();
    }
  };
  assert.equal((await create()).status, 409);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM schedule_shares").get()!.n, 0);
});

test("atomic share insertion still rejects a display-name change after private fields were added", async () => {
  reset(); await seed();
  beforeExecute = (query) => {
    if (/INSERT INTO "schedule_shares"/i.test(query)) {
      beforeExecute = undefined;
      sqlite.prepare("UPDATE profiles SET display_name = 'Changed name' WHERE owner_id = 'owner-a'").run();
    }
  };
  assert.equal((await create()).status, 409);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM schedule_shares").get()!.n, 0);
});

test("private profile edits neither change reviewed public projection nor leak into snapshots", async () => {
  reset(); await seed();
  const reviewed = await (await sharesRoute.GET(request("/api/shares?preview=1"))).json() as { previewHash: string; revision: number; preview: SharedSchedule };
  const response = await profileRoute.PUT(request("/api/profile", "PUT", { displayName: "Alex", company: "DIFFERENT PRIVATE COMPANY", linkedInUrl: "https://www.linkedin.com/in/different-private-person" }));
  assert.equal(response.status, 200);
  const fresh = await (await sharesRoute.GET(request("/api/shares?preview=1"))).json() as { previewHash: string; preview: SharedSchedule };
  assert.equal(fresh.previewHash, reviewed.previewHash);
  const created = await sharesRoute.POST(request("/api/shares", "POST", { revision: reviewed.revision, previewHash: reviewed.previewHash }));
  assert.equal(created.status, 201);
  const result = await created.json() as { preview: SharedSchedule };
  assert.deepEqual(Object.keys(result.preview).sort(), ["createdAt", "displayName", "sessions"]);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|private-person|company|linkedInUrl/);
});

test("atomic rate limit allows only ten creations per owner per rolling day even concurrently", async () => {
  reset(); await seed();
  for (let i = 0; i < 9; i++) await created();
  const responses = await Promise.all([create(), create()]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 429]);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM schedule_shares").get()!.n, 10);
  sqlite.prepare("UPDATE schedule_shares SET revoked_at = ?").run(NOW);
  assert.equal((await create()).status, 429, "revocation must not reset the daily creation limit");
  await seed("owner-b"); currentUser = { userId: "owner-b", email: "b@example.com", displayName: "b@example.com" };
  assert.equal((await create()).status, 201, "one owner's rate limit must not apply to another");
});

test("active-share limit is enforced independently of old creation timestamps", async () => {
  reset(); await seed();
  const statement = sqlite.prepare("INSERT INTO schedule_shares VALUES (?, ?, ?, ?, ?, NULL)");
  for (let i = 0; i < 20; i++) statement.run(`old-hash-${i}`, crypto.randomUUID(), "owner-a", JSON.stringify(expectedSchedule()), "2020-01-01T00:00:00.000Z");
  assert.equal((await create()).status, 429);
  sqlite.prepare("UPDATE schedule_shares SET revoked_at = ? WHERE token_hash = 'old-hash-0'").run(NOW);
  assert.equal((await create()).status, 201);
});

test("corrupt stored snapshots fail closed without revealing stored text", async () => {
  reset(); await seed();
  sqlite.prepare("UPDATE planner_states SET state_json = ?").run("PRIVATE corrupted JSON");
  const response = await create();
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /PRIVATE/);
});


test("preview fingerprints reject profile or catalog changes between review and share creation", async () => {
  reset(); await seed();
  const reviewed = await (await sharesRoute.GET(request("/api/shares?preview=1"))).json() as { previewHash: string; revision: number };
  sqlite.prepare("UPDATE profiles SET display_name = 'New name' WHERE owner_id = 'owner-a'").run();
  assert.equal((await sharesRoute.POST(request("/api/shares", "POST", { revision: reviewed.revision, previewHash: reviewed.previewHash }))).status, 409);
  sqlite.prepare("UPDATE profiles SET display_name = 'Alex' WHERE owner_id = 'owner-a'").run();
  const reviewedSession = catalog.sessions.find(entry => entry.id === fixture().savedSessionIds[0])!;
  const title = reviewedSession.title;
  reviewedSession.title = "New public title";
  try {
    assert.equal((await sharesRoute.POST(request("/api/shares", "POST", { revision: reviewed.revision, previewHash: reviewed.previewHash }))).status, 409);
  } finally { reviewedSession.title = title; }
  assert.equal((await sharesRoute.POST(request("/api/shares", "POST", { revision: 1 }))).status, 400);
  assert.equal((await sharesRoute.POST(request("/api/shares", "POST", { revision: 1, previewHash: "bad" }))).status, 400);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM schedule_shares").get()!.n, 0);
  const a = expectedSchedule(); const b = { ...a, createdAt: "2030-01-01T00:00:00.000Z" };
  assert.equal(await sharing.hashSharedSchedule(a), await sharing.hashSharedSchedule(b), "review hash excludes creation time");
});
