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
  CalendarIcon,
  CardsIcon,
  CrosshairIcon,
  GameControllerIcon,
  HeartIcon,
  MapPinIcon,
  ShieldIcon,
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
    title: "Nightly Stats",
    url: "/nightly",
    icon: <CalendarIcon />,
  },
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
    title: "Centers",
    url: "/centers",
    icon: <MapPinIcon />,
  },
];

const competitionNavItems = [
  {
    title: "Standings",
    url: "/competitions/standings",
    icon: <TrophyIcon />,
  },
  {
    title: "Top Players",
    url: "/competitions/top-players",
    icon: <StarIcon />,
  },
  {
    title: "Leader(loser) Boards",
    url: "/competitions/leader-boards",
    icon: <TrophyIcon />,
  },
  {
    title: "Games",
    url: "/competitions/games",
    icon: <GameControllerIcon />,
  },
  {
    title: "All Star",
    url: "/competitions/all-star",
    icon: <StarIcon />,
  },
  {
    title: "Penalties",
    url: "/competitions/penalties",
    icon: <CardsIcon />,
  },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { data: session } = useSession();
  const roles = session?.user?.roles ?? [];
  const isLoggedIn = session?.user != null;
  const isAdmin = roles.some(
    (r) =>
      r.role === "superAdmin" || r.role === "admin" || r.role === "centerAdmin",
  );
  const canUpload = roles.some(
    (r) =>
      r.role === "superAdmin" ||
      r.role === "admin" ||
      r.role === "centerAdmin" ||
      r.role === "uploader",
  );

  const socialItems = [
    ...socialNavItems,
    ...(isLoggedIn
      ? [{ title: "Favorites", url: "/favorites", icon: <HeartIcon /> }]
      : []),
    ...(canUpload
      ? [{ title: "Upload", url: "/upload", icon: <UploadSimpleIcon /> }]
      : []),
    ...(isAdmin
      ? [{ title: "Admin", url: "/admin", icon: <ShieldIcon /> }]
      : []),
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
        <NavMain label="Social" items={socialItems} />
        <NavMain label="Competitions" items={competitionNavItems} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
