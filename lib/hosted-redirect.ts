/** Upgrade only requests for the configured hosted domain; never trust redirect query values. */
export function hostedHttpsRedirect(request: Request, env: { DEVYO_ENVIRONMENT?: string; DEVYO_ORIGIN?: string;DEVYO_ADDITIONAL_ORIGINS?:string }): Response | null {
  if (!['staging', 'production'].includes(env.DEVYO_ENVIRONMENT ?? '')) return null;
  try {
    const incoming = new URL(request.url);
    const value=[env.DEVYO_ORIGIN,...(env.DEVYO_ADDITIONAL_ORIGINS??'').split(',').map(v=>v.trim())].find(value=>value&&new URL(value).hostname===incoming.hostname);
    const approved = new URL(value??'');
    if (approved.origin !== value || approved.protocol !== 'https:' || approved.hostname === 'localhost' || approved.hostname.endsWith('.localhost') || approved.hostname.startsWith('127.') || approved.hostname === '[::1]' || incoming.protocol !== 'http:' || incoming.hostname !== approved.hostname) return null;
    const destination = new URL(approved.origin);
    destination.pathname = incoming.pathname;
    destination.search = incoming.search;
    return new Response(null, { status: 308, headers: { Location: destination.href, 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
  } catch { return null; }
}
