import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { parseJob, parseJobDetail, parseJobsPage, type JobsResult } from "@/lib/job-model";

const PAGE_SIZE = 18;

function apiBaseUrl(): string | null {
  const configured = getCloudflareContext().env.JOBS_API_BASE_URL?.trim();
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return configured.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

async function apiGet(path: string, params?: URLSearchParams): Promise<Response | null> {
  const base = apiBaseUrl();
  if (!base) return null;
  const url = `${base}${path}${params?.size ? `?${params}` : ""}`;
  const headers: HeadersInit = { Accept: "application/json" };
  const token = getCloudflareContext().env.JOBS_API_TOKEN?.trim();
  if (!token) return null;
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(url, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
}

export async function getJobs(before: number | null): Promise<JobsResult> {
  if (!apiBaseUrl()) return { ok: false, reason: "unconfigured" };
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (before) params.set("before", String(before));
  try {
    const response = await apiGet("/jobs", params);
    if (!response?.ok) return { ok: false, reason: "unavailable" };
    const page = parseJobsPage(await response.json());
    return page ? { ok: true, page } : { ok: false, reason: "unavailable" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export async function getJobBoardData(before: number | null) {
  const result = await getJobs(before);
  return { result, now: Date.now() };
}

export async function getJob(id:number) {
  try { const response=await apiGet(`/jobs/${id}`); return response?.ok?parseJob(await response.json()):null; } catch {return null;}
}

export async function getJobDetails(id: number) {
  try {
    const response = await apiGet(`/jobs/${id}`);
    if (response?.status === 404) return { status: 404 as const, job: null };
    if (!response?.ok) return { status: 503 as const, job: null };
    const job = parseJobDetail(await response.json());
    return job ? { status: 200 as const, job } : { status: 503 as const, job: null };
  } catch { return { status: 503 as const, job: null }; }
}
