// Only request known ATS hosts. Company domains are sent to the favicon service,
// never fetched directly by our server.
export function boardUrl(sourceKey: string): string | null {
  const match = /^(ashby|greenhouse|lever|smartrecruiters):([a-zA-Z0-9][a-zA-Z0-9_-]{0,99})$/.exec(sourceKey);
  if (!match) return null;
  const [, adapter, tenant] = match;
  const hosts: Record<string, string> = {
    ashby: "https://jobs.ashbyhq.com/",
    greenhouse: "https://job-boards.greenhouse.io/",
    lever: "https://jobs.lever.co/",
    smartrecruiters: "https://careers.smartrecruiters.com/",
  };
  return hosts[adapter] + encodeURIComponent(tenant);
}

export function domainLogo(domain: string | null): string | null {
  if (!domain) return null;
  try {
    const url = new URL(domain.includes("://") ? domain : `https://${domain}`);
    const host = url.hostname.toLowerCase();
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.port ||
      !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)) return null;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
  } catch {
    return null;
  }
}

export function extractBoardLogo(html: string): string | null {
  // Prefer the square company mark, never the ATS provider's own favicon.
  const patterns = [
    /"logoSquareImageUrl"\s*:\s*"([^"\s]+)"/,
    /https:\/\/c\.smartrecruiters\.com\/sr-company-logo-[^"'<>\s]+/,
    /https:\/\/lever-client-logos\.s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com\/[^"'<>\s]+/,
    /https:\/\/[^/"'<>\s]*\.cdn\.greenhouse\.io\/external_greenhouse_job_boards\/logos\/[^"'<>\s]+/,
    /"logoWordmarkImageUrl"\s*:\s*"([^"\s]+)"/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (!match) continue;
    const value = (match[1] ?? match[0]).replace(/&amp;/g, "&").replace(/\\u0026/g, "&").replace(/\\\//g, "/");
    try {
      const url = new URL(value);
      const trusted = url.hostname === "app.ashbyhq.com" ||
        url.hostname === "c.smartrecruiters.com" ||
        /^lever-client-logos\.s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/.test(url.hostname) ||
        /^(?:[a-z0-9-]+\.)*cdn\.greenhouse\.io$/.test(url.hostname);
      if (url.protocol === "https:" && trusted && !url.username && !url.password && !url.port) return url.toString();
    } catch { /* Missing or malformed logos use the fallback. */ }
  }
  return null;
}

export type LogoEntityKind = "company" | "school";

type DomainCandidate = { name: string; domain: string };

const LEGAL_SUFFIX = /\b(?:inc|llc|ltd|limited|corp|corporation|co|company|plc|gmbh|pvt|private)\b\.?/g;

export function normalizeEntityName(name: string): string {
  return name.toLowerCase().replace(/&/g, "and").replace(LEGAL_SUFFIX, "").replace(/[^a-z0-9]/g, "");
}

const COUNTRY_TLDS: Record<string, string> = {
  india: "in", canada: "ca", uk: "uk", "united kingdom": "uk", england: "uk", germany: "de", france: "fr",
  ireland: "ie", netherlands: "nl", spain: "es", italy: "it", singapore: "sg", japan: "jp", china: "cn",
  australia: "au", uae: "ae", israel: "il", mexico: "mx", brazil: "br", poland: "pl", switzerland: "ch", sweden: "se",
};
const INDIAN_STATES = /\b(?:tamil nadu|telangana|andhra pradesh|karnataka|maharashtra|kerala|delhi|gujarat|west bengal|uttar pradesh|haryana|punjab|rajasthan)\b/i;
const GENERIC_TLDS = new Set(["com", "org", "net", "edu", "io", "co", "ai", "dev", "app", "tech", "gov", "us"]);

// The country a résumé location names, as a ccTLD; US locations and unknowns return "us"/null.
export function locationCountryTld(location: string): string | null {
  const text = location.trim().toLowerCase();
  if (!text || /^(?:remote|hybrid|on-?site)$/.test(text)) return null;
  if (INDIAN_STATES.test(text)) return "in";
  const country = Object.keys(COUNTRY_TLDS).find(c => new RegExp(`\\b${c}\\b`).test(text));
  if (country) return COUNTRY_TLDS[country];
  return /,\s*[a-z]{2}$|\b(?:united states|usa)\b/.test(text) ? "us" : null;
}

// A domain is inconsistent with the location when it carries a different country's TLD.
function domainMatchesLocation(domain: string, countryTld: string | null): boolean {
  if (!countryTld) return true;
  const tld = domain.toLowerCase().split(".").pop() ?? "";
  if (GENERIC_TLDS.has(tld)) return true;
  return tld === countryTld;
}

// Only accept a suggestion whose name matches the résumé text, so an unrelated brand's logo is never shown.
export function pickEntityDomain(query: string, candidates: DomainCandidate[], location = ""): string | null {
  const target = normalizeEntityName(query);
  if (target.length < 2) return null;
  const countryTld = locationCountryTld(location);
  const targetWords = query.toLowerCase().replace(LEGAL_SUFFIX, " ").split(/[^a-z0-9&]+/).filter(Boolean);
  const scored = candidates
    .filter(c => domainLogo(c.domain) && domainMatchesLocation(c.domain, countryTld))
    .map(c => ({ domain: c.domain, name: normalizeEntityName(c.name), words: c.name.toLowerCase().replace(LEGAL_SUFFIX, " ").split(/[^a-z0-9&]+/).filter(Boolean) }))
    .filter(c => c.name.length >= 2);
  const sameCountry = (d: string) => countryTld && countryTld !== "us" && d.toLowerCase().endsWith(`.${countryTld}`);
  const exact = scored.filter(c => c.name === target).sort((a, b) => Number(sameCountry(b.domain)) - Number(sameCountry(a.domain)));
  if (exact[0]) return exact[0].domain;
  // Whole-word prefix only: "Iowa State University" may match "Iowa State University Ames", never "Anora" → "Anorak".
  const prefix = scored.find(c => {
    const [shorter, longer] = c.words.length <= targetWords.length ? [c.words, targetWords] : [targetWords, c.words];
    return shorter.length >= 2 && shorter.every((w, idx) => longer[idx] === w);
  });
  return prefix?.domain ?? null;
}
