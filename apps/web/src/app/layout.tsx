// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { AppSidebar } from "@/components/app-sidebar";
import { AppSessionProvider } from "@/components/session-provider";
import { SiteHeader } from "@/components/site-header";
import { ThemeProvider } from "@/components/theme-provider";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
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
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
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
                <AppSidebar />
                <SidebarInset className="pt-(--header-height) min-w-0">{children}</SidebarInset>
              </SidebarProvider>
            </TooltipProvider>
          </AppSessionProvider>
        </ThemeProvider>
        <Toaster />
      </body>
    </html>
  );
}
