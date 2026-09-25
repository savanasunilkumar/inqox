import { loadProfile } from "./profile";
import { profileCompletion } from "../../frontend/lib/profile-completion";
import { WorkerEntrypoint } from "cloudflare:workers";
import { authenticateUser } from "./user-auth";
import { importLegacyProfile } from "./legacy-profile";
import { fixtureHtml } from "./fixture";
import { callJev } from "./jev";
import { LiveApplicationAgent } from "./live-agent";
export { LiveApplicationAgent };
import { Agent, getAgentByName } from "agents";
import { launch } from "@cloudflare/playwright";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";

const googleKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);
const answerSchema = z.object({
  model: z.string(),
  answers: z.record(
    z.string(),
    z.object({
      choice: z.enum(["fullName", "email", "linkedIn", "unknown"]),
      confidence: z.number().min(0).max(1),
    }),
  ),
  usage: z
    .object({
      input_tokens: z.number().nonnegative(),
      output_tokens: z.number().nonnegative(),
    })
    .optional(),
});

type Check = { ok: boolean; detail: string };
type Report = {
  id: string;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "passed" | "blocked";
  checks: Record<string, Check>;
  elapsedMs?: number;
  jev?: {
    provider: "typesafe";
    model: string;
    answers: z.infer<typeof answerSchema>["answers"];
    usage?: z.infer<typeof answerSchema>["usage"];
  };
};
type State = { report: Report | null };

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function authorized(request: Request, env: Env) {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return false;
  try {
    const { payload } = await jwtVerify(header.slice(7), googleKeys, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: env.SERVICE_AUDIENCE,
      algorithms: ["RS256"],
    });
    return (
      payload.email_verified === true &&
      typeof payload.email === "string" &&
      env.ALLOWED_SERVICE_ACCOUNTS.split(",").includes(payload.email)
    );
  } catch {
    return false;
  }
}

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : "Service unavailable").slice(
    0,
    400,
  );
}

export class ApplicationAgent extends Agent<Env, State> {
  initialState: State = { report: null };
  private running = false;

  async onRequest(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (request.method === "GET" && path === "/test/result")
      return json(this.state.report);
    if (request.method === "GET" && path === "/test/screenshot") {
      const image = await this.ctx.storage.get<Uint8Array>("testScreenshot");
      return image
        ? new Response(new Uint8Array(image).buffer, {
            headers: {
              "Content-Type": "image/png",
              "Cache-Control": "no-store",
            },
          })
        : json({ error: "No screenshot yet" }, 404);
    }
    if (request.method !== "POST" || path !== "/test/run")
      return json({ error: "Not found" }, 404);
    const last = this.state.report;
    if (
      this.running ||
      (last && Date.now() - Date.parse(last.startedAt) < 30000)
    )
      return json(
        {
          error:
            "A test is running or just finished. Wait 30 seconds before repeating it.",
        },
        429,
      );
    this.running = true;
    try {
      return json(await this.testConnection());
    } finally {
      this.running = false;
    }
  }

  private async testConnection(): Promise<Report> {
    const started = Date.now();
    const report: Report = {
      id: crypto.randomUUID(),
      startedAt: new Date(started).toISOString(),
      status: "running",
      checks: {},
    };
    this.setState({ report });
    await this.ctx.storage.delete("testScreenshot");
    let browser: Awaited<ReturnType<typeof launch>> | undefined;
    try {
      browser = await launch(this.env.BROWSER, { keep_alive: 30000 });
      report.checks.browser = {
        ok: true,
        detail: "Cloudflare launched a remote browser.",
      };
      const page = await browser.newPage({
        viewport: { width: 1000, height: 720 },
      });
      page.setDefaultTimeout(10000);
      await page.goto("https://example.com", {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });
      report.checks.network = {
        ok: (await page.title()) === "Example Domain",
        detail: "Remote browser opened an external page.",
      };
      await page.setContent(
        `<!doctype html><html><head><title>Application agent connection test</title><style>body{font:16px system-ui;max-width:620px;margin:40px auto;color:#172d23}label{display:block;margin:20px 0 6px}input,select{box-sizing:border-box;width:100%;padding:10px;border:1px solid #bbb;border-radius:6px}button{margin-top:24px;padding:12px 24px}small{color:#637568}</style></head><body><h1>Application agent connection test</h1><p>Controlled test form. No employer receives this information.</p><form id="application" onsubmit="event.preventDefault();document.body.dataset.submitted='true'"><label for="candidate">Candidate name</label><input id="candidate" required><label for="contact">Email address</label><input id="contact" type="email" required><label for="portfolio">Professional profile URL</label><input id="portfolio" type="url"><label for="resume">Résumé attachment</label><input id="resume" type="file"><button type="submit">Submit application</button></form><p id="review"></p><small>The test stops before submission.</small></body></html>`,
      );
      const fields = await page
        .locator("input:not([type=file])")
        .evaluateAll((inputs) =>
          inputs.map((input) => {
            const element = input as HTMLInputElement;
            return {
              id: element.id,
              label: element.labels?.[0]?.textContent ?? "",
              type: element.type,
            };
          }),
        );
      const profile = {
        fullName: "Connection Test",
        email: "connection-test@example.com",
        linkedIn: "https://www.linkedin.com/in/connection-test",
      };
      let mapping: Record<
        string,
        { choice: string; confidence: number }
      > | null = null;
      try {
        const questions = Object.fromEntries(
          fields.map((field) => [
            field.id,
            {
              type: "choice",
              instructions: `Which profile key belongs in field ${field.id}? Use its label and input type. Select unknown when no profile key matches.`,
              criteria: {
                fullName: "Applicant's complete name",
                email: "Applicant's email address",
                linkedIn: "Applicant's professional profile or LinkedIn URL",
                unknown: "No matching value",
              },
            },
          ]),
        );
        const result = await callJev(this.env, {
          state: { fields, profileKeys: Object.keys(profile) },
          questions,
        });
        mapping = result.answers;
        report.jev = {
          provider: "typesafe",
          model: result.model,
          answers: answerSchema.parse(result).answers,
          usage: result.usage,
        };
        report.checks.jev = {
          ok: true,
          detail:
            "Jev returned field decisions through the direct TypeSafe API.",
        };
      } catch (error) {
        report.checks.jev = { ok: false, detail: errorMessage(error) };
      }
      // Test the browser independently if Jev is unavailable; never report this as AI autofill.
      const expected = {
        candidate: "fullName",
        contact: "email",
        portfolio: "linkedIn",
      } as const;
      const decisions =
        mapping ??
        Object.fromEntries(
          Object.entries(expected).map(([field, key]) => [
            field,
            { choice: key, confidence: 1 },
          ]),
        );
      let decisionsCorrect = mapping !== null;
      for (const field of fields) {
        const decision = decisions[field.id];
        const expectedKey = expected[field.id as keyof typeof expected];
        if (
          !decision ||
          decision.confidence < 0.85 ||
          decision.choice !== expectedKey
        ) {
          decisionsCorrect = false;
          continue;
        }
        await page.locator(`#${field.id}`).fill(profile[expectedKey]);
      }
      await page
        .locator("#resume")
        .setInputFiles({
          name: "connection-test.txt",
          mimeType: "text/plain",
          buffer: Buffer.from(
            "Controlled application-agent upload test. This is not a résumé.",
          ),
        });
      const verified = await page.evaluate(() => ({
        name: (document.querySelector("#candidate") as HTMLInputElement).value,
        email: (document.querySelector("#contact") as HTMLInputElement).value,
        url: (document.querySelector("#portfolio") as HTMLInputElement).value,
        file: (document.querySelector("#resume") as HTMLInputElement).files?.[0]
          ?.name,
        submitted: document.body.dataset.submitted === "true",
      }));
      const filled =
        verified.name === profile.fullName &&
        verified.email === profile.email &&
        verified.url === profile.linkedIn;
      report.checks.form = {
        ok: filled,
        detail: mapping
          ? "Filled and read back the fields selected by Jev."
          : "Browser-only field entry verified. Jev autofill is not yet working.",
      };
      report.checks.upload = {
        ok: verified.file === "connection-test.txt",
        detail: "Remote file upload verified with a test attachment.",
      };
      report.checks.noSubmission = {
        ok: !verified.submitted,
        detail: "Stopped before submission. No employer was contacted.",
      };
      report.checks.aiAutofill = {
        ok: decisionsCorrect && filled,
        detail:
          decisionsCorrect && filled
            ? "Jev decisions and actual browser field values match."
            : "End-to-end AI autofill is not yet verified.",
      };
      try {
        const cdp = await page.context().newCDPSession(page);
        const view = await cdp.send("Cloudflare.getLiveView", {
          mode: "tab",
          expiresInMs: 60000,
        });
        report.checks.liveView = {
          ok: new URL(view.devtoolsFrontendUrl).protocol === "https:",
          detail:
            "Interactive Live View link generated; test session closes after verification.",
        };
      } catch (error) {
        report.checks.liveView = { ok: false, detail: errorMessage(error) };
      }
      await page.locator("#review").evaluate((element) => {
        element.textContent = "Ready for review — not submitted.";
      });
      await this.ctx.storage.put("testScreenshot", await page.screenshot());
    } catch (error) {
      report.checks.execution = { ok: false, detail: errorMessage(error) };
    } finally {
      if (browser) {
        try {
          await browser.close();
          report.checks.cleanup = {
            ok: true,
            detail: "Browser closed to stop usage charges.",
          };
        } catch (error) {
          report.checks.cleanup = { ok: false, detail: errorMessage(error) };
        }
      }
    }
    report.status = Object.values(report.checks).every((check) => check.ok)
      ? "passed"
      : "blocked";
    report.finishedAt = new Date().toISOString();
    report.elapsedMs = Date.now() - started;
    this.setState({ report });
    return report;
  }
}

const frontendPaths = new Set(["/onboarding", "/profile", "/profile/resume", "/runs/current", "/runs/start", "/runs/stop", "/runs/screenshot"]);

async function frontendRequest(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (request.headers.get("Upgrade")) return json({ error: "Unsupported" }, 400);
  if (path === "/auth/config" && request.method === "GET")
    return json({ publishableKey: env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.trim() });
  if (!frontendPaths.has(path)) return json({ error: "Not found" }, 404);
  const user = await authenticateUser(request, env);
  if (!user) return json({ error: "Sign in to continue." }, 401);
  if (path === "/profile" && request.method === "GET") {
    try {
      await importLegacyProfile(env.PROFILES, user.owner, user.userId, user.client);
    } catch {
      return json({ error: "Couldn’t load your profile. Please try again." }, 503);
    }
  }
  if (path === "/onboarding" && request.method === "GET") return json(profileCompletion(await loadProfile(env, user.owner)));
  if (path.startsWith("/runs/") && path !== "/runs/stop") {
    if (!profileCompletion(await loadProfile(env, user.owner)).complete)
      return json({ error: "Complete and save your profile first.", code: "profile_required" }, 403);
  }
  const live = await getAgentByName(env.LiveApplicationAgent, user.owner);
  return live.fetch(request);
}

// This entrypoint is reachable only through a Cloudflare service binding.
// User identity is still verified for every private request.
export class Frontend extends WorkerEntrypoint<Env> {
  async fetch(request: Request): Promise<Response> {
    return frontendRequest(request, this.env);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname === "/health" && request.method === "GET")
      return json({
        service: "applyit-application-agent",
        mode: "connection-test",
        version: 2,
      });
    if (
      new URL(request.url).pathname === "/fixture" &&
      request.method === "GET"
    )
      return new Response(fixtureHtml, {
        headers: {
          "Content-Type": "text/html;charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    if (new URL(request.url).pathname === "/fixture/submit")
      return json({ error: "Submission is disabled." }, 405);
    if (!(await authorized(request, env)))
      return json({ error: "Unauthorized" }, 401);
    if (request.headers.get("Upgrade"))
      return json({ error: "Unsupported" }, 400);
    const path = new URL(request.url).pathname;
    if (path === "/auth/config" && request.method === "GET")
      return json({ publishableKey: env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.trim() });
    if (path.startsWith("/validation/")) {
      const url = new URL(request.url);
      url.pathname = path.slice("/validation".length);
      const validation = await getAgentByName(
        env.LiveApplicationAgent,
        "validation-owner",
      );
      return validation.fetch(new Request(url, request));
    }
    if (frontendPaths.has(path)) return frontendRequest(request, env);
    const agent = await getAgentByName(env.ApplicationAgent, "connection-test");
    return agent.fetch(request);
  },
} satisfies ExportedHandler<Env>;
