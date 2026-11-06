// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { cache } from "react";
import { cookies } from "next/headers";
import { listActiveMvpModels } from "@lfstats/db";
import { MVP_MODEL_COOKIE, type MvpModelChoice } from "./mvp-model-params";

/** Non-retired MVP models, default first. One query per request. */
export const getActiveMvpModels = cache(async (): Promise<MvpModelChoice[]> =>
  listActiveMvpModels(),
);

/** The cookie-remembered model version, if any (the layout seeds the switcher with it). */
export async function getMvpModelCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(MVP_MODEL_COOKIE)?.value ?? null;
}

/**
 * The MVP model a page shows: `?mvp=` param > cookie > default. Unknown or retired versions
 * fall through to the next source. Every server page that displays MVP resolves it here and
 * passes the result to its queries; null only when the model table is empty, which the
 * queries treat as the default (stored mvp_points).
 */
export async function resolveMvpModel(
  param: string | string[] | undefined,
): Promise<MvpModelChoice | null> {
  const models = await getActiveMvpModels();
  const fallback = models.find((m) => m.isDefault) ?? models[0] ?? null;
  const fromParam = Array.isArray(param) ? param[0] : param;
  const byVersion = (v: string | null | undefined) =>
    v ? (models.find((m) => m.version === v) ?? null) : null;
  return byVersion(fromParam) ?? byVersion(await getMvpModelCookie()) ?? fallback;
}
