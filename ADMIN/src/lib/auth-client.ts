// Better Auth client for the dashboard.
//
// The dashboard and the content API share an origin: nginx serves this app
// at admin.afosi.org and proxies admin.afosi.org/api/* to the CMS service.
// So the session is a first-party, httpOnly cookie that page scripts cannot
// read, instead of the old token kept in localStorage, where any script on
// the page (or any XSS) could lift it.

import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  basePath: "/api/auth",
  plugins: [adminClient()],
});

export type Session = typeof authClient.$Infer.Session;

// A short-lived signed token for the applications service, which lives on
// api.afosi.org and so cannot see this origin's cookie. It verifies the
// token against the CMS service's public keys. Cached until shortly before
// it expires.
let cached: { token: string; exp: number } | null = null;

export async function getServiceToken(): Promise<string | null> {
  const now = Date.now() / 1000;
  if (cached && cached.exp - now > 60) return cached.token;
  const res = await fetch("/api/auth/token", { credentials: "include" });
  if (!res.ok) {
    cached = null;
    return null;
  }
  const { token } = await res.json();
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    cached = { token, exp: payload.exp };
  } catch {
    cached = null;
  }
  return token;
}

export function clearServiceToken() {
  cached = null;
}

// The old login left its token and flag in localStorage. Nothing reads them
// any more; clear them so a stale token is not sitting in the browser.
try {
  localStorage.removeItem("afosi_admin_token");
  localStorage.removeItem("afosi_admin_auth");
} catch {
  /* storage blocked: nothing to clear */
}
