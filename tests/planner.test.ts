// Test-only synthetic fixtures: no captured attendee records or real account identities.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
// @ts-expect-error Node's native TypeScript runner requires the .ts extension.
import { dateInZone, emptyState, formatLocalInput, getConflicts, localToUtc, PlannerValidationError, PLANNER_LIMITS, sessionsOverlap, validateState } from "../lib/planner.ts";
import type { PlannerState, Session } from "../lib/planner";

function fixture(): PlannerState {
  return {
    initialized: true,
    conferences: [{ id: "conf-1", name: "Conference", startDate: "2026-10-11", endDate: "2026-10-12", timeZone: "America/Chicago", location: "Tulsa", url: "https://example.com", description: "" }],
    sessions: [{ id: "session-1", conferenceId: "conf-1", title: "Opening", start: "2026-10-11T14:00:00.000Z", end: "2026-10-11T15:00:00.000Z", speaker: "Speaker", room: "Main", track: "Web", description: "", url: "", sourceUrl: "https://example.com/schedule" }],
    savedSessionIds: ["session-1"],
    sessionNotes: { "session-1": "Remember this" },
    connections: [{ id: "person-1", conferenceId: "conf-1", name: "Alex", role: "Engineer", company: "Example", status: "want-to-meet", notes: "Ask about web performance", linkedInUrl: "https://www.linkedin.com/in/example", followUpDate: "2026-10-15" }],
  };
}

test("empty snapshots are valid, independent copies", () => {
  const a = emptyState();
  const b = emptyState();
  a.savedSessionIds.push("independent");
  assert.deepEqual(b.savedSessionIds, []);
  assert.deepEqual(validateState(b), b);
});

test("valid snapshots are copied and links/timestamps normalized", () => {
  const original = fixture();
  original.sessions[0].start = "2026-10-11T14:00:00Z";
  const state = validateState(original);
  assert.equal(state.conferences[0].url, "https://example.com/");
  assert.equal(state.sessions[0].start, "2026-10-11T14:00:00.000Z");
  assert.notEqual(state.sessions, original.sessions);
  assert.equal(state.sessionNotes["session-1"], "Remember this");
});

test("unknown fields and identity injection are rejected", () => {
  assert.throws(() => validateState({ ...fixture(), ownerId: "other-user" }), /unsupported field/);
  const state = fixture();
  Object.assign(state.connections[0], { email: "not-collected@example.com" });
  assert.throws(() => validateState(state), /unsupported field/);
});

test("missing fields, non-boolean initialization and malformed objects fail", () => {
  assert.throws(() => validateState(null), PlannerValidationError);
  assert.throws(() => validateState({ ...fixture(), initialized: "yes" }), /true or false/);
  const state = fixture() as unknown as Record<string, unknown>;
  delete state.connections;
  assert.throws(() => validateState(state), /required/);
});

test("real calendar dates and conference date ordering are required", () => {
  const state = fixture();
  state.conferences[0].startDate = "2026-02-30";
  assert.throws(() => validateState(state), /valid date/);
  state.conferences[0].startDate = "2026-10-13";
  assert.throws(() => validateState(state), /end date/);
});

test("session timestamps must be real UTC dates and move forward", () => {
  const state = fixture();
  state.sessions[0].start = "2026-10-11T09:00:00-05:00";
  assert.throws(() => validateState(state), /UTC timestamp/);
  state.sessions[0].start = "2026-02-30T09:00:00Z";
  assert.throws(() => validateState(state), /valid UTC/);
  state.sessions[0].start = state.sessions[0].end;
  assert.throws(() => validateState(state), /end after/);
});

test("conference bounds use its local dates and allow an exact closing midnight", () => {
  const state = fixture();
  state.conferences[0].endDate = "2026-10-11";
  state.sessions[0].start = "2026-10-12T04:00:00.000Z";
  state.sessions[0].end = "2026-10-12T05:00:00.000Z";
  assert.doesNotThrow(() => validateState(state));
  state.sessions[0].end = "2026-10-12T05:00:00.001Z";
  assert.throws(() => validateState(state), /conference dates/);
});

test("unsafe, credential-bearing and relative URLs fail", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,test", "/relative", "https://user:secret@example.com", "https://example.com/with space"]) {
    const state = fixture();
    state.sessions[0].sourceUrl = url;
    assert.throws(() => validateState(state), /link/);
  }
  const state = fixture();
  state.conferences[0].url = "http://example.com";
  assert.equal(validateState(state).conferences[0].url, "http://example.com/");
});

test("unknown references and duplicate identifiers fail", () => {
  for (const change of [
    (state: PlannerState) => { state.sessions[0].conferenceId = "missing"; },
    (state: PlannerState) => { state.savedSessionIds = ["missing"]; },
    (state: PlannerState) => { state.sessionNotes = { missing: "note" }; },
    (state: PlannerState) => { state.connections[0].conferenceId = "missing"; },
    (state: PlannerState) => { state.sessions.push({ ...state.sessions[0] }); },
    (state: PlannerState) => { state.savedSessionIds.push("session-1"); },
  ]) {
    const state = fixture(); change(state);
    assert.throws(() => validateState(state), PlannerValidationError);
  }
});

test("notes, names, list sizes and reserved identifiers are bounded", () => {
  const state = fixture();
  state.sessionNotes["session-1"] = "x".repeat(8001);
  assert.throws(() => validateState(state), /8000/);
  state.sessionNotes["session-1"] = "x".repeat(8000);
  assert.doesNotThrow(() => validateState(state));
  state.connections[0].notes = "x".repeat(8001);
  assert.throws(() => validateState(state), /8000/);
  assert.throws(() => validateState({ ...emptyState(), conferences: Array(101).fill({}) }), /100/);
  const invalid = fixture(); invalid.sessions[0].id = "constructor";
  assert.throws(() => validateState(invalid), /valid identifier/);
});

test("timezone input must be an actual IANA zone", () => {
  for (const timeZone of ["Not/A_Zone", "+05:00", "", "UTC\u0000"]) {
    const state = fixture(); state.conferences[0].timeZone = timeZone;
    assert.throws(() => validateState(state), PlannerValidationError);
  }
});

test("ordinary local time converts independently of machine time zone", () => {
  assert.equal(localToUtc("2026-10-11T09:00", "America/Chicago"), "2026-10-11T14:00:00.000Z");
  assert.equal(localToUtc("2026-01-11T09:00", "America/Chicago"), "2026-01-11T15:00:00.000Z");
  assert.equal(localToUtc("2026-10-11T09:00", "Asia/Kathmandu"), "2026-10-11T03:15:00.000Z");
  assert.equal(localToUtc("2026-10-11T09:00:12.345", "UTC"), "2026-10-11T09:00:12.345Z");
});

test("DST gaps and repeated hours are rejected rather than shifted", () => {
  assert.throws(() => localToUtc("2026-03-08T02:30", "America/Chicago"), /does not exist/);
  assert.throws(() => localToUtc("2026-11-01T01:30", "America/Chicago"), /occurs twice/);
  assert.equal(localToUtc("2026-03-08T03:00", "America/Chicago"), "2026-03-08T08:00:00.000Z");
  assert.equal(localToUtc("2026-11-01T02:00", "America/Chicago"), "2026-11-01T08:00:00.000Z");
});

test("half-hour DST and skipped date-line days are handled", () => {
  assert.throws(() => localToUtc("2026-10-04T02:15", "Australia/Lord_Howe"), /does not exist/);
  assert.throws(() => localToUtc("2026-04-05T01:45", "Australia/Lord_Howe"), /occurs twice/);
  assert.throws(() => localToUtc("2011-12-30T12:00", "Pacific/Apia"), /does not exist/);
});

test("invalid local input is rejected", () => {
  for (const value of ["2026-02-30T10:00", "2026-10-11T24:00", "2026-10-11T09:60", "2026-10-11T09:00Z", "not a date"]) {
    assert.throws(() => localToUtc(value, "UTC"), PlannerValidationError);
  }
});

test("local display dates and input values respect the chosen zone", () => {
  assert.equal(dateInZone("2026-10-11T02:00:00Z", "America/Chicago"), "2026-10-10");
  assert.equal(formatLocalInput("2026-10-11T02:00:00Z", "America/Chicago"), "2026-10-10T21:00");
  assert.equal(formatLocalInput("2026-10-11T05:00:00Z", "America/Chicago"), "2026-10-11T00:00");
});

test("overlap is start-inclusive, end-exclusive, and crosses midnight", () => {
  const a = { start: "2026-10-11T23:30:00Z", end: "2026-10-12T00:30:00Z" };
  assert.equal(sessionsOverlap(a, { start: a.end, end: "2026-10-12T01:30:00Z" }), false);
  assert.equal(sessionsOverlap(a, { start: "2026-10-12T00:00:00Z", end: "2026-10-12T01:00:00Z" }), true);
  assert.equal(sessionsOverlap(a, a), true);
});

test("only saved sessions create conflict pairs", () => {
  const base = fixture().sessions[0];
  const sessions: Session[] = [
    base,
    { ...base, id: "session-2", start: "2026-10-11T14:30:00.000Z", end: "2026-10-11T15:30:00.000Z" },
    { ...base, id: "session-3", start: "2026-10-11T15:00:00.000Z", end: "2026-10-11T16:00:00.000Z" },
  ];
  assert.equal(getConflicts(sessions, ["session-1"]).length, 0);
  const pairs = getConflicts(sessions, ["session-1", "session-2", "session-3"]);
  assert.deepEqual(pairs.map((pair) => pair.map((session) => session.id)), [["session-1", "session-2"], ["session-2", "session-3"]]);
});

// Exercise the actual route handlers with isolated auth and database adapters. No
// live account or production database is used by this test suite.
type Row = { ownerId: string; stateJson: string; revision: number; updatedAt: string };
type Condition = (row: Row) => boolean;
const rows = new Map<string, Row>();
let currentUser: { userId: string } | null = { userId: "owner-a" };
const table = { ownerId: "ownerId", revision: "revision" };
const adapter = {
  getChatGPTUser: async () => currentUser,
  plannerStates: table,
  eq: (column: keyof Row, value: unknown): Condition => (row) => row[column] === value,
  and: (...conditions: Condition[]): Condition => (row) => conditions.every((condition) => condition(row)),
  getDb: () => ({
    select: () => ({ from: () => ({ where: (condition: Condition) => ({ limit: async () => [...rows.values()].filter(condition).slice(0, 1) }) }) }),
    insert: () => ({ values: (values: Row) => ({ onConflictDoNothing: () => ({ returning: async () => {
      if (rows.has(values.ownerId)) return [];
      rows.set(values.ownerId, values);
      return [{ revision: values.revision }];
    } }) }) }),
    update: () => ({ set: (values: Partial<Row>) => ({ where: (condition: Condition) => ({ returning: async () => {
      const found = [...rows.values()].find(condition);
      if (!found) return [];
      Object.assign(found, values);
      return [{ revision: found.revision }];
    } }) }) }),
  }),
};
const source = await readFile(new URL("../app/api/planner/route.ts", import.meta.url), "utf8");
const plannerUrl = new URL("../lib/planner.ts", import.meta.url).href;
const injectable = source
  .replace(/^import .* from "drizzle-orm";\n/m, "")
  .replace(/^import .* from "@\/app\/chatgpt-auth";\n/m, "")
  .replace(/^import .* from "@\/db";\n/m, "")
  .replace(/^import .* from "@\/db\/schema";\n/m, "")
  .replace('"@/lib/planner"', JSON.stringify(plannerUrl));
const registry = globalThis as unknown as Record<symbol, unknown>;
registry[Symbol.for("conference-compass-test-adapter")] = adapter;
const compiled = ts.transpileModule(`const { getChatGPTUser, getDb, plannerStates, eq, and } = globalThis[Symbol.for("conference-compass-test-adapter")];\n${injectable}`, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const route = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`) as {
  GET: () => Promise<Response>;
  PUT: (request: Request) => Promise<Response>;
};
async function snapshot(response: Response): Promise<{ state: PlannerState; revision: number }> {
  return await response.json() as { state: PlannerState; revision: number };
}
function put(state: unknown, revision: unknown, extras: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  return route.PUT(new Request("https://compass.example/api/planner", {
    method: "PUT", headers: { "Content-Type": "application/json", Origin: "https://compass.example", ...headers },
    body: JSON.stringify({ state, revision, ...extras }),
  }));
}

test("API rejects unauthenticated reads and writes", async () => {
  currentUser = null;
  assert.equal((await route.GET()).status, 401);
  assert.equal((await put(fixture(), 0)).status, 401);
  assert.equal(rows.size, 0);
  currentUser = { userId: "owner-a" };
});

test("API returns an empty private no-cache snapshot for a new owner", async () => {
  const response = await route.GET();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Cache-Control") ?? "", /no-store/);
  assert.deepEqual(await response.json(), { state: emptyState(), revision: 0 });
});

test("API creates, reloads and updates private state with revisions", async () => {
  const created = await put(fixture(), 0);
  assert.equal(created.status, 200);
  assert.equal((await snapshot(created)).revision, 1);
  const read = await snapshot(await route.GET());
  assert.equal(read.state.sessionNotes["session-1"], "Remember this");
  const changed = fixture(); changed.sessionNotes["session-1"] = "Updated";
  assert.equal((await put(changed, 1)).status, 200);
  assert.equal((await snapshot(await route.GET())).revision, 2);
});

test("API stale saves cannot overwrite more recent notes", async () => {
  assert.equal((await put(fixture(), 0)).status, 409);
  assert.equal((await put(fixture(), 1)).status, 409);
  const read = await snapshot(await route.GET());
  assert.equal(read.state.sessionNotes["session-1"], "Updated");
  assert.equal(read.revision, 2);
});

test("API cannot read or mutate another authenticated owner's row", async () => {
  currentUser = { userId: "owner-b" };
  assert.deepEqual(await (await route.GET()).json(), { state: emptyState(), revision: 0 });
  assert.equal((await put(fixture(), 2)).status, 409);
  assert.equal((await put(fixture(), 0, { ownerId: "owner-a" })).status, 400);
  const own = emptyState(); own.initialized = true;
  assert.equal((await put(own, 0)).status, 200);
  assert.equal((await snapshot(await route.GET())).state.sessions.length, 0);
  currentUser = { userId: "owner-a" };
  assert.equal((await snapshot(await route.GET())).state.sessionNotes["session-1"], "Updated");
});

test("API enforces origin, JSON content type, validation and revision limits", async () => {
  assert.equal((await put(fixture(), 2, {}, { Origin: "https://evil.example" })).status, 403);
  assert.equal((await put(fixture(), 2, {}, { Origin: "null" })).status, 403);
  assert.equal((await put(fixture(), 2, {}, { "Sec-Fetch-Site": "cross-site" })).status, 403);
  assert.equal((await put(fixture(), 2, {}, { "Content-Type": "text/plain" })).status, 415);
  assert.equal((await put(fixture(), -1)).status, 400);
  assert.equal((await put(fixture(), 1.5)).status, 400);
  assert.equal((await put(fixture(), Number.MAX_SAFE_INTEGER)).status, 400);
  assert.equal((await put({ ...fixture(), initialized: "yes" }, 2)).status, 400);
  const invalidJson = new Request("https://compass.example/api/planner", { method: "PUT", headers: { "Content-Type": "application/json" }, body: "{" });
  assert.equal((await route.PUT(invalidJson)).status, 400);
});

test("API enforces the byte cap even without a Content-Length header", async () => {
  const huge = { ...fixture(), extra: "x".repeat(PLANNER_LIMITS.bodyBytes) };
  assert.equal((await put(huge, 2)).status, 413);
  assert.equal((await put(fixture(), 2, {}, { "Content-Length": String(PLANNER_LIMITS.bodyBytes + 1) })).status, 413);
});

test("API concurrent writers have exactly one winner", async () => {
  const results = await Promise.all([put(fixture(), 2), put(fixture(), 2)]);
  assert.deepEqual(results.map((response) => response.status).sort(), [200, 409]);
  assert.equal((await snapshot(await route.GET())).revision, 3);
});

test("API reports corrupt storage without replacing or exposing stored content", async () => {
  const row = rows.get("owner-a")!;
  const saved = row.stateJson;
  row.stateJson = "secret corrupt content";
  const response = await route.GET();
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /secret corrupt content/);
  assert.equal(row.stateJson, "secret corrupt content");
  row.stateJson = saved;
});
