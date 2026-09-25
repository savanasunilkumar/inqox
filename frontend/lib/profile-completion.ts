// Shared by the browser and the authenticated backend; never trust a client completion flag.
export const requiredProfileFields = [
  "firstName", "lastName", "email", "phone", "address", "city", "region", "postalCode", "country",
  "workCountry", "authorizedToWork", "sponsorshipNow", "sponsorshipFuture",
  "currentTitle", "currentCompany", "yearsExperience", "highestEducation", "school", "degree", "major", "graduationDate",
  "relocation", "workPreference", "noticePeriod", "availableDate", "salaryAmount", "salaryCurrency", "salaryPeriod", "travel",
] as const;
const choices: Record<string, readonly string[]> = {
  authorizedToWork: ["Yes", "No"], sponsorshipNow: ["Yes", "No"], sponsorshipFuture: ["Yes", "No"],
  relocation: ["Yes", "No"], workPreference: ["Remote", "Hybrid", "On-site", "Flexible"], salaryPeriod: ["Year", "Month", "Hour"],
};
export type CompletionProfile = { fields: Record<string, string>; resume: { key: string; size: number; text: string } | null };
export function profileCompletion(profile: CompletionProfile | null) {
  const missing: string[] = requiredProfileFields.filter((key) => {
    const value = profile?.fields[key]?.trim();
    if (!value) return true;
    if (choices[key] && !choices[key].includes(value)) return true;
    if (key === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return true;
    if (key === "yearsExperience" && (!Number.isFinite(Number(value)) || Number(value) < 0)) return true;
    if (key === "availableDate" && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)))) return true;
    return false;
  });
  if (!profile?.resume?.key || profile.resume.size <= 0 || !profile.resume.text.trim()) missing.unshift("resume");
  const total = requiredProfileFields.length + 1;
  return { complete: missing.length === 0, missing, completed: total - missing.length, total };
}
export function profileRouteAllowed(pathname: string, complete: boolean) {
  return complete || pathname === "/profile" || pathname === "/settings";
}
