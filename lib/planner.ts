/** Shared planner model and validation. Never accepts identity or access-control data. */
export type Conference = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  timeZone: string;
  location: string;
  url: string;
  description: string;
};

export type Session = {
  id: string;
  conferenceId: string;
  title: string;
  start: string;
  end: string;
  speaker: string;
  room: string;
  track: string;
  description: string;
  url: string;
  sourceUrl: string;
};

export type ConnectionStatus = "want-to-meet" | "met" | "follow-up";
export type Connection = {
  id: string;
  conferenceId: string;
  name: string;
  role: string;
  company: string;
  status: ConnectionStatus;
  notes: string;
  linkedInUrl: string;
  followUpDate: string;
};

export type PlannerState = {
  conferences: Conference[];
  sessions: Session[];
  savedSessionIds: string[];
  sessionNotes: Record<string, string>;
  connections: Connection[];
  initialized: boolean;
};

export const PLANNER_LIMITS = {
  conferences: 100,
  sessions: 2000,
  connections: 1000,
  notes: 8000,
  bodyBytes: 500_000,
} as const;

export function emptyState(): PlannerState {
  return { conferences: [], sessions: [], savedSessionIds: [], sessionNotes: {}, connections: [], initialized: false };
}

export class PlannerValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlannerValidationError";
  }
}

function fail(message: string): never {
  throw new PlannerValidationError(message);
}

function record(value: unknown, label: string, keys?: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object.`);
  const result = value as Record<string, unknown>;
  if (keys) {
    for (const key of Object.keys(result)) {
      if (!keys.includes(key)) fail(`${label} has an unsupported field: ${key.slice(0, 60)}.`);
    }
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(result, key)) fail(`${label}.${key} is required.`);
    }
  }
  return result;
}

function text(value: unknown, label: string, max: number, required = false): string {
  if (typeof value !== "string") fail(`${label} must be text.`);
  if (value.length > max) fail(`${label} must be ${max} characters or fewer.`);
  if (required && !value.trim()) fail(`${label} is required.`);
  if (/\u0000/.test(value)) fail(`${label} contains an unsupported character.`);
  return required ? value.trim() : value;
}

function identifier(value: unknown, label: string): string {
  const result = text(value, label, 80, true);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(result) || ["constructor", "prototype", "__proto__"].includes(result)) {
    fail(`${label} must be a valid identifier.`);
  }
  return result;
}

function list(value: unknown, label: string, max: number): unknown[] {
  if (!Array.isArray(value)) fail(`${label} must be a list.`);
  if (value.length > max) fail(`${label} may contain at most ${max} items.`);
  return value;
}

function dateOnly(value: unknown, label: string): string {
  const result = text(value, label, 10, true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || result.startsWith("0000")) fail(`${label} must be a valid date.`);
  const date = new Date(`${result}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== result) fail(`${label} must be a valid date.`);
  return result;
}

function utcTimestamp(value: unknown, label: string): string {
  const result = text(value, label, 30, true);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(result) || result.startsWith("0000")) {
    fail(`${label} must be an ISO UTC timestamp ending in Z.`);
  }
  const parsed = new Date(result);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 19) !== result.slice(0, 19)) {
    fail(`${label} must be a valid UTC date and time.`);
  }
  return parsed.toISOString();
}

function webUrl(value: unknown, label: string): string {
  const result = text(value, label, 2048).trim();
  if (!result) return "";
  let url: URL;
  try { url = new URL(result); } catch { return fail(`${label} must be a full https:// or http:// link.`); }
  if (!["https:", "http:"].includes(url.protocol) || !url.hostname || url.username || url.password || /[\u0000-\u0020\u007f]/.test(result)) {
    fail(`${label} must be a full https:// or http:// link without credentials.`);
  }
  return url.href;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string): Intl.DateTimeFormat {
  if (typeof timeZone !== "string" || timeZone.length > 100 || !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)*$/.test(timeZone)) {
    return fail("Choose a valid IANA time zone, such as America/Chicago.");
  }
  const existing = formatters.get(timeZone);
  if (existing) return existing;
  let created: Intl.DateTimeFormat;
  try {
    created = new Intl.DateTimeFormat("en-GB-u-ca-iso8601-nu-latn", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    });
  } catch { return fail("Choose a valid IANA time zone, such as America/Chicago."); }
  if (formatters.size >= 128) formatters.clear();
  formatters.set(timeZone, created);
  return created;
}

function partsAt(timestamp: number, timeZone: string): Record<string, string> {
  if (!Number.isFinite(timestamp)) fail("Enter a valid date and time.");
  const parts: Record<string, string> = {};
  for (const part of formatter(timeZone).formatToParts(new Date(timestamp))) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  return parts;
}

function partsEpoch(parts: Record<string, string>): number {
  const date = new Date(0);
  date.setUTCFullYear(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  date.setUTCHours(Number(parts.hour), Number(parts.minute), Number(parts.second), 0);
  return date.getTime();
}

/** The YYYY-MM-DD calendar date at an instant in the conference's time zone. */
export function dateInZone(iso: string, timeZone: string): string {
  const parts = partsAt(Date.parse(iso), timeZone);
  return `${parts.year.padStart(4, "0")}-${parts.month}-${parts.day}`;
}

/** Value suitable for a datetime-local input, displayed in the conference time zone. */
export function formatLocalInput(iso: string, timeZone: string): string {
  const parts = partsAt(Date.parse(iso), timeZone);
  return `${parts.year.padStart(4, "0")}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Resolve wall-clock time without silently shifting DST gaps or choosing a repeated hour. */
export function localToUtc(dateTimeString: string, timeZone: string): string {
  formatter(timeZone);
  if (typeof dateTimeString !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(dateTimeString)) {
    fail("Enter a valid local date and time.");
  }
  dateOnly(dateTimeString.slice(0, 10), "Date");
  const [date, clock] = dateTimeString.split("T");
  const [hour, minute, rawSecond = "00"] = clock.split(":");
  const [second, fraction = ""] = rawSecond.split(".");
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) fail("Enter a valid local date and time.");
  const naive = Date.parse(`${date}T${hour}:${minute}:${second}.${fraction.padEnd(3, "0")}Z`);
  const wholeSecond = Math.floor(naive / 1000) * 1000;
  const offsets = new Set<number>();
  // Sampling both sides captures DST, half-hour transitions, and date-line changes.
  for (let minutes = -36 * 60; minutes <= 36 * 60; minutes += 30) {
    const sample = wholeSecond + minutes * 60_000;
    offsets.add(partsEpoch(partsAt(sample, timeZone)) - sample);
  }
  const matches: number[] = [];
  for (const offset of offsets) {
    const candidate = naive - offset;
    if (partsEpoch(partsAt(candidate, timeZone)) === wholeSecond) matches.push(candidate);
  }
  if (!matches.length) fail("This local time does not exist because the clock changes. Choose a time before or after the change.");
  if (matches.length > 1) fail("This local time occurs twice because the clock changes. Choose an unambiguous time before or after the repeated hour.");
  return new Date(matches[0]).toISOString();
}

/** Intervals include their start but exclude their end, so adjacent talks do not clash. */
export function sessionsOverlap(a: Pick<Session, "start" | "end">, b: Pick<Session, "start" | "end">): boolean {
  return Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end);
}

export function getConflicts(sessions: Session[], savedIds: string[]): [Session, Session][] {
  const saved = new Set(savedIds);
  const selected = sessions.filter((session) => saved.has(session.id)).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const pairs: [Session, Session][] = [];
  for (let i = 0; i < selected.length; i++) {
    for (let j = i + 1; j < selected.length; j++) {
      if (Date.parse(selected[j].start) >= Date.parse(selected[i].end)) break;
      if (sessionsOverlap(selected[i], selected[j])) pairs.push([selected[i], selected[j]]);
    }
  }
  return pairs;
}

function ensureUnique<T extends { id: string }>(items: T[], label: string): Map<string, T> {
  const byId = new Map<string, T>();
  for (const item of items) {
    if (byId.has(item.id)) fail(`${label} contains a duplicate identifier.`);
    byId.set(item.id, item);
  }
  return byId;
}

/** Validate and copy an untrusted snapshot; throws PlannerValidationError on failure. */
export function validateState(input: unknown): PlannerState {
  const root = record(input, "Planner", ["conferences", "sessions", "savedSessionIds", "sessionNotes", "connections", "initialized"]);
  if (typeof root.initialized !== "boolean") fail("Planner.initialized must be true or false.");
  const conferences = list(root.conferences, "Conferences", PLANNER_LIMITS.conferences).map((value): Conference => {
    const item = record(value, "Conference", ["id", "name", "startDate", "endDate", "timeZone", "location", "url", "description"]);
    const startDate = dateOnly(item.startDate, "Conference start date");
    const endDate = dateOnly(item.endDate, "Conference end date");
    if (startDate > endDate) fail("Conference end date must be on or after its start date.");
    const timeZone = text(item.timeZone, "Conference time zone", 100, true);
    formatter(timeZone);
    return {
      id: identifier(item.id, "Conference ID"), name: text(item.name, "Conference name", 200, true),
      startDate, endDate, timeZone, location: text(item.location, "Conference location", 300),
      url: webUrl(item.url, "Conference website"), description: text(item.description, "Conference description", 8000),
    };
  });
  const conferenceById = ensureUnique(conferences, "Conferences");
  const sessions = list(root.sessions, "Sessions", PLANNER_LIMITS.sessions).map((value): Session => {
    const item = record(value, "Session", ["id", "conferenceId", "title", "start", "end", "speaker", "room", "track", "description", "url", "sourceUrl"]);
    const conferenceId = identifier(item.conferenceId, "Session conference ID");
    const conference = conferenceById.get(conferenceId);
    if (!conference) fail("Every session must belong to an existing conference.");
    const start = utcTimestamp(item.start, "Session start");
    const end = utcTimestamp(item.end, "Session end");
    if (Date.parse(start) >= Date.parse(end)) fail("A session must end after it starts.");
    const firstDate = dateInZone(start, conference.timeZone);
    const lastDate = dateInZone(new Date(Date.parse(end) - 1).toISOString(), conference.timeZone);
    if (firstDate < conference.startDate || firstDate > conference.endDate || lastDate < conference.startDate || lastDate > conference.endDate) {
      fail("Session times must fall within the conference dates in its time zone.");
    }
    return {
      id: identifier(item.id, "Session ID"), conferenceId, title: text(item.title, "Session title", 300, true), start, end,
      speaker: text(item.speaker, "Session speaker", 500), room: text(item.room, "Session room", 200),
      track: text(item.track, "Session track", 200), description: text(item.description, "Session description", 8000),
      url: webUrl(item.url, "Session website"), sourceUrl: webUrl(item.sourceUrl, "Session source"),
    };
  });
  const sessionById = ensureUnique(sessions, "Sessions");
  const savedSessionIds = list(root.savedSessionIds, "Saved sessions", PLANNER_LIMITS.sessions).map((value) => {
    const id = identifier(value, "Saved session ID");
    if (!sessionById.has(id)) fail("Saved sessions must reference existing sessions.");
    return id;
  });
  if (new Set(savedSessionIds).size !== savedSessionIds.length) fail("Saved sessions contains a duplicate identifier.");
  const rawNotes = record(root.sessionNotes, "Session notes");
  if (Object.keys(rawNotes).length > PLANNER_LIMITS.sessions) fail("There are too many session notes.");
  const sessionNotes: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawNotes)) {
    const id = identifier(key, "Note session ID");
    if (!sessionById.has(id)) fail("Session notes must reference existing sessions.");
    sessionNotes[id] = text(value, "Session note", PLANNER_LIMITS.notes);
  }
  const connections = list(root.connections, "Connections", PLANNER_LIMITS.connections).map((value): Connection => {
    const item = record(value, "Connection", ["id", "conferenceId", "name", "role", "company", "status", "notes", "linkedInUrl", "followUpDate"]);
    const conferenceId = identifier(item.conferenceId, "Connection conference ID");
    if (!conferenceById.has(conferenceId)) fail("Every connection must belong to an existing conference.");
    if (item.status !== "want-to-meet" && item.status !== "met" && item.status !== "follow-up") fail("Choose a valid connection status.");
    return {
      id: identifier(item.id, "Connection ID"), conferenceId, name: text(item.name, "Connection name", 200, true),
      role: text(item.role, "Connection role", 200), company: text(item.company, "Connection company", 200),
      status: item.status, notes: text(item.notes, "Connection notes", PLANNER_LIMITS.notes),
      linkedInUrl: webUrl(item.linkedInUrl, "Connection profile"),
      followUpDate: item.followUpDate === "" ? "" : dateOnly(item.followUpDate, "Follow-up date"),
    };
  });
  ensureUnique(connections, "Connections");
  return { conferences, sessions, savedSessionIds, sessionNotes, connections, initialized: root.initialized };
}
