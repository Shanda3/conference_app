import { getAuthContext } from "../lib/auth-context.ts";
export async function getAppUser() { return getAuthContext().user; }
export function signInPath(_returnTo = "/") { return "/sign-in"; }
