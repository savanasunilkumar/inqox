export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname !== "inqox.com") return new Response("Not found", { status: 404 });
    if (url.protocol !== "https:") {
      url.protocol = "https:";
      return Response.redirect(url.toString(), 308);
    }
    const target = new URL(env.FRONTEND_ORIGIN);
    target.pathname = url.pathname;
    target.search = url.search;
    const headers = new Headers(request.headers);
    headers.set("Host", target.host);
    headers.set("X-Forwarded-Host", "inqox.com");
    headers.set("X-Forwarded-Proto", "https");
    headers.delete("Forwarded");
    // Stream both directions. Session/profile responses remain private and uncached.
    try {
      const upstream = await fetch(new Request(target, {
        method: request.method, headers, body: request.body, redirect: "manual",
      }), { cache: "no-store", signal: AbortSignal.timeout(60000) });
      const response = new Response(upstream.body, upstream);
      const location = response.headers.get("Location");
      if (location) {
        const redirect = new URL(location, target);
        if (redirect.origin === target.origin) {
          redirect.protocol = url.protocol;
          redirect.host = url.host;
          response.headers.set("Location", redirect.toString());
        }
      }
      response.headers.set("X-Content-Type-Options", "nosniff");
      return response;
    } catch {
      return new Response("inqox is temporarily unavailable. Please try again shortly.", {
        status: 502, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
  },
} satisfies ExportedHandler<Env>;
