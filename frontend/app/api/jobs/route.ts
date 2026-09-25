import { requireCompleteProfile } from "@/lib/profile-access";
import { getJobs } from "@/lib/jobs";

export async function GET(request: Request) {
  const denied = await requireCompleteProfile(request);
  if (denied) return denied;
  const value = new URL(request.url).searchParams.get("before");
  const before = value === null ? null : Number(value);
  if (value !== null && (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(before))) {
    return Response.json({ error: "Invalid cursor" }, { status: 400 });
  }
  const result = await getJobs(before);
  if (!result.ok) return Response.json({ error: "Jobs are unavailable. Please try again." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  return Response.json(result.page, { headers: { "Cache-Control": "no-store" } });
}
