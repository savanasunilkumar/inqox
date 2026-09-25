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
