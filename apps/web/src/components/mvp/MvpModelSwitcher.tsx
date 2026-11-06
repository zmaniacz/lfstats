// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalculatorIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { writeMvpModelCookie } from "@/components/filters/filter-url";
import { MVP_MODEL_PARAM, type MvpModelChoice } from "@/lib/mvp-model-params";

type Props = {
  models: MvpModelChoice[];
  /** The cookie-remembered version when the layout rendered, or null. */
  initialCookieVersion: string | null;
};

/**
 * Sidebar-footer switch between the non-retired MVP models. The page's own server components
 * resolve the same choice (`?mvp=` > cookie > default, see lib/mvp-model.ts), so switching
 * writes the cookie and navigates: to the URL with `?mvp=` set for a non-default model, or
 * stripped for the default.
 */
export function MvpModelSwitcher({ models, initialCookieVersion }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [cookieVersion, setCookieVersion] = useState(initialCookieVersion);

  if (models.length < 2) return null;

  const defaultModel = models.find((m) => m.isDefault) ?? models[0]!;
  const byVersion = (v: string | null) => (v ? models.find((m) => m.version === v) : undefined);
  const selected =
    byVersion(searchParams.get(MVP_MODEL_PARAM)) ?? byVersion(cookieVersion) ?? defaultModel;

  function select(version: string) {
    const model = byVersion(version) ?? defaultModel;
    const remembered = model.isDefault ? null : model.version;
    writeMvpModelCookie(remembered);
    setCookieVersion(remembered);

    const params = new URLSearchParams(searchParams.toString());
    if (model.isDefault) params.delete(MVP_MODEL_PARAM);
    else params.set(MVP_MODEL_PARAM, model.version);
    const query = params.toString();
    const next = query ? `${pathname}?${query}` : pathname;
    const current = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname;
    // Same URL (e.g. the choice came only from the cookie): re-render the server components
    // so they pick up the new cookie. Not a server-action follow-up, so no pending state.
    if (next === current) router.refresh();
    else router.push(next, { scroll: false });
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              tooltip="MVP model"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <CalculatorIcon />
              <span className="truncate">MVP {selected.version}</span>
              {selected.status === "development" && (
                <Badge variant="secondary" className="ml-auto">
                  dev
                </Badge>
              )}
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
            side="top"
            align="start"
            sideOffset={4}
          >
            <DropdownMenuLabel>MVP model</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup value={selected.version} onValueChange={select}>
              {models.map((m) => (
                <DropdownMenuRadioItem key={m.id} value={m.version}>
                  <span className="truncate">{m.version}</span>
                  {m.isDefault ? (
                    <Badge variant="outline" className="ml-auto">
                      default
                    </Badge>
                  ) : m.status === "development" ? (
                    <Badge variant="secondary" className="ml-auto">
                      development
                    </Badge>
                  ) : null}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
