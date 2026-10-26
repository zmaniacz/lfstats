// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { getImageUrl } from "./images";

export function getPlayerPictureUrl(entryId: string, pictureVersion: number): string {
  return getImageUrl(entryId, pictureVersion);
}
