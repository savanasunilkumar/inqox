import { readLogo, transparentLogo } from "@/lib/logo-background";
import { boardUrl, domainLogo, extractBoardLogo } from "@/lib/company-logos";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const source = params.get("source") ?? "";
  const domainFallback = domainLogo(params.get("domain"));
  const board = boardUrl(source);
  let logo: string | null = null;

  // Known official domains offer small, square brand marks immediately.
  if (domainFallback) logo = domainFallback;
  else if (board) {
    try {
      const response = await fetch(board, {
        headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" },
        redirect: "manual",
        next: { revalidate: 86400 },
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) logo = extractBoardLogo(await response.text());
    } catch { /* Logo failures must not prevent jobs from loading. */ }
  }

  if (!logo) return new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=300" } });
  if (!domainFallback) {
    try {
      // extractBoardLogo only returns approved ATS image hosts.
      const image = await fetch(logo, {
        redirect: "error",
        next: { revalidate: 86400 },
        signal: AbortSignal.timeout(5000),
      });
      const png = await transparentLogo(await readLogo(image));
      return new Response(new Uint8Array(png), {
        headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" },
      });
    } catch { /* Preserve the original mark if normalization is unavailable. */ }
  }
  return new Response(null, {
    status: 302,
    headers: { Location: logo, "Cache-Control": "public, max-age=86400" },
  });
}
