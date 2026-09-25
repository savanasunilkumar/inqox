import { createClerkClient, type ClerkClient } from "@clerk/backend";

type AuthEnv = Pick<Env, "CLERK_SECRET_KEY" | "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" | "CLERK_AUTHORIZED_PARTIES">;

export function clerkClient(env: AuthEnv) {
  return createClerkClient({
    secretKey: env.CLERK_SECRET_KEY.trim(),
    publishableKey: env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.trim(),
  });
}

export async function authenticateUser(request: Request, env: AuthEnv, client: ClerkClient = clerkClient(env)) {
  const token = request.headers.get("X-Clerk-Session-Token");
  if (!token || token.length > 16384) return null;
  try {
    const parties = env.CLERK_AUTHORIZED_PARTIES.split(",").map((value) => value.trim()).filter(Boolean);
    if (!parties.length) return null;
    // Service identity occupies Authorization on the incoming request. Only this
    // separate, verified Clerk session determines ownership of personal data.
    const state = await client.authenticateRequest(new Request(request.url, {
      headers: { Authorization: `Bearer ${token}` },
    }), { acceptsToken: "session_token", authorizedParties: parties });
    if (!state.isAuthenticated) return null;
    const auth = state.toAuth();
    const publishableKey = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.trim();
    const domain = atob(publishableKey.replace(/^pk_(test|live)_/, "")).replace(/\$$/, "");
    if (!/^[a-zA-Z0-9.-]+$/.test(domain) || auth.sessionClaims.iss !== `https://${domain}` ||
        !auth.userId || !/^user_[a-zA-Z0-9]+$/.test(auth.userId) || !auth.sessionId ||
        auth.sessionClaims.sts === "pending") return null;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(domain));
    const instance = Array.from(new Uint8Array(digest)).slice(0, 12).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return { userId: auth.userId, owner: `clerk-${instance}-${auth.userId}`, client };
  } catch {
    return null;
  }
}
