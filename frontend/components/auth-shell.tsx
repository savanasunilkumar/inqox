"use client";

import { ClerkProvider, ClerkFailed, ClerkLoaded, ClerkLoading, useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { AuthPage } from "@/components/auth-page";
import { ProfileProvider } from "@/components/profile-provider";
import { Button } from "@/components/ui/button";

function SignInFailure() {
  return <main className="flex h-svh flex-col items-center justify-center gap-4 px-6 text-center"><h1 className="text-2xl font-semibold">inqox</h1><p role="alert" className="max-w-sm text-sm text-muted-foreground">Sign-in couldn’t connect. Please try again in a moment.</p><Button onClick={() => window.location.reload()}>Try again</Button></main>;
}

function LoadingAccount() {
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setTimedOut(true), 20000); return () => clearTimeout(timer); }, []);
  if (timedOut) return <SignInFailure />;
  return <div role="status" className="flex h-svh items-center justify-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Opening inqox…</div>;
}

function AccountGate({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const authPage = pathname === "/sign-in" || pathname === "/sign-up";
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn && !authPage) router.replace("/sign-in");
    if (isSignedIn && authPage) router.replace("/profile");
  }, [isLoaded, isSignedIn, authPage, router]);
  if (!isLoaded || (isSignedIn && authPage)) return <LoadingAccount />;
  if (!isSignedIn) return <AuthPage signUp={pathname === "/sign-up"} />;
  return <ProfileProvider key={userId}>{children}</ProfileProvider>;
}

export function AuthShell({ children }: { children: React.ReactNode }) {
  const [publishableKey, setPublishableKey] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/config", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
      .then(async (response) => {
        const data = await response.json() as { publishableKey?: string; error?: string };
        if (!response.ok || !data.publishableKey) throw new Error(data.error || "Couldn’t load sign-in.");
        setPublishableKey(data.publishableKey);
      })
      .catch((failure) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Couldn’t load sign-in."); });
    return () => controller.abort();
  }, []);
  if (error) return <main className="flex h-svh flex-col items-center justify-center gap-4 px-6 text-center"><h1 className="text-2xl font-semibold">inqox</h1><p role="alert" className="text-sm text-muted-foreground">{error}</p><Button onClick={() => window.location.reload()}>Try again</Button></main>;
  if (!publishableKey) return <LoadingAccount />;
  return <ClerkProvider publishableKey={publishableKey} signInUrl="/sign-in" signUpUrl="/sign-up" signInForceRedirectUrl="/profile" signUpForceRedirectUrl="/profile" signInFallbackRedirectUrl="/profile" signUpFallbackRedirectUrl="/profile" afterSignOutUrl="/sign-in" appearance={{
    variables: { colorPrimary: "var(--primary)", colorPrimaryForeground: "var(--primary-foreground)", colorBackground: "var(--card)", colorForeground: "var(--foreground)", colorMutedForeground: "var(--muted-foreground)", colorInput: "var(--background)", colorInputForeground: "var(--foreground)", colorBorder: "var(--border)", borderRadius: "0.75rem", fontFamily: "var(--font-geist), sans-serif" },

  }}><ClerkLoading><LoadingAccount /></ClerkLoading><ClerkFailed><SignInFailure /></ClerkFailed><ClerkLoaded><AccountGate>{children}</AccountGate></ClerkLoaded></ClerkProvider>;
}
