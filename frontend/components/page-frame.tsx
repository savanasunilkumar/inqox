"use client";

import { useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { ProfileAccessGate } from "@/components/profile-provider";
import { MobileNavigation } from "@/components/app-sidebar";

const titles: Record<string, string> = {
  "/dashboard": "Dashboard", "/job-board": "Job Board", "/tracker": "Tracker",
  "/application": "Live application", "/inbox": "Inbox", "/settings": "Settings", "/profile": "Profile",
};

export function PageFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const title = titles[pathname] ?? "Job Board";

  const scroll = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const element = scroll.current;
    if (!element) return;
    element.scrollTop = positions.current.get(pathname) ?? 0;
    const remember = () => positions.current.set(pathname, element.scrollTop);
    element.addEventListener("scroll", remember, { passive: true });
    return () => element.removeEventListener("scroll", remember);
  }, [pathname]);

  return (
    <>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3 sm:px-5">
        <MobileNavigation />
        <h1 className="text-[13px] font-medium">{title}</h1>
      </header>
      <div ref={scroll} id="page-scroll" tabIndex={0} aria-label={`${title} content`} className="min-h-0 w-full flex-1 overflow-y-auto overscroll-contain outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        <ProfileAccessGate>{children}</ProfileAccessGate>
      </div>
    </>
  );
}
