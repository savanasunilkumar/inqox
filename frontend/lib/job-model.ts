export type Job = {
  id: number;
  title: string;
  company: string;
  domain: string | null;
  location: string | null;
  url: string;
  applyUrl: string | null;
  publishedAt: string | null;
  firstSeenAt: string;
  employmentType: string | null;
  isRemote: boolean | null;
  sourceKey: string;
  match?: JobMatch;
};

export type JobMatch = {
  score: number;
  skills: string[];
  roleMatch: boolean;
  level: string | null;
};

export type JobsPage = {
  items: Job[];
  nextCursor: number | null;
  hasMore: boolean;
};

export type JobsResult =
  | { ok: true; page: JobsPage }
  | { ok: false; reason: "unconfigured" | "unavailable" };

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function parseMatch(value: unknown): JobMatch | undefined {
  if (!value || typeof value !== "object") return undefined;
  const match = value as Record<string, unknown>;
  if (typeof match.score !== "number") return undefined;
  return {
    score: match.score,
    skills: Array.isArray(match.skills) ? match.skills.filter((skill): skill is string => typeof skill === "string") : [],
    roleMatch: match.roleMatch === true,
    level: stringOrNull(match.level),
  };
}

export function parseJob(value: unknown): Job | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const id = Number(source.id);
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const title = stringOrNull(source.title);
  const company = stringOrNull(source.company);
  const url = stringOrNull(source.url);
  if (!title || !company || !url) return null;
  return {
    id,
    title,
    company,
    domain: stringOrNull(source.domain),
    location: stringOrNull(source.location),
    url,
    applyUrl: stringOrNull(source.applyUrl),
    publishedAt: stringOrNull(source.publishedAt),
    firstSeenAt: stringOrNull(source.firstSeenAt) ?? "",
    employmentType: stringOrNull(source.employmentType),
    isRemote: typeof source.isRemote === "boolean" ? source.isRemote : null,
    sourceKey: stringOrNull(source.sourceKey) ?? "",
    ...(parseMatch(source.match) ? { match: parseMatch(source.match) } : {}),
  };
}

export function parseJobsPage(payload: unknown): JobsPage | null {
  if (!payload || typeof payload !== "object") return null;
  const page = payload as Record<string, unknown>;
  if (!Array.isArray(page.items) || typeof page.hasMore !== "boolean") return null;
  const cursor = page.nextCursor == null ? null : Number(page.nextCursor);
  if (cursor !== null && (!Number.isSafeInteger(cursor) || cursor < 1)) return null;
  if (page.hasMore && cursor === null) return null;
  return {
    items: page.items.map(parseJob).filter((job): job is Job => job !== null),
    nextCursor: cursor,
    hasMore: page.hasMore,
  };
}

export function externalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function compactDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

export function relativeDate(value: string | null | undefined, now = Date.now()): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const days = Math.max(0, Math.floor((now - date.getTime()) / 86400000));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;
  }
  return compactDate(value);
}

export type JobDetail = Job & { descriptionText: string | null };

export function parseJobDetail(value: unknown): JobDetail | null {
  const job = parseJob(value);
  if (!job) return null;
  return { ...job, descriptionText: stringOrNull((value as Record<string, unknown>).descriptionText) };
}

export function employmentLabel(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());
}
