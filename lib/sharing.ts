import type { PlannerState } from "./planner";

export const SHARE_LIMITS = { bodyBytes: 8192, activeShares: 20, creationsPerDay: 10, sessions: 2000 } as const;
export const PRIVATE_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  Vary: "Cookie",
};

export class SharingError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "SharingError";
    this.status = status;
  }
}

export type PublicSession = {
  title: string;
  conferenceName: string;
  start: string;
  end: string;
  timeZone: string;
  room: string;
  speaker: string;
  url: string;
};
export type SharedSchedule = { displayName: string; createdAt: string; sessions: PublicSession[] };
export type VerifiedCatalog = {
  conferences: { id: string; name: string; timeZone: string; verifiedAt: string }[];
  sessions: { id: string; conferenceId: string; title: string; start: string; end: string; room: string; speaker: string; url: string; verifiedAt: string }[];
};

export function objectWithKeys(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SharingError("Send a JSON object.");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length || keys.some((key) => !Object.hasOwn(record, key))) {
    throw new SharingError("The request has missing or unsupported fields.");
  }
  return record;
}

function safeText(value: unknown, max: number, required = false): string {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u001f\u007f]/.test(value) || (required && !value.trim())) {
    throw new SharingError("The shared schedule contains invalid text.");
  }
  return value;
}

export function validateDisplayName(value: unknown): string {
  if (typeof value !== "string") throw new SharingError("Choose a display name between 1 and 60 characters.");
  const displayName = value.trim();
  if (!displayName || displayName.length > 60 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new SharingError("Choose a display name between 1 and 60 characters, without line breaks.");
  }
  if (/\S+@\S+\.\S+/.test(displayName)) throw new SharingError("Use a name or nickname rather than an email address.");
  return displayName;
}

export function validateCompany(value: unknown): string {
  if (typeof value !== "string" || value.length > 120 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new SharingError("Company name must be 120 characters or fewer, without line breaks.");
  }
  return value.trim();
}

export function validateLinkedInUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 300 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new SharingError("Use your public https://www.linkedin.com/in/ profile link.");
  }
  const input = value.trim();
  if (!input) return "";
  // Validate the original spelling before URL parsing can normalize paths or ports.
  if (!/^https:\/\/(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9][A-Za-z0-9_-]{0,99}\/?$/i.test(input)) {
    throw new SharingError("Use a direct https://www.linkedin.com/in/ profile link, without extra paths, tracking parameters, or fragments.");
  }
  const url = new URL(input);
  url.hostname = "www.linkedin.com";
  url.pathname = url.pathname.replace(/^\/in\//i, "/in/").replace(/\/$/, "");
  return url.href;
}

export type ProfilePatch = { displayName: string; company?: string; linkedInUrl?: string; linkedInVisible?: boolean };
export function validateProfileBody(body: unknown): ProfilePatch {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new SharingError("Enter a valid profile.");
  const value = body as Record<string, unknown>;
  if (Object.keys(value).some(key => !["displayName", "company", "linkedInUrl", "linkedInVisible"].includes(key))) {
    throw new SharingError("The profile has unsupported fields.");
  }
  if(Object.hasOwn(value,"linkedInVisible")&&typeof value.linkedInVisible!=="boolean")throw new SharingError("Choose whether to show your LinkedIn to attendees.");
  return {
    ...(Object.hasOwn(value,"linkedInVisible")?{linkedInVisible:value.linkedInVisible as boolean}:{}),
    displayName: validateDisplayName(value.displayName),
    ...(Object.prototype.hasOwnProperty.call(value, "company") ? {company: validateCompany(value.company)} : {}),
    ...(Object.prototype.hasOwnProperty.call(value, "linkedInUrl") ? {linkedInUrl: validateLinkedInUrl(value.linkedInUrl)} : {}),
  };
}

function utcTime(value: unknown): string {
  const text = safeText(value, 30, true);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(text) || !Number.isFinite(Date.parse(text)) || new Date(text).toISOString() !== text) {
    throw new SharingError("The shared schedule contains an invalid time.");
  }
  return text;
}

/** Strict read validation also protects against corrupt or accidentally over-broad stored data. */
export function validateSharedSchedule(value: unknown): SharedSchedule {
  const root = objectWithKeys(value, ["displayName", "createdAt", "sessions"]);
  const displayName = validateDisplayName(root.displayName);
  const createdAt = utcTime(root.createdAt);
  if (!Array.isArray(root.sessions) || root.sessions.length > SHARE_LIMITS.sessions) throw new SharingError("The shared schedule contains too many sessions.");
  const sessions = root.sessions.map((value): PublicSession => {
    const item = objectWithKeys(value, ["title", "conferenceName", "start", "end", "timeZone", "room", "speaker", "url"]);
    const start = utcTime(item.start);
    const end = utcTime(item.end);
    if (Date.parse(start) >= Date.parse(end)) throw new SharingError("The shared schedule contains an invalid time range.");
    const timeZone = safeText(item.timeZone, 100, true);
    try { new Intl.DateTimeFormat("en-US", { timeZone }); }
    catch { throw new SharingError("The shared schedule contains an invalid time zone."); }
    const url = safeText(item.url, 2048);
    if (url) {
      let parsed: URL;
      try { parsed = new URL(url); } catch { throw new SharingError("The shared schedule contains an invalid link."); }
      if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password || /\s/.test(url)) {
        throw new SharingError("The shared schedule contains an invalid link.");
      }
    }
    return {
      title: safeText(item.title, 300, true), conferenceName: safeText(item.conferenceName, 200, true),
      start, end, timeZone, room: safeText(item.room, 200), speaker: safeText(item.speaker, 500), url,
    };
  });
  return { displayName, createdAt, sessions };
}

/** Read only saved IDs from private state. Every session field comes from the verified catalog. */
export function projectSharedSchedule(state: Pick<PlannerState, "savedSessionIds">, displayName: string, catalog: VerifiedCatalog, createdAt = new Date().toISOString()): { preview: SharedSchedule; excludedSessionCount: number } {
  const saved = new Set(state.savedSessionIds);
  const conferences = new Map(catalog.conferences.filter((entry) => Number.isFinite(Date.parse(entry.verifiedAt))).map((entry) => [entry.id, entry]));
  const included = new Set<string>();
  const sessions: PublicSession[] = [];
  for (const session of catalog.sessions) {
    const conference = conferences.get(session.conferenceId);
    if (!saved.has(session.id) || included.has(session.id) || !conference || !Number.isFinite(Date.parse(session.verifiedAt))) continue;
    sessions.push({
      title: session.title, conferenceName: conference.name,
      start: new Date(session.start).toISOString(), end: new Date(session.end).toISOString(),
      timeZone: conference.timeZone, room: session.room, speaker: session.speaker, url: session.url,
    });
    included.add(session.id);
  }
  sessions.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
  return { preview: validateSharedSchedule({ displayName, createdAt, sessions }), excludedSessionCount: saved.size - included.size };
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("Origin");
  if ((origin !== null && origin !== new URL(request.url).origin) || request.headers.get("Sec-Fetch-Site") === "cross-site") {
    throw new SharingError("Changes must come from this site.", 403);
  }
}

export async function readSharingBody(request: Request): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type") ?? "")) throw new SharingError("Send application/json.", 415);
  const length = request.headers.get("Content-Length");
  if (length && (!/^\d+$/.test(length) || Number(length) > SHARE_LIMITS.bodyBytes)) throw new SharingError("Keep requests under 8 KB.", 413);
  if (!request.body) throw new SharingError("A JSON request is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > SHARE_LIMITS.bodyBytes) {
        await reader.cancel();
        throw new SharingError("Keep requests under 8 KB.", 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer)); }
  catch { throw new SharingError("The request contains invalid JSON."); }
}

export function createShareToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function validShareToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashShareToken(token: string): Promise<string> {
  return sha256(token);
}

/** Binds creation to exactly the name and public sessions reviewed by the owner. */
export async function hashSharedSchedule(preview: SharedSchedule): Promise<string> {
  return sha256(JSON.stringify({ displayName: preview.displayName, sessions: preview.sessions }));
}

/** No identity required: knowledge of a live token grants access only to this public snapshot. */
export async function loadSharedSchedule(token: string, lookup: (hash: string) => Promise<{ payloadJson: string; revokedAt: string | null } | undefined>): Promise<SharedSchedule | null> {
  if (!validShareToken(token)) return null;
  const row = await lookup(await hashShareToken(token));
  if (!row || row.revokedAt !== null) return null;
  try { return validateSharedSchedule(JSON.parse(row.payloadJson)); }
  catch { return null; }
}
