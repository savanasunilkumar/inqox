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

// Favicon services answer a missing icon with a 404 carrying a generic globe image, which
// browsers still render, so availability is checked here to let the client show initials.
async function firstAvailableIcon(domain: string | null): Promise<string | null> {
  const google = domainLogo(domain);
  if (!google) return null;
  const host = new URL(google).searchParams.get("domain") ?? "";
  for (const url of [google, `https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico`]) {
    try {
      const response = await fetch(url, { next: { revalidate: 604800 }, signal: AbortSignal.timeout(4000) });
      if (response.ok) return url;
    } catch { /* Try the next icon source. */ }
  }
  return null;
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
  const domain = name ? await resolveDomain(name, kind) : null;
  const logo = await firstAvailableIcon(domain);

  if (!logo) return new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=3600" } });
  return new Response(null, {
    status: 302,
    headers: { Location: logo, "Cache-Control": "public, max-age=604800" },
  });
}
