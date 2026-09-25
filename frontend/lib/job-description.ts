import "server-only";
import type { Job } from "@/lib/job-model";

type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue {
  return value && typeof value === "object" ? value as RecordValue : {};
}
function text(value: unknown): string { return typeof value === "string" ? value : ""; }

// This produces text only. The UI always renders it as escaped React text,
// never as HTML from an external job posting.
export function descriptionText(value: unknown): string | null {
  let content = text(value).slice(0, 200_000);
  const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", bull: "•", hellip: "…" };
  for (let pass = 0; pass < 2; pass++) {
    content = content.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
      if (!entity.startsWith("#")) return entities[entity.toLowerCase()] ?? match;
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    });
  }
  return content.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<li\b[^>]*>/gi, "\n• ")
    .replace(/<\/(p|div|h[1-6]|ul|ol)>/gi, "\n\n")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim() || null;
}

async function publicJson(url: string): Promise<RecordValue> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" }, redirect: "error",
    signal: AbortSignal.timeout(6000), next: { revalidate: 300 },
  });
  if (!response.ok) return {};
  return record(await response.json());
}

// Only known ATS endpoints derived from an existing backend job are allowed.
// No caller-supplied URLs, credentials, or arbitrary HTML-page fetching.
export async function fetchJobDescription(job: Job): Promise<string | null> {
  try {
    const url = new URL(job.url);
    const [provider, board] = job.sourceKey.split(":");
    const validBoard = board && /^[a-z\d_-]+$/i.test(board);
    if (provider === "greenhouse" && validBoard) {
      const id = url.searchParams.get("gh_jid") ?? url.pathname.match(/\/jobs\/(\d+)/)?.[1];
      if (!id || !/^\d+$/.test(id)) return null;
      const data = await publicJson(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${id}`);
      return descriptionText(data.content);
    }
    if (provider === "lever" && validBoard && /^(jobs|jobs\.eu)\.lever\.co$/.test(url.hostname)) {
      const id = url.pathname.split("/")[2];
      if (!id || !/^[a-f\d-]+$/i.test(id)) return null;
      const host = url.hostname === "jobs.eu.lever.co" ? "api.eu.lever.co" : "api.lever.co";
      const data = await publicJson(`https://${host}/v0/postings/${board}/${id}?mode=json`);
      const lists = Array.isArray(data.lists) ? data.lists.map((item) => { const section = record(item); return `${text(section.text)}\n${text(section.content)}`; }) : [];
      return descriptionText([data.descriptionPlain ?? data.description, ...lists, data.additionalPlain ?? data.additional].filter(Boolean).join("\n\n"));
    }
    if (provider === "ashby" && validBoard && url.hostname === "jobs.ashbyhq.com") {
      const data = await publicJson(`https://api.ashbyhq.com/posting-api/job-board/${board}`);
      const posting = Array.isArray(data.jobs) ? data.jobs.find((item) => {
        const candidate = record(item);
        return candidate.isListed !== false && text(candidate.jobUrl).split("?")[0] === url.origin + url.pathname.replace(/\/apply\/?$/, "");
      }) : null;
      return descriptionText(record(posting).descriptionPlain ?? record(posting).descriptionHtml);
    }
    if (provider === "workday" && /^[a-z\d-]+\.wd\d+\.myworkdayjobs\.com$/.test(url.hostname) && !url.port) {
      const path = url.pathname.split("/").filter(Boolean);
      if (/^[a-z]{2}-[A-Z]{2}$/.test(path[0] ?? "")) path.shift();
      const site = path.shift();
      if (!site || !/^[a-z\d_-]+$/i.test(site) || path[0] !== "job") return null;
      const tenant = url.hostname.split(".")[0];
      const data = await publicJson(`https://${url.hostname}/wday/cxs/${tenant}/${site}/${path.join("/")}`);
      return descriptionText(record(data.jobPostingInfo).jobDescription);
    }
  } catch { /* The panel still shows verified metadata and the original posting. */ }
  return null;
}
