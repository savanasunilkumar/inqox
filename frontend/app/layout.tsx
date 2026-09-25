import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { LocalProfilePreview } from "@/components/local-profile-preview";
import { AuthShell } from "@/components/auth-shell";
import { AppSidebar } from "@/components/app-sidebar";
import { JobFeedProvider } from "@/components/job-feed-provider";
import { PageFrame } from "@/components/page-frame";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });

export const metadata: Metadata = {
  applicationName: "inqox",
  title: { default: "inqox — Find your next role", template: "%s | inqox" },
  description: "Explore open roles pulled directly from company career pages.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={geist.variable} suppressHydrationWarning>
      <body className="h-svh overflow-hidden font-sans antialiased">
        <ThemeProvider>
          {process.env.NODE_ENV === "development" && process.env.INQOX_PROFILE_PREVIEW === "1" ? <LocalProfilePreview /> : <AuthShell>
          <TooltipProvider delayDuration={200}>
            <a href="#main-content" className="sr-only z-50 rounded-lg bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3">Skip to content</a>
            <SidebarProvider open className="h-svh min-h-0 overflow-hidden bg-sidebar" style={{ "--sidebar-width": "11.5rem" } as React.CSSProperties}>
              <AppSidebar />
              <SidebarInset id="main-content" className="h-svh min-h-0 min-w-0 overflow-hidden md:my-2 md:mr-2 md:h-[calc(100svh-1rem)] md:rounded-xl md:border" tabIndex={-1}>
                <JobFeedProvider><PageFrame>{children}</PageFrame></JobFeedProvider>
              </SidebarInset>
            </SidebarProvider>
          </TooltipProvider>
          </AuthShell>}
        </ThemeProvider>
      </body>
    </html>
  );
}
