import { extractText, getDocumentProxy } from "unpdf";
import { z } from "zod";
import { emptyProfile, profileFields, type Profile } from "./profile-model";
import { extractFromResumeText } from "../../frontend/lib/resume-extractor";
const profileKey = (owner: string) => `${owner}/profile.json`;
const inputSchema = z.object({
  fields: z.record(z.string(), z.string().trim().max(2000)),
  customAnswers: z
    .array(
      z.object({
        question: z.string().trim().min(1).max(500),
        answer: z.string().trim().min(1).max(5000),
      }),
    )
    .max(30)
    .default([]),
  educationHistory: z
    .array(
      z.object({
        school: z.string().max(300),
        degree: z.string().max(300),
        major: z.string().max(300),
        graduationDate: z.string().max(100),
        gpa: z.string().max(20).optional(),
        rawText: z.string().max(5000).optional(),
      }),
    )
    .max(20)
    .optional(),
  experienceHistory: z
    .array(
      z.object({
        company: z.string().max(300),
        title: z.string().max(300),
        dateRange: z.string().max(100),
        location: z.string().max(300).optional(),
        highlights: z.array(z.string().max(2000)).max(40),
        isCurrent: z.boolean().optional(),
      }),
    )
    .max(30)
    .optional(),
});
export function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export async function readBounded(request: Request, limit: number) {
  if (Number(request.headers.get("Content-Length")) > limit)
    throw new Error("Upload exceeds the size limit.");
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new Error("Upload exceeds the size limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
export async function loadProfile(
  env: Env,
  owner = "private-owner",
): Promise<Profile> {
  const object = await env.PROFILES.get(profileKey(owner));
  return object ? await object.json<Profile>() : structuredClone(emptyProfile);
}
async function saveProfile(env: Env, profile: Profile, owner: string) {
  profile.updatedAt = new Date().toISOString();
  await env.PROFILES.put(profileKey(owner), JSON.stringify(profile), {
    httpMetadata: { contentType: "application/json", cacheControl: "no-store" },
  });
  return json(profile);
}
export async function profileRequest(
  request: Request,
  env: Env,
  owner = "private-owner",
): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === "/profile") {
    if (request.method === "GET") return json(await loadProfile(env, owner));
    if (request.method !== "PUT")
      return json({ error: "Method not allowed" }, 405);
    const input = inputSchema.safeParse(
      JSON.parse(new TextDecoder().decode(await readBounded(request, 100000))),
    );
    if (!input.success)
      return json(
        { error: "Please check the profile fields and saved answers." },
        400,
      );
    const allowed = new Set(profileFields.map((field) => field.key));
    if (Object.keys(input.data.fields).some((name) => !allowed.has(name)))
      return json({ error: "Unknown profile field." }, 400);
    for (const field of profileFields) {
      const value = input.data.fields[field.key];
      if (value && field.options && !field.options.includes(value))
        return json({ error: `Invalid answer for ${field.label}.` }, 400);
    }
    if (
      input.data.fields.email &&
      !z.email().safeParse(input.data.fields.email).success
    )
      return json({ error: "Enter a valid email address." }, 400);
    if (
      [
        "authorizedToWork",
        "sponsorshipNow",
        "sponsorshipFuture",
        "visaStatus",
      ].some((name) => input.data.fields[name]) &&
      !input.data.fields.workCountry
    )
      return json(
        { error: "Specify the country for your work authorization answers." },
        400,
      );
    const profile = await loadProfile(env, owner);
    return saveProfile(env, { ...profile, ...input.data }, owner);
  }
  if (path !== "/profile/resume") return json({ error: "Not found" }, 404);
  const profile = await loadProfile(env, owner);
  if (request.method === "GET") {
    const object =
      profile.resume && (await env.PROFILES.get(profile.resume.key));
    return object
      ? new Response(object.body, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": "attachment; filename=resume.pdf",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          },
        })
      : json({ error: "No résumé uploaded." }, 404);
  }
  if (request.method === "DELETE") {
    const old = profile.resume;
    const response = await saveProfile(
      env,
      { ...profile, resume: null },
      owner,
    );
    if (old) await env.PROFILES.delete(old.key);
    return response;
  }
  if (request.method !== "PUT")
    return json({ error: "Method not allowed" }, 405);
  const bytes = await readBounded(request, 5 * 1024 * 1024);
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
    return json({ error: "Please upload a PDF résumé (up to 5 MB)." }, 400);
  let text: string;
  try {
    const pdf = await getDocumentProxy(bytes.slice());
    try {
      if (pdf.numPages > 20)
        return json(
          { error: "Please use a résumé with 20 pages or fewer." },
          400,
        );
      text = (await extractText(pdf, { mergePages: true })).text.slice(
        0,
        50000,
      );
    } finally {
      await pdf.loadingTask.destroy();
    }
  } catch {
    return json(
      {
        error:
          "Could not read this PDF. Please use a text-based, unencrypted PDF.",
      },
      400,
    );
  }
  if (text.trim().length < 30)
    return json(
      {
        error:
          "This PDF appears to be scanned. Please upload a PDF with selectable text.",
      },
      400,
    );
  const name = decodeURIComponent(
    request.headers.get("X-File-Name") || "resume.pdf",
  )
    .replace(/[\/\\\r\n]/g, "_")
    .slice(0, 180);
  const resumeKey = `${owner}/resumes/${crypto.randomUUID()}.pdf`;
  await env.PROFILES.put(resumeKey, bytes, {
    httpMetadata: { contentType: "application/pdf", cacheControl: "no-store" },
  });

  const extracted = extractFromResumeText(text);
  const replacing = !!profile.resume;
  const updatedFields = { ...profile.fields };
  for (const [k, v] of Object.entries({ ...extracted.summary, ...extracted.contact })) {
    if (v && (replacing || !updatedFields[k])) updatedFields[k] = v;
  }

  const response = await saveProfile(
    env,
    {
      ...profile,
      fields: updatedFields,
      educationHistory: extracted.education.length > 0 ? extracted.education : profile.educationHistory ?? [],
      experienceHistory: extracted.experience.length > 0 ? extracted.experience : profile.experienceHistory ?? [],
      resume: {
        name,
        size: bytes.length,
        key: resumeKey,
        text,
        uploadedAt: new Date().toISOString(),
      },
    },
    owner,
  );
  if (profile.resume) await env.PROFILES.delete(profile.resume.key);
  return response;
}
