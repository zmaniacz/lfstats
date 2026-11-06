// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { AppSidebar } from "@/components/app-sidebar";
import { LiveUpdates } from "@/components/LiveUpdates";
import { AppSessionProvider } from "@/components/session-provider";
import { SiteHeader } from "@/components/site-header";
import { ThemeProvider } from "@/components/theme-provider";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getActiveMvpModels, getMvpModelCookie } from "@/lib/mvp-model";
import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { template: "%s | LFstats", default: "LFstats" },
  description: "Space Marines 5 laser tag statistics",
  icons: { apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "LFstats" },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The sidebar's MVP model switcher lists the non-retired models; the cookie seeds its
  // selection so it matches what the page resolved on the server.
  const [mvpModels, mvpModelCookie] = await Promise.all([
    getActiveMvpModels(),
    getMvpModelCookie(),
  ]);

  return (
    <html lang="en" className={cn("font-mono", jetbrainsMono.variable)} suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AppSessionProvider>
            <TooltipProvider>
              <SidebarProvider>
                <SiteHeader />
                <AppSidebar mvpModels={mvpModels} mvpModelCookie={mvpModelCookie} />
                <SidebarInset className="pt-(--header-height) min-w-0">{children}</SidebarInset>
              </SidebarProvider>
            </TooltipProvider>
          </AppSessionProvider>
        </ThemeProvider>
        <Toaster />
        <LiveUpdates />
      </body>
    </html>
  );
}
