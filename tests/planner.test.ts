// Test-only synthetic fixtures: no captured attendee records or real account identities.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
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

// Current hosted-auth runtime coverage is verified separately with local Worker/D1 fixtures.
// The historical ChatGPT-auth injection harness remains recoverable in Git history.
