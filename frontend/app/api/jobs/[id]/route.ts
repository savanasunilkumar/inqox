import { requireCompleteProfile } from "@/lib/profile-access";
import { getJobDetails } from "@/lib/jobs";
import { descriptionText, fetchJobDescription } from "@/lib/job-description";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireCompleteProfile(request);
  if (denied) return denied;
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) return Response.json({ error: "Invalid job ID" }, { status: 400 });
  const result = await getJobDetails(Number(id));
  if (!result.job) return Response.json({ error: result.status === 404 ? "Job no longer available" : "Job details unavailable" }, { status: result.status, headers: { "Cache-Control": "no-store" } });
  const description = descriptionText(result.job.descriptionText) ?? await fetchJobDescription(result.job);
  return Response.json({ ...result.job, descriptionText: description }, { headers: { "Cache-Control": "no-store" } });
}
