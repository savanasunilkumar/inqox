"use client";

import { UserButton, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BriefcaseBusiness, Inbox, LayoutDashboard, Kanban, PanelLeft, LockKeyhole, Settings, UserRound, type LucideIcon } from "lucide-react";
import { useProfile } from "@/components/profile-provider";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
        {!completion.complete && <Link href="/profile" className="mb-3 block rounded-md px-2 py-1.5 hover:bg-sidebar-accent"><span className="flex items-center justify-between text-xs"><span className="font-medium">Profile setup</span><span className="text-muted-foreground tabular-nums">{completion.completed}/{completion.total}</span></span><Progress value={completion.completed / completion.total * 100} aria-label="Profile completion" className="mt-2" /></Link>}
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
