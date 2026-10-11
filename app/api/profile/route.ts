import { eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { profiles } from "@/lib/social-schema";
import { assertSameOrigin, PRIVATE_RESPONSE_HEADERS, readSharingBody, SharingError, validateDisplayName, validateCompany, validateLinkedInUrl, validateProfileBody } from "@/lib/sharing";

export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: PRIVATE_RESPONSE_HEADERS });

export async function GET(): Promise<Response> {
  try {
    const user = await getChatGPTUser();
    if (!user) return json({ error: "Sign in with ChatGPT to open your profile." }, 401);
    const [profile] = await getDb().select({ displayName: profiles.displayName, company: profiles.company, linkedInUrl: profiles.linkedInUrl }).from(profiles).where(eq(profiles.ownerId, user.userId)).limit(1);
    return json({ profile: profile ? { displayName: validateDisplayName(profile.displayName), company: validateCompany(profile.company), linkedInUrl: validateLinkedInUrl(profile.linkedInUrl) } : null });
  } catch {
    return json({ error: "Your profile could not be loaded. Please try again." }, 503);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const user = await getChatGPTUser();
    if (!user) return json({ error: "Sign in with ChatGPT to save your profile." }, 401);
    assertSameOrigin(request);
    const profile = validateProfileBody(await readSharingBody(request));
    const now = new Date().toISOString();
    const [saved] = await getDb().insert(profiles).values({ ownerId: user.userId, ...profile, company: profile.company ?? "", linkedInUrl: profile.linkedInUrl ?? "", createdAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: profiles.ownerId, set: { ...profile, updatedAt: now } })
      .returning({ displayName: profiles.displayName, company: profiles.company, linkedInUrl: profiles.linkedInUrl });
    return json({ profile: saved });
  } catch (error) {
    if (error instanceof SharingError) return json({ error: error.message }, error.status);
    return json({ error: "Your profile could not be saved. Please try again." }, 503);
  }
}
