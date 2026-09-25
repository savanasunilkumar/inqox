import type { Profile } from "@/lib/profile-model";

export type CandidateProfile = {
  text: string;
  titles: string[];
  yearsExperience: number | null;
  workCountry: string | null;
  needsSponsorship: boolean;
  remoteOnly: boolean;
};

const MAX_TEXT = 200_000;

function clean(value: string | undefined): string {
  return (value ?? "").trim();
}

export function parseYears(value: string | undefined): number | null {
  const match = clean(value).match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const years = Number(match[0]);
  return Number.isFinite(years) ? Math.min(years, 60) : null;
}

/** Reduces a saved profile to the signals the jobs API matches on. */
export function candidateFromProfile(profile: Profile): CandidateProfile {
  const { fields } = profile;
  const experience = profile.experienceHistory ?? [];
  const titles = [clean(fields.currentTitle), ...experience.map((role) => clean(role.title))]
    .filter((title, index, all) => title && all.indexOf(title) === index)
    .slice(0, 50)
    .map((title) => title.slice(0, 200));
  const text = [
    profile.resume?.text ?? "",
    ...experience.flatMap((role) => [role.title, ...role.highlights]),
    fields.major ?? "",
    fields.degree ?? "",
  ].join("\n").slice(0, MAX_TEXT);
  return {
    text,
    titles,
    yearsExperience: parseYears(fields.yearsExperience),
    workCountry: clean(fields.workCountry).slice(0, 100) || null,
    needsSponsorship: fields.sponsorshipNow === "Yes" || fields.sponsorshipFuture === "Yes",
    remoteOnly: fields.workPreference === "Remote",
  };
}
