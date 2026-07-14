// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useEffect } from "react";
import type { FilterGameType, Scope } from "@/lib/filter-cookies";
import { writeFilterCookies, writeGameTypeCookie } from "./filter-url";

/**
 * Forces the shared scope + gameType filter cookies to specific values on
 * mount. Used by landing pages (e.g. Nightly) that always want to open in a
 * fixed filter context, regardless of what the user had selected elsewhere.
 * Deliberately does not touch center/competition cookies — those stay sticky.
 */
export function ResetFilterCookies({
  scope,
  gameType,
}: {
  scope: Scope;
  gameType: FilterGameType;
}) {
  useEffect(() => {
    writeFilterCookies({ scope }, gameType);
    writeGameTypeCookie(gameType);
  }, [scope, gameType]);

  return null;
}
