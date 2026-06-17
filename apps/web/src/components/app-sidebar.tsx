// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  CardsIcon,
  CrosshairIcon,
  GameControllerIcon,
  HeartIcon,
  InfoIcon,
  MapPinIcon,
  PresentationChartIcon,
  RadioactiveIcon,
  ShieldIcon,
  SoccerBallIcon,
  StarIcon,
  TrophyIcon,
  UploadSimpleIcon,
  UsersIcon,
} from "@phosphor-icons/react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import * as React from "react";

const socialNavItems = [
  {
    title: "Nightly SM5",
    url: "/nightly",
    icon: <RadioactiveIcon />,
  },
  {
    title: "Nightly Laserball",
    url: "/nightly-lb",
    icon: <SoccerBallIcon />,
  },
];

const competitionNavItems = [
  {
    title: "Standings",
    url: "/standings",
    icon: <TrophyIcon />,
  },
  {
    title: "All Star",
    url: "/all-star",
    icon: <StarIcon />,
  },
];

// "Browse" pages work across social / competition / all scopes and remember the
// last context via cookies, so their links are bare (no query string).
const browseNavItems = [
  {
    title: "Games",
    url: "/games",
    icon: <GameControllerIcon />,
  },
  {
    title: "Players",
    url: "/players",
    icon: <UsersIcon />,
  },
  {
    title: "Leaderboards",
    url: "/leaderboards",
    icon: <PresentationChartIcon />,
  },
  {
    title: "Centers",
    url: "/centers",
    icon: <MapPinIcon />,
  },
  {
    title: "Penalties",
    url: "/penalties",
    icon: <CardsIcon />,
  },
  {
    title: "About SM5",
    url: "/about-sm5",
    icon: <InfoIcon />,
  },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { data: session } = useSession();

  const roles = session?.user?.roles ?? [];
  const isLoggedIn = session?.user != null;
  const isAdmin = roles.some(
    (r) => r.role === "superAdmin" || r.role === "admin" || r.role === "centerAdmin",
  );
  const canUpload = roles.some(
    (r) =>
      r.role === "superAdmin" ||
      r.role === "admin" ||
      r.role === "centerAdmin" ||
      r.role === "uploader",
  );

  const otherItems = [
    ...(isLoggedIn ? [{ title: "Favorites", url: "/favorites", icon: <HeartIcon /> }] : []),
    ...(canUpload ? [{ title: "Upload", url: "/upload", icon: <UploadSimpleIcon /> }] : []),
    ...(isAdmin ? [{ title: "Admin", url: "/admin", icon: <ShieldIcon /> }] : []),
  ];

  return (
    <Sidebar
      style={{
        top: "var(--header-height)",
        height: "calc(100svh - var(--header-height))",
      }}
      {...props}
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <CrosshairIcon className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">LFstats</span>
                  <span className="truncate text-xs">SM5 Statistics</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {otherItems.length > 0 && <NavMain label="User" items={otherItems} />}
        <NavMain label="Social" items={socialNavItems} />
        <NavMain label="Competition" items={competitionNavItems} />
        <NavMain label="Browse" items={browseNavItems} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
