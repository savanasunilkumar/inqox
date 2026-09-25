"use client";
import { useClerk, useUser } from "@clerk/nextjs";
import { LogOut, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
export function AccountSettings() {
  const { user } = useUser();
  const { signOut, openUserProfile } = useClerk();
  return <section className="w-full space-y-6 p-4 sm:p-6">
    <div><h2 className="text-xl font-semibold tracking-tight">Account & preferences</h2><p className="mt-1 text-sm text-muted-foreground">Manage your account, appearance, and session.</p></div>
    <div className="divide-y rounded-xl border">
      <div className="flex flex-wrap items-center justify-between gap-4 p-5"><div><h3 className="text-sm font-medium">Your account</h3><p className="mt-1 text-sm text-muted-foreground">{user?.primaryEmailAddress?.emailAddress}</p></div><Button variant="outline" onClick={() => openUserProfile()}><UserRound />Manage account</Button></div>
      <div className="flex flex-wrap items-center justify-between gap-4 p-5"><div><h3 className="text-sm font-medium">Appearance</h3><p className="mt-1 text-sm text-muted-foreground">Choose what feels right for you.</p></div><ThemeToggle /></div>
      <div className="flex flex-wrap items-center justify-between gap-4 p-5"><div><h3 className="text-sm font-medium">Sign out</h3><p className="mt-1 text-sm text-muted-foreground">Your saved profile will be here when you return.</p></div><Button variant="outline" onClick={() => void signOut({ redirectUrl: "/sign-in" })}><LogOut />Sign out</Button></div>
    </div>
  </section>;
}
