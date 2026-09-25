"use client";

import { UserButton, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BriefcaseBusiness, Inbox, LayoutDashboard, Kanban, PanelLeft, LockKeyhole, Settings, UserRound, type LucideIcon } from "lucide-react";
import { useProfile } from "@/components/profile-provider";
import { Button } from "@/components/ui/button";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";

type Item = { label: string; href: string; icon: LucideIcon };
const navigation: Item[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Job Board", href: "/job-board", icon: BriefcaseBusiness },
  { label: "Inbox", href: "/inbox", icon: Inbox },
  { label: "Tracker", href: "/tracker", icon: Kanban },
];
const account: Item[] = [
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Profile", href: "/profile", icon: UserRound },
];

function NavigationItems({ items }: { items: Item[] }) {
  const pathname = usePathname();
  const { completion, loading, error, jobBoardPreviewAccess } = useProfile();
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenu className="gap-1">
      {items.map(({ label, href, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        const locked = !(href === "/job-board" && jobBoardPreviewAccess) && href !== "/profile" && href !== "/settings" && (loading || !!error || !completion.complete);
        if (locked) return <SidebarMenuItem key={href}><SidebarMenuButton disabled aria-disabled="true" title="Complete your profile to unlock" className="app-nav-link h-8 gap-2 rounded-md px-2 text-[13px] font-medium opacity-40! cursor-not-allowed! bg-transparent! text-muted-foreground! hover:bg-transparent! hover:text-muted-foreground!"><Icon className="size-4!" aria-hidden="true" /><span>{label}</span><LockKeyhole className="ml-auto size-3!" aria-hidden="true" /></SidebarMenuButton></SidebarMenuItem>;
        return (
          <SidebarMenuItem key={href}>
            <SidebarMenuButton asChild isActive={active} className="app-nav-link h-8 gap-2 rounded-md px-2 text-[13px] font-medium">
              <Link href={href} prefetch={true} scroll={false} aria-current={active ? "page" : undefined} onClick={() => setOpenMobile(false)}>
                <Icon className="size-4!" aria-hidden="true" />
                <span>{label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

export function AppSidebar() {
  const { user } = useUser();
  const { completion } = useProfile();
  return (
    <Sidebar collapsible="offcanvas" className="border-r-0!">
      <SidebarContent className="pt-6">
        <SidebarGroup className="px-2 py-0">
          <nav aria-label="Main navigation"><NavigationItems items={navigation} /></nav>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="px-2 py-4">
        {!completion.complete && <Link href="/profile" className="mb-3 rounded-lg border border-primary/15 bg-primary/5 p-3"><span className="text-xs font-medium">Complete your profile</span><span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">Unlock your workspace.</span><span role="progressbar" aria-label="Profile completion" aria-valuenow={completion.completed} aria-valuemax={completion.total} aria-valuemin={0} className="mt-3 block h-1 overflow-hidden rounded-full bg-primary/10"><span className="block h-full rounded-full bg-primary" style={{ width: `${completion.completed / completion.total * 100}%` }} /></span></Link>}
        <nav aria-label="Account navigation"><NavigationItems items={account} /></nav>
        <div className="mt-3 flex min-w-0 items-center gap-2 border-t px-2 pt-3">
          <UserButton />
          <span className="truncate text-xs text-muted-foreground">{user?.firstName || user?.primaryEmailAddress?.emailAddress || "Your account"}</span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

export function MobileNavigation() {
  const { openMobile, toggleSidebar } = useSidebar();
  return (
    <div className="flex items-center md:hidden">
      <Button variant="ghost" size="icon" className="size-9" onClick={toggleSidebar} aria-label="Open navigation" aria-expanded={openMobile}>
        <PanelLeft className="size-5" aria-hidden="true" />
      </Button>
    </div>
  );
}
