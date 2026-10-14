import{DISCUSSION_TALKS}from'./talk-discussion.ts';
import{eventContextForOrigin}from'./event-context.ts';
import{publicPlanPath}from'./public-plan.ts';
import{publicVenuePath}from'./venue.ts';
import { createClerkClient } from "@clerk/backend";
import type { AuthContext } from "./auth-context.ts";
export type AuthEnv = {
  DEVYO_ENVIRONMENT?: "local" | "staging" | "production";
  CLERK_PUBLISHABLE_KEY?: string;
  CLERK_SECRET_KEY?: string;
  CLERK_JWT_KEY?: string;
  CLERK_ISSUER?: string;
  DEVYO_CLERK_INSTANCE_ID?: string;
  DEVYO_ORIGIN?: string;
  DEVYO_ADDITIONAL_ORIGINS?: string;
  DEVYO_ALLOWED_USER_IDS?: string;
  DEVYO_ACCESS_POLICY?: "allowlist" | "registered";
};
export type VerifiedSession = { userId: string | null; sessionId: string | null; sessionClaims: Record<string, unknown> | null; recentlyVerified?: boolean };
export type Verification = { session: VerifiedSession | null; headers: Headers; handshake: boolean };
export type AuthConfig = { instanceId?:string;publishableKey: string; secretKey?: string; jwtKey?: string; issuer: string; origin: string; origins:string[]; allowedUsers: Set<string>; accessPolicy: "allowlist" | "registered" };
// Configuration comes only from Worker bindings, never request headers or browser input.
export function readAuthConfig(env: AuthEnv): AuthConfig | null {
  try {
    if (!env.CLERK_PUBLISHABLE_KEY || !env.CLERK_SECRET_KEY || !env.CLERK_ISSUER || !env.DEVYO_ORIGIN) return null;
    if (env.DEVYO_ENVIRONMENT === "production" && (!env.CLERK_PUBLISHABLE_KEY.startsWith("pk_live_") || !env.CLERK_SECRET_KEY.startsWith("sk_live_"))) return null;
    if(env.DEVYO_CLERK_INSTANCE_ID&&!/^ins_[A-Za-z0-9]+$/.test(env.DEVYO_CLERK_INSTANCE_ID))return null;
    const origin = new URL(env.DEVYO_ORIGIN);
    if (origin.origin !== env.DEVYO_ORIGIN || (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname)))) return null;
    if(env.DEVYO_ENVIRONMENT && !["local","staging","production"].includes(env.DEVYO_ENVIRONMENT))return null;
    if(env.DEVYO_ENVIRONMENT!=="local" && env.DEVYO_ENVIRONMENT && (origin.protocol!=="https:" || (origin.hostname==="localhost" || origin.hostname.endsWith(".localhost") || origin.hostname.startsWith("127.") || origin.hostname==="[::1]")))return null;
    if(env.CLERK_SECRET_KEY.startsWith("sk_live_") && origin.protocol!=="https:")return null;
    const additional=(env.DEVYO_ADDITIONAL_ORIGINS??'').split(',').map(value=>value.trim()).filter(Boolean);
    if(additional.length>1||additional.some(value=>{const parsed=new URL(value);return parsed.origin!==value||parsed.protocol!=='https:'||/[^a-z0-9.-]/i.test(parsed.hostname)||parsed.hostname==='localhost'||parsed.hostname.endsWith('.localhost')||parsed.hostname.startsWith('127.')||parsed.hostname==='[::1]'}))return null;
    const origins=[...new Set([origin.origin,...additional])];
    const issuer = new URL(env.CLERK_ISSUER);
    if (issuer.origin !== env.CLERK_ISSUER || issuer.protocol !== "https:") return null;
    const allowedUsers = new Set((env.DEVYO_ALLOWED_USER_IDS ?? "").split(",").map(x => x.trim()).filter(Boolean));
    const accessPolicy = env.DEVYO_ACCESS_POLICY ?? "allowlist";
    if (!["allowlist", "registered"].includes(accessPolicy) || (accessPolicy === "registered" && env.DEVYO_ENVIRONMENT !== "production")) return null;
    if ((accessPolicy === "allowlist" && !allowedUsers.size) || [...allowedUsers].some(x => !/^user_[A-Za-z0-9]+$/.test(x))) return null;
    return { instanceId:env.DEVYO_CLERK_INSTANCE_ID,publishableKey: env.CLERK_PUBLISHABLE_KEY, secretKey: env.CLERK_SECRET_KEY, jwtKey: env.CLERK_JWT_KEY, issuer: issuer.origin, origin: origin.origin, origins, allowedUsers, accessPolicy };
  } catch { return null; }
}
export async function verifyClerkSession(request: Request, config: AuthConfig): Promise<Verification> {
  const client = createClerkClient({ publishableKey: config.publishableKey, secretKey: config.secretKey, jwtKey: config.jwtKey });
  const state = await client.authenticateRequest(request, { authorizedParties: config.origins, acceptsToken: "session_token" });
  const auth = state.isAuthenticated ? state.toAuth() : null;
  return { session: auth && "userId" in auth ? { userId: auth.userId, sessionId: auth.sessionId, sessionClaims: auth.sessionClaims, recentlyVerified: auth.has({reverification:'strict'}) } : null, headers: state.headers, handshake: state.status === "handshake" };
}
export async function authenticate(request: Request, env: AuthEnv, verify = verifyClerkSession): Promise<{ context: AuthContext; headers: Headers; handshake: boolean }> {
  const empty = (status: AuthContext["status"], publishableKey?: string, registrationOpen = false) => ({ context: { user: null, status, publishableKey, registrationOpen }, headers: new Headers(), handshake: false });
  const config = readAuthConfig(env);
  if (!config || !config.origins.includes(new URL(request.url).origin)) return empty("unconfigured");
  try {
    const result = await verify(request, config);
    if (!result.session) return { ...empty("anonymous", config.publishableKey, config.accessPolicy === "registered"), headers: result.headers, handshake: result.handshake };
    const { userId, sessionId, sessionClaims: claims } = result.session;
    const now = Date.now() / 1000;
    // Defense in depth after the SDK's signature/session validation. No email linkage.
    if (!userId || !sessionId || !claims || claims.sub !== userId || claims.iss !== config.issuer || typeof claims.azp!=='string'||!config.origins.includes(claims.azp) || typeof claims.exp !== "number" || !Number.isFinite(claims.exp) || claims.exp <= now || typeof claims.nbf !== "number" || !Number.isFinite(claims.nbf) || claims.nbf > now || (claims.sts && claims.sts !== "active")) return empty("anonymous", config.publishableKey);
    if (config.accessPolicy === "allowlist" && !config.allowedUsers.has(userId)) return empty("forbidden", config.publishableKey);
    return { context: { user: { userId: `clerk:${config.issuer}:${userId}`, displayName: "Attendee" }, sessionId,eventId:eventContextForOrigin(new URL(request.url).origin,config.origins), status: "authenticated", publishableKey: config.publishableKey, registrationOpen: config.accessPolicy === "registered", recentlyVerified: result.session.recentlyVerified === true }, headers: result.headers, handshake: false };
  } catch { return empty("anonymous", config.publishableKey, config.accessPolicy === "registered"); }
}
export function stripLegacyIdentity(request: Request): Request {
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) if (name.startsWith("oai-authenticated-user-") || name.startsWith("x-clerk-") || name.startsWith("x-devyo-")) headers.delete(name);
  return new Request(request, { headers });
}
export function privateAccessResponse(request: Request, context: AuthContext): Response | null {
  const path = new URL(request.url).pathname;
  const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && (request.headers.get("Origin") !== new URL(request.url).origin || request.headers.get("Sec-Fetch-Site") === "cross-site")) return Response.json({ error: "Changes must come from this site." }, { status: 403, headers });
  if (context.user) return null;
  // Only login shells/static assets can be anonymous. Shared schedules remain private in staging.
  if ((request.method === "GET" || request.method === "HEAD") && (publicVenuePath(path) || publicPlanPath(path) || ["/", "/sign-in", "/sign-up", "/privacy"].includes(path) || path.startsWith("/assets/") || ["/favicon.svg", "/thunderplains-mark.svg"].includes(path))) return null;
  if((request.method==='GET'||request.method==='HEAD')&&request.headers.get('Accept')?.includes('text/html')&&(path==='/discussion-moderation'||DISCUSSION_TALKS.some(t=>path==='/discussions/'+encodeURIComponent(t.id))))return new Response(null,{status:303,headers:{...headers,Location:'/sign-in'}});
  // Browser deep links open the app's auth flow without forwarding the share token.
  if ((request.method === "GET" || request.method === "HEAD") && /^\/share\/[A-Za-z0-9_-]{43}$/.test(path) && request.headers.get("Accept")?.includes("text/html")) return new Response(null, { status: 303, headers: { ...headers, Location: "/sign-in" } });
  const status = context.status === "unconfigured" ? 503 : context.status === "forbidden" ? 403 : 401;
  return Response.json({ error: status === 503 ? "Sign-in is not configured." : "Sign in to access your Devyo account." }, { status, headers });
}
