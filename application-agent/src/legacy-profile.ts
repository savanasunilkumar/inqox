import type { ClerkClient } from "@clerk/backend";
import type { Profile } from "./profile-model";

// Import the existing private profile only after Clerk verifies the same email.
// Conditional writes make retries safe and never overwrite a user's own edits.
export async function importLegacyProfile(bucket: R2Bucket, owner: string, userId: string, client: ClerkClient) {
  const target = `${owner}/profile.json`;
  if (await bucket.head(target)) return;
  const object = await bucket.get("private-owner/profile.json");
  if (!object) return;
  const profile = await object.json<Profile>();
  const email = profile.fields.email?.trim().toLowerCase();
  if (!email) return;
  const claimKey = "private-owner/clerk-owner.json";
  const existing = await bucket.get(claimKey);
  if (existing && (await existing.json<{ owner: string }>()).owner !== owner) return;
  const user = await client.users.getUser(userId);
  if (!user.emailAddresses.some((item) => item.verification?.status === "verified" && item.emailAddress.trim().toLowerCase() === email)) return;
  if (!existing) {
    const claimed = await bucket.put(claimKey, JSON.stringify({ owner }), { onlyIf: { etagDoesNotMatch: "*" } });
    if (!claimed) {
      const winner = await bucket.get(claimKey);
      if (!winner || (await winner.json<{ owner: string }>()).owner !== owner) return;
    }
  }
  if (profile.resume) {
    if (!profile.resume.key.startsWith("private-owner/resumes/")) return;
    const resume = await bucket.get(profile.resume.key);
    if (!resume) return;
    const key = `${owner}/resumes/imported-legacy.pdf`;
    await bucket.put(key, resume.body, {
      onlyIf: { etagDoesNotMatch: "*" },
      httpMetadata: { contentType: "application/pdf", cacheControl: "no-store" },
    });
    profile.resume.key = key;
  }
  await bucket.put(target, JSON.stringify(profile), {
    onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: "application/json", cacheControl: "no-store" },
  });
}
