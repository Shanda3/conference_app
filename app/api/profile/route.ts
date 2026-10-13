import {ensureLinkedInVisibility} from "@/lib/profile-visibility";
import { eq } from "drizzle-orm";
import { getAppUser } from "@/app/auth";
import { getDb } from "@/db";
import { profiles } from "@/lib/social-schema";
import { assertSameOrigin, PRIVATE_RESPONSE_HEADERS, readSharingBody, SharingError, validateDisplayName, validateCompany, validateLinkedInUrl, validateProfileBody } from "@/lib/sharing";

export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: PRIVATE_RESPONSE_HEADERS });

export async function GET(): Promise<Response> {
  try {
    const user = await getAppUser();
    if (!user) return json({ error: "Sign in to open your profile." }, 401);
    const db=getDb();await ensureLinkedInVisibility(db);
    const [profile] = await db.select({ displayName: profiles.displayName, company: profiles.company, linkedInUrl: profiles.linkedInUrl, linkedInVisible:profiles.linkedInVisible }).from(profiles).where(eq(profiles.ownerId, user.userId)).limit(1);
    return json({ profile: profile ? { displayName: validateDisplayName(profile.displayName), company: validateCompany(profile.company), linkedInUrl: validateLinkedInUrl(profile.linkedInUrl), linkedInVisible:profile.linkedInVisible===true } : null });
  } catch {
    return json({ error: "Your profile could not be loaded. Please try again." }, 503);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const user = await getAppUser();
    if (!user) return json({ error: "Sign in to save your profile." }, 401);
    assertSameOrigin(request);
    const profile = validateProfileBody(await readSharingBody(request));
    const db=getDb();await ensureLinkedInVisibility(db);
    const [existing]=await db.select({linkedInUrl:profiles.linkedInUrl,linkedInVisible:profiles.linkedInVisible}).from(profiles).where(eq(profiles.ownerId,user.userId)).limit(1);
    const effectiveUrl=profile.linkedInUrl??existing?.linkedInUrl??"";
    if(profile.linkedInVisible===true&&!effectiveUrl)throw new SharingError("Add a valid LinkedIn profile link before showing it to attendees.");
    if(profile.linkedInUrl!==undefined&&profile.linkedInVisible===undefined&&profile.linkedInUrl!==existing?.linkedInUrl)profile.linkedInVisible=false;
    if(!effectiveUrl)profile.linkedInVisible=false;
    const now = new Date().toISOString();
    const [saved] = await db.insert(profiles).values({ ownerId: user.userId, ...profile, company: profile.company ?? "", linkedInUrl: profile.linkedInUrl ?? "", createdAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: profiles.ownerId, set: { ...profile, updatedAt: now } })
      .returning({ displayName: profiles.displayName, company: profiles.company, linkedInUrl: profiles.linkedInUrl, linkedInVisible:profiles.linkedInVisible });
    return json({ profile: saved });
  } catch (error) {
    if (error instanceof SharingError) return json({ error: error.message }, error.status);
    return json({ error: "Your profile could not be saved. Please try again." }, 503);
  }
}
