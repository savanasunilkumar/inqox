import "server-only";
import { hasJobBoardPreviewAccess } from "@/lib/job-board-access";
import { agentRequest } from "@/lib/application-agent";
export async function requireCompleteProfile(request: Request): Promise<Response | null> {
  const token = request.headers.get("X-Clerk-Session-Token");
  const headers = { "Cache-Control": "no-store" };
  if (!token || token.length > 16384) return Response.json({ error: "Sign in to continue." }, { status: 401, headers });
  try {
    const response = await agentRequest("/onboarding", { headers: { "X-Clerk-Session-Token": token } });
    if (!response.ok) return Response.json({ error: response.status === 401 ? "Sign in to continue." : "Couldn’t check your profile. Please try again." }, { status: response.status === 401 ? 401 : 503, headers });
    const status = await response.json() as { complete?: boolean };
    // The unchanged application service has authenticated this exact token above.
    // Decode its subject only AFTER that check succeeds; never trust a caller's email.
    const pathname = new URL(request.url).pathname;
    const jobsRead = request.method === "GET" && (pathname === "/api/jobs" || /^\/api\/jobs\/[1-9]\d*$/.test(pathname));
    if (jobsRead) {
      try {
        const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        const claims = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "="))) as Record<string, unknown>;
        const emailHeader = request.headers.get("X-Clerk-User-Email") || request.headers.get("X-User-Email");
        if (
          hasJobBoardPreviewAccess(claims.sub as string) ||
          hasJobBoardPreviewAccess(claims.email as string) ||
          hasJobBoardPreviewAccess(claims.email_address as string) ||
          hasJobBoardPreviewAccess(claims.primary_email as string) ||
          (emailHeader && hasJobBoardPreviewAccess(emailHeader))
        ) return null;
      } catch { /* Invalid subjects receive the normal profile-completion check. */ }
    }
    if (status.complete !== true) return Response.json({ error: "Complete and save your profile first.", code: "profile_required" }, { status: 403, headers });
    return null;
  } catch { return Response.json({ error: "Couldn’t check your profile. Please try again." }, { status: 503, headers }); }
}
