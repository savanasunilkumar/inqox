import { z } from "zod";
const answerSchema = z.object({
  model: z.string(),
  answers: z.record(
    z.string(),
    z.object({ choice: z.string(), confidence: z.number().min(0).max(1) }),
  ),
  usage: z
    .object({ input_tokens: z.number(), output_tokens: z.number() })
    .optional(),
});
export async function callJev(
  env: Env,
  payload: { state: unknown; questions: unknown },
) {
  if (!env.TYPESAFE_API_KEY?.trim())
    throw new Error("The TYPESAFE_API_KEY secret is missing.");
  let response: Response;
  try {
    response = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.TYPESAFE_API_KEY.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: env.JEV_MODEL, ...payload }),
      signal: AbortSignal.timeout(20000),
      redirect: "manual",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/header|ByteString|character/i.test(message))
      throw new Error(
        "The TypeSafe API key contains characters that cannot be used in an HTTP authorization header.",
      );
    if (/redirect/i.test(message))
      throw new Error("The runtime rejected the TypeSafe redirect handling.");
    if (/abort|timeout|timed out/i.test(message))
      throw new Error("The TypeSafe request timed out.");
    throw new Error("The TypeSafe network request failed.");
  }
  if (!response.ok) {
    await response.body?.cancel();
    // Never persist raw provider errors, which could echo request credentials.
    const reason =
      response.status === 401 || response.status === 403
        ? "Check the TypeSafe API key."
        : response.status === 402
          ? "Check the TypeSafe account credits."
          : response.status === 429
            ? "TypeSafe rate limit reached. Try again later."
            : "The TypeSafe service rejected the request.";
    throw new Error(`TypeSafe returned HTTP ${response.status}. ${reason}`);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("TypeSafe returned an empty response.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) {
        await reader.cancel();
        throw new Error("Response too large");
      }
      chunks.push(value);
    }
  } catch {
    throw new Error(
      "The TypeSafe response was incomplete or exceeded the size limit.",
    );
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return answerSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    throw new Error("TypeSafe returned an invalid field-decision response.");
  }
}
