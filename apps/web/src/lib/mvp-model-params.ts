// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Shared vocabulary for the MVP model selection (isomorphic: constants and helpers only, so
 * both server components and "use client" components can import it).
 *
 * Resolution order, as for the filter state: `?mvp=<version>` URL param > remembered cookie >
 * the default model. The param makes a link to a non-default view shareable; the cookie keeps
 * the choice while browsing. The default model never appears in either: choosing it clears
 * both, so a bare URL always means the official figures.
 */

export const MVP_MODEL_PARAM = "mvp";
export const MVP_MODEL_COOKIE = "mvpModel";

/** A model as the switcher and page notices show it. */
export type MvpModelChoice = {
  id: string;
  version: string;
  status: "released" | "development";
  isDefault: boolean;
  description: string | null;
};
