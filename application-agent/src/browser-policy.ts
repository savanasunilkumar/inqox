export const allowedHosts = new Set([
  "jobs.lever.co",
  "jobs.eu.lever.co",
  "boards.greenhouse.io",
  "job-boards.greenhouse.io",
  "boards.eu.greenhouse.io",
  "job-boards.eu.greenhouse.io",
  "jobs.ashbyhq.com",
]);
// Ashby's app bundle is served from a different domain than its job pages.
export const browserAllowedDomains = [
  ...allowedHosts,
  "*.greenhouse.io", "*.lever.co", "*.ashbyhq.com",
  "cdn.ashbyprd.com", "www.recaptcha.net",
  "*.amazonaws.com", "*.cloudfront.net", "*.googleapis.com",
  "*.gstatic.com", "www.google.com", "challenges.cloudflare.com",
];
export function validApplicationUrl(raw: string) {
  try {
    const url = new URL(raw);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      allowedHosts.has(url.hostname) &&
      url.pathname.split("/").filter(Boolean).length >= 2
    );
  } catch {
    return false;
  }
}
// Only known reads may use POST. Other writes, including final application submission,
// are blocked for this first release. File selection works; an ATS upload may need review.
export function allowBrowserRequest(
  method: string,
  raw: string,
  body: string | null,
) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (!["https:", "http:"].includes(url.protocol)) return false;
  if (
    /\/((submit|submit-application|applications?|apply\/submit))(\/|$)/i.test(
      url.pathname,
    ) &&
    method !== "GET"
  )
    return false;
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return true;
  if (
    method === "POST" &&
    url.hostname === "jobs.ashbyhq.com" &&
    url.pathname === "/api/non-user-graphql"
  ) {
    try {
      const data = JSON.parse(body || "{}");
      const op = data.operationName || url.searchParams.get("op");
      return (
        [
          "ApiJobPosting",
          "ApiJobPostingWithApplicationForm",
          "ApiOrganizationPublic",
          "ApiOrganizationFromHostedJobsPageName",
          "ApiJobBoardWithTeams",
        ].includes(op) &&
        !(typeof data.query === "string" && /\bmutation\b/i.test(data.query))
      );
    } catch {
      return false;
    }
  }
  return false;
}
