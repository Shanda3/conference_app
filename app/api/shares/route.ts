import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { plannerStates } from "@/db/schema";
import { profiles, scheduleShares } from "@/lib/social-schema";
import verifiedCatalog from "@/lib/event-data.json";
import { validateState } from "@/lib/planner";
import { assertSameOrigin, createShareToken, hashShareToken, hashSharedSchedule, objectWithKeys, PRIVATE_RESPONSE_HEADERS, projectSharedSchedule, readSharingBody, SHARE_LIMITS, SharingError, validateDisplayName, validateSharedSchedule } from "@/lib/sharing";

export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: PRIVATE_RESPONSE_HEADERS });

async function ownerSnapshot(ownerId: string) {
  const db = getDb();
  const [profile] = await db.select({ displayName: profiles.displayName }).from(profiles).where(eq(profiles.ownerId, ownerId)).limit(1);
  if (!profile) throw new SharingError("Save a display name in your profile before sharing.", 409);
  const [row] = await db.select({ stateJson: plannerStates.stateJson, revision: plannerStates.revision }).from(plannerStates).where(eq(plannerStates.ownerId, ownerId)).limit(1);
  if (!row) throw new SharingError("Save your planner before creating a share link.", 409);
  const projected = projectSharedSchedule(validateState(JSON.parse(row.stateJson)), validateDisplayName(profile.displayName), verifiedCatalog);
  return { ...projected, revision: row.revision, previewHash: await hashSharedSchedule(projected.preview) };
}

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await getChatGPTUser();
    if (!user) return json({ error: "Sign in with ChatGPT to manage schedule links." }, 401);
    if (new URL(request.url).searchParams.get("preview") === "1") return json(await ownerSnapshot(user.userId));
    const rows = await getDb().select({ shareId: scheduleShares.shareId, createdAt: scheduleShares.createdAt, revokedAt: scheduleShares.revokedAt, payloadJson: scheduleShares.payloadJson })
      .from(scheduleShares).where(eq(scheduleShares.ownerId, user.userId))
      .orderBy(asc(sql`${scheduleShares.revokedAt} IS NOT NULL`), desc(scheduleShares.createdAt)).limit(100);
    return json({ shares: rows.map((row) => ({ shareId: row.shareId, createdAt: row.createdAt, revoked: row.revokedAt !== null, sessionCount: validateSharedSchedule(JSON.parse(row.payloadJson)).sessions.length })) });
  } catch (error) {
    if (error instanceof SharingError) return json({ error: error.message }, error.status);
    return json({ error: "Your schedule links could not be loaded. Please try again." }, 503);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await getChatGPTUser();
    if (!user) return json({ error: "Sign in with ChatGPT to share your schedule." }, 401);
    assertSameOrigin(request);
    const body = objectWithKeys(await readSharingBody(request), ["revision", "previewHash"]);
    if (!Number.isSafeInteger(body.revision) || (body.revision as number) < 1) throw new SharingError("Review the saved schedule before creating a link.");
    if (typeof body.previewHash !== "string" || !/^[0-9a-f]{64}$/.test(body.previewHash)) throw new SharingError("Review the share preview before creating a link.");
    const revision = body.revision as number;
    const { preview, revision: currentRevision, previewHash } = await ownerSnapshot(user.userId);
    if (currentRevision !== revision || previewHash !== body.previewHash) throw new SharingError("Your profile or planner changed. Review the share preview again before creating a link.", 409);
    if (!preview.sessions.length) throw new SharingError("Save at least one verified conference session before sharing.", 409);
    const token = createShareToken();
    const tokenHash = await hashShareToken(token);
    const shareId = crypto.randomUUID();
    const now = preview.createdAt;
    const dayAgo = new Date(Date.parse(now) - 86_400_000).toISOString();
    const db = getDb();
    // One atomic insert enforces limits and rejects planner/profile changes during creation.
    // D1 serializes this statement: concurrent requests cannot exceed either owner limit.
    const inserted = await db.all<{ shareId: string }>(sql`
      INSERT INTO ${scheduleShares} (token_hash, share_id, owner_id, payload_json, created_at, revoked_at)
      SELECT ${tokenHash}, ${shareId}, ${user.userId}, ${JSON.stringify(preview)}, ${now}, NULL
      WHERE (SELECT COUNT(*) FROM ${scheduleShares} WHERE owner_id = ${user.userId} AND revoked_at IS NULL) < ${SHARE_LIMITS.activeShares}
        AND (SELECT COUNT(*) FROM ${scheduleShares} WHERE owner_id = ${user.userId} AND created_at >= ${dayAgo}) < ${SHARE_LIMITS.creationsPerDay}
        AND EXISTS (SELECT 1 FROM ${plannerStates} WHERE owner_id = ${user.userId} AND revision = ${revision})
        AND EXISTS (SELECT 1 FROM ${profiles} WHERE owner_id = ${user.userId} AND display_name = ${preview.displayName})
      RETURNING share_id AS shareId
    `);
    if (!inserted.length) {
      const latest = await ownerSnapshot(user.userId);
      if (latest.revision !== revision || latest.preview.displayName !== preview.displayName) throw new SharingError("Your profile or planner changed. Review the share preview again.", 409);
      throw new SharingError("You can keep 20 active links and create up to 10 links in 24 hours. Revoke an old link or try again later.", 429);
    }
    // The bearer token is returned once, only as the path needed by the creator.
    return json({ path: `/share/${token}`, shareId, preview }, 201);
  } catch (error) {
    if (error instanceof SharingError) return json({ error: error.message }, error.status);
    return json({ error: "Your schedule link could not be created. Please try again." }, 503);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const user = await getChatGPTUser();
    if (!user) return json({ error: "Sign in with ChatGPT to revoke schedule links." }, 401);
    assertSameOrigin(request);
    const body = objectWithKeys(await readSharingBody(request), ["shareId"]);
    if (typeof body.shareId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.shareId)) throw new SharingError("Choose a valid schedule link.");
    const db = getDb();
    const [owned] = await db.select({ shareId: scheduleShares.shareId }).from(scheduleShares).where(and(eq(scheduleShares.shareId, body.shareId), eq(scheduleShares.ownerId, user.userId))).limit(1);
    if (!owned) return json({ error: "Schedule link not found." }, 404);
    await db.update(scheduleShares).set({ revokedAt: new Date().toISOString() })
      .where(and(eq(scheduleShares.shareId, body.shareId), eq(scheduleShares.ownerId, user.userId), isNull(scheduleShares.revokedAt)));
    return json({ revoked: true });
  } catch (error) {
    if (error instanceof SharingError) return json({ error: error.message }, error.status);
    return json({ error: "The link could not be revoked. Please try again." }, 503);
  }
}
