"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { hasJobBoardPreviewAccess, isJobBoardRoute } from "@/lib/job-board-access";
import { LoaderCircle } from "lucide-react";
import { useAgentFetch } from "@/lib/use-agent-fetch";
import type { Profile } from "@/lib/profile-model";
import { profileCompletion, profileRouteAllowed } from "@/lib/profile-completion";
import { Button } from "@/components/ui/button";

type ProfileContextValue = {
  profile: Profile | null; loading: boolean; error: string;
  completion: ReturnType<typeof profileCompletion>;
  jobBoardPreviewAccess: boolean;
  acceptSaved: (profile: Profile) => void; reload: () => void;
};
const ProfileContext = createContext<ProfileContextValue | null>(null);
export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const agentFetch = useAgentFetch();
  const { user } = useUser();
  const jobBoardPreviewAccess = hasJobBoardPreviewAccess(user);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    agentFetch("/api/agent/profile", { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) })
      .then(async response => {
        if (!response.ok) throw new Error("We couldn’t load your profile. Please try again.");
        const data = await response.json() as Profile;
        if (!controller.signal.aborted) { setProfile(data); setError(""); }
      })
      .catch(() => { if (!controller.signal.aborted) setError("We couldn’t load your profile. Please try again."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [agentFetch, attempt]);
  const reload = useCallback(() => { setLoading(true); setError(""); setAttempt(n => n + 1); }, []);
  const acceptSaved = useCallback((saved: Profile) => { setProfile(saved); setError(""); }, []);
  return <ProfileContext.Provider value={{ profile, loading, error, completion: profileCompletion(profile), jobBoardPreviewAccess, acceptSaved, reload }}>{children}</ProfileContext.Provider>;
}
export function useProfile() {
  const value = useContext(ProfileContext);
  if (!value) throw new Error("ProfileProvider is required");
  return value;
}
export function ProfileLoading() {
  return <div role="status" className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading your profile…</div>;
}
export function ProfileLoadError() {
  const { error, reload } = useProfile();
  return <div className="space-y-4 p-6"><p role="alert" className="text-sm text-muted-foreground">{error}</p><Button variant="outline" onClick={reload}>Try again</Button></div>;
}
export function ProfileAccessGate({ children }: { children: React.ReactNode }) {
  const { completion, loading, error, jobBoardPreviewAccess } = useProfile();
  const pathname = usePathname();
  const router = useRouter();
  const ownerJobBoard = jobBoardPreviewAccess && isJobBoardRoute(pathname);
  const allowed = ownerJobBoard || profileRouteAllowed(pathname, completion.complete);
  useEffect(() => {
    if (!loading && !allowed) router.replace("/profile");
  }, [loading, allowed, router]);
  if (pathname === "/settings" || pathname === "/profile" || ownerJobBoard) return children;
  if (loading) return <ProfileLoading />;
  if (error) return <ProfileLoadError />;
  if (!allowed) return <ProfileLoading />;
  return children;
}
