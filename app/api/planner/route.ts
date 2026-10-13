import { and, eq } from "drizzle-orm";
import { getAppUser } from "@/app/auth";
import {getAuthContext} from '@/lib/auth-context';
import {plannerIdentityMatches} from '@/lib/talk-preferences';
import { getDb } from "@/db";
import { plannerStates } from "@/db/schema";
import { emptyState, PLANNER_LIMITS, PlannerValidationError, validateState } from "@/lib/planner";
import {env} from 'cloudflare:workers';
import programSeed from '@/lib/event-data.json';
import type {ProgramSeed} from '@/lib/program-model';
import {OrganizerReviewError} from '@/lib/organizer-review-model';
import {readOrganizerPlanner,saveOrganizerPlanner} from '@/lib/organizer-review-store';

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" };
function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers });
}

class RequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function readBody(request: Request): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type") ?? "")) {
    throw new RequestError("Send the planner as application/json.", 415);
  }
  const length = request.headers.get("Content-Length");
  if (length && (!/^\d+$/.test(length) || Number(length) > PLANNER_LIMITS.bodyBytes)) {
    throw new RequestError("The planner is too large. Keep the saved data under 500 KB.", 413);
  }
  if (!request.body) throw new RequestError("A planner snapshot is required.", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > PLANNER_LIMITS.bodyBytes) {
        await reader.cancel();
        throw new RequestError("The planner is too large. Keep the saved data under 500 KB.", 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer)); }
  catch { throw new RequestError("The planner request contains invalid JSON.", 400); }
}

export async function GET(request?:Request): Promise<Response> {
  try {
    const user = await getAppUser();
    if (!user) return json({ error: "Sign in to open your private planner." }, 401);
    if(env.DEVYO_ORGANIZER_REVIEW_SCHEMA_READY==='true'){
      if(!request?.headers.get('X-Expected-Devyo-User')||!request.headers.get('X-Expected-Devyo-Session')||!plannerIdentityMatches(request.headers.get('X-Expected-Devyo-User'),request.headers.get('X-Expected-Devyo-Session'),user.userId,getAuthContext().sessionId))return json({error:'Your sign-in session changed. Reload to open your planner.'},409);
      if(!env.DB)throw new Error('Missing database');const {intent:_,...snapshot}=await readOrganizerPlanner(env.DB,user.userId,programSeed as unknown as ProgramSeed);return json(snapshot);
    }
    const db = getDb();
    const [row] = await db.select().from(plannerStates).where(eq(plannerStates.ownerId, user.userId)).limit(1);
    if (!row) return json({ state: emptyState(), revision: 0 });
    // Stored JSON is also validated: a corrupt snapshot must never silently overwrite user data.
    const state = validateState(JSON.parse(row.stateJson));
    return json({ state, revision: row.revision });
  } catch (error) {
    if(error instanceof OrganizerReviewError)return json({error:error.message},error.status);
    return json({ error: "Your saved planner could not be loaded. Please try again; your data has not been changed." }, 503);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const user = await getAppUser();
    if (!user) return json({ error: "Sign in to save your private planner." }, 401);
    if((env.DEVYO_ORGANIZER_REVIEW_SCHEMA_READY==='true'&&(!request.headers.get('X-Expected-Devyo-User')||!request.headers.get('X-Expected-Devyo-Session')))||!plannerIdentityMatches(request.headers.get('X-Expected-Devyo-User'),request.headers.get('X-Expected-Devyo-Session'),user.userId,getAuthContext().sessionId))return json({error:'Your sign-in session changed. Reload before saving.'},409);
    const origin = request.headers.get("Origin");
    if ((origin !== new URL(request.url).origin) || request.headers.get("Sec-Fetch-Site") === "cross-site") {
      return json({ error: "Planner changes must come from this site." }, 403);
    }
    const body = await readBody(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new RequestError("A planner snapshot and revision are required.", 400);
    const envelope = body as Record<string, unknown>;
    if (Object.keys(envelope).some((key) => key !== "state" && key !== "revision" && !(env.DEVYO_ORGANIZER_REVIEW_SCHEMA_READY==='true'&&key==='programRevisions'))) {
      throw new RequestError("The request has unsupported fields.", 400);
    }
    if (!Number.isSafeInteger(envelope.revision) || (envelope.revision as number) < 0 || (envelope.revision as number) >= Number.MAX_SAFE_INTEGER) {
      throw new RequestError("The planner revision must be a non-negative integer.", 400);
    }
    const state = validateState(envelope.state);
    const revision = envelope.revision as number;
    if(env.DEVYO_ORGANIZER_REVIEW_SCHEMA_READY==='true'){
      if(!env.DB)throw new Error('Missing database');return json(await saveOrganizerPlanner(env.DB,user.userId,programSeed as unknown as ProgramSeed,state,revision,envelope.programRevisions));
    }
    const nextRevision = revision + 1;
    const db = getDb();
    const values = { stateJson: JSON.stringify(state), revision: nextRevision, updatedAt: new Date().toISOString() };
    // Each write is a single atomic compare-and-swap. A stale tab cannot overwrite a newer save.
    const written = revision === 0
      ? await db.insert(plannerStates).values({ ownerId: user.userId, ...values }).onConflictDoNothing({ target: plannerStates.ownerId }).returning({ revision: plannerStates.revision })
      : await db.update(plannerStates).set(values).where(and(eq(plannerStates.ownerId, user.userId), eq(plannerStates.revision, revision))).returning({ revision: plannerStates.revision });
    if (!written.length) return json({ error: "This planner changed in another tab. Reload to get the latest version before saving again." }, 409);
    return json({ state, revision: nextRevision });
  } catch (error) {
    if(error instanceof OrganizerReviewError)return json({error:error.message},error.status);
    if (error instanceof RequestError) return json({ error: error.message }, error.status);
    if (error instanceof PlannerValidationError) return json({ error: error.message }, 400);
    return json({ error: "Your changes could not be saved. Please try again." }, 503);
  }
}
