import { agentRequest } from "@/lib/application-agent";
export const runtime = "nodejs";
export async function GET() {
  try {
    const response = await agentRequest("/auth/config");
    if (!response.ok) throw new Error();
    const { publishableKey } = await response.json() as { publishableKey?: unknown };
    if (typeof publishableKey !== "string" || !/^pk_(test|live)_[A-Za-z0-9=]+$/.test(publishableKey)) throw new Error();
    return Response.json({ publishableKey }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Sign-in is temporarily unavailable. Please try again." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
