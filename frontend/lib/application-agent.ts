import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function agentRequest(path: string, init: RequestInit = {}) {
  const { env } = getCloudflareContext();
  return env.APPLICATION_AGENT.fetch(new Request(`https://application-agent.internal${path}`, {
    ...init,
    signal: AbortSignal.timeout(45000),
  }));
}
