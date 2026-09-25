import { requireCompleteProfile } from "@/lib/profile-access";
import { agentRequest } from "@/lib/application-agent";
import { candidateFromProfile } from "@/lib/job-matching";
import { getJobs, getMatchedJobs } from "@/lib/jobs";
import type { Profile } from "@/lib/profile-model";

const headers = { "Cache-Control": "no-store" };
const MAX_OFFSET = 10_000;

async function loadProfile(request: Request): Promise<Profile | null> {
  const token = request.headers.get("X-Clerk-Session-Token");
  if (!token) return null;
  try {
    const response = await agentRequest("/profile", { headers: { "X-Clerk-Session-Token": token } });
    return response.ok ? await response.json() as Profile : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const denied = await requireCompleteProfile(request);
  if (denied) return denied;
  const search = new URL(request.url).searchParams;
  const value = search.get("before");
  const before = value === null ? null : Number(value);
  if (value !== null && (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(before))) {
    return Response.json({ error: "Invalid cursor" }, { status: 400 });
  }
  let result;
  if (search.get("view") === "matched") {
    if (before !== null && before > MAX_OFFSET) return Response.json({ error: "Invalid cursor" }, { status: 400 });
    const profile = await loadProfile(request);
    if (!profile) return Response.json({ error: "Couldn’t load your profile. Please try again." }, { status: 503, headers });
    result = await getMatchedJobs(candidateFromProfile(profile), before ?? 0);
  } else {
    result = await getJobs(before);
  }
  if (!result.ok) return Response.json({ error: "Jobs are unavailable. Please try again." }, { status: 503, headers });
  return Response.json(result.page, { headers });
}
