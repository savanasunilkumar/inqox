import { agentRequest } from "@/lib/application-agent";
import { getJob } from "@/lib/jobs";
export const runtime = "nodejs";
const paths = new Set([
  "profile",
  "profile/resume",
  "runs/current",
  "runs/start",
  "runs/stop",
  "runs/screenshot",
]);
async function handle(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const path = (await params).path.join("/");
  if (!paths.has(path))
    return Response.json({ error: "Not found" }, { status: 404 });
  const token = request.headers.get("X-Clerk-Session-Token");
  if (!token || token.length > 16384)
    return Response.json({ error: "Sign in to continue." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  if (request.method !== "GET") {
    const origin = request.headers.get("origin");
    const allowed = new Set([
      new URL(request.url).origin,
      "http://127.0.0.1:3000",
      "http://localhost:3000",
      "https://inqox.com",
      `https://${request.headers.get("host")}`,
    ]);
    if (
      request.headers.get("sec-fetch-site") === "cross-site" ||
      (origin && !allowed.has(origin))
    )
      return Response.json(
        { error: "Request origin not allowed" },
        { status: 403 },
      );
    if (!origin)
      return Response.json(
        { error: "Missing request origin" },
        { status: 403 },
      );
  }
  try {
    let body: Uint8Array | undefined;
    if (request.body) {
      const limit = path === "profile/resume" ? 5 * 1024 * 1024 : 100000;
      const reader = request.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > limit) {
            await reader.cancel();
            return Response.json(
              { error: "File or profile is too large." },
              { status: 413 },
            );
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      body = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.length;
      }
    }
    if (path === "runs/start" && request.method === "POST") {
      const input = JSON.parse(new TextDecoder().decode(body));
      if (input.test === true)
        body = new TextEncoder().encode(JSON.stringify({ test: true }));
      else {
        const job =
          Number.isSafeInteger(input.jobId) && input.jobId > 0
            ? await getJob(input.jobId)
            : null;
        if (!job)
          return Response.json(
            { error: "This job is no longer available." },
            { status: 404 },
          );
        body = new TextEncoder().encode(
          JSON.stringify({
            job: {
              id: job.id,
              title: job.title,
              company: job.company,
              location: job.location,
              url: job.applyUrl || job.url,
            },
          }),
        );
      }
    }
    const headers: Record<string, string> = { "X-Clerk-Session-Token": token };
    for (const name of ["Content-Type", "X-File-Name"]) {
      const value = request.headers.get(name);
      if (value) headers[name] = value;
    }
    const response = await agentRequest("/" + path, {
      method: request.method,
      headers,
      body: body ? new Uint8Array(body).buffer : undefined,
    });
    const outputHeaders = new Headers({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    for (const name of ["Content-Type", "Content-Disposition"]) {
      const value = response.headers.get(name);
      if (value) outputHeaders.set(name, value);
    }
    return new Response(response.body, {
      status: response.status,
      headers: outputHeaders,
    });
  } catch {
    return Response.json(
      { error: "Couldn’t reach the application agent. Please try again." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
