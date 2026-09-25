import { domainLogo, pickEntityDomain, type LogoEntityKind } from "@/lib/company-logos";

type Suggestion = { name?: unknown; domain?: unknown };
type University = { name?: unknown; domains?: unknown };

async function fetchJson(url: string): Promise<unknown> {
  try {
    const response = await fetch(url, { next: { revalidate: 604800 }, signal: AbortSignal.timeout(4000), headers: { Accept: "application/json" } });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

async function brandCandidates(name: string) {
  const data = await fetchJson(`https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(name)}`);
  return (Array.isArray(data) ? (data as Suggestion[]) : [])
    .filter(s => typeof s.name === "string" && typeof s.domain === "string")
    .map(s => ({ name: s.name as string, domain: s.domain as string }));
}

async function universityCandidates(name: string) {
  const data = await fetchJson(`http://universities.hipolabs.com/search?name=${encodeURIComponent(name)}`);
  return (Array.isArray(data) ? (data as University[]) : [])
    .filter(u => typeof u.name === "string" && Array.isArray(u.domains) && typeof u.domains[0] === "string")
    .map(u => ({ name: u.name as string, domain: (u.domains as string[])[0] }));
}

async function resolveDomain(name: string, kind: LogoEntityKind): Promise<string | null> {
  const found = pickEntityDomain(name, await brandCandidates(name));
  if (found) return found;
  if (kind === "school") return pickEntityDomain(name, await universityCandidates(name));
  // "Amazon Web Services" → "Amazon": retry with the leading brand word.
  const firstWord = name.trim().split(/\s+/)[0] ?? "";
  if (firstWord.length >= 4 && firstWord !== name.trim()) {
    const [top] = await brandCandidates(firstWord);
    if (top) return pickEntityDomain(firstWord, [top]);
  }
  return null;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const name = (params.get("name") ?? "").trim().slice(0, 120);
  const kind: LogoEntityKind = params.get("kind") === "school" ? "school" : "company";
  const logo = name ? domainLogo(await resolveDomain(name, kind)) : null;

  if (!logo) return new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=3600" } });
  return new Response(null, {
    status: 302,
    headers: { Location: logo, "Cache-Control": "public, max-age=604800" },
  });
}
