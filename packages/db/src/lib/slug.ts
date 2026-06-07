// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

export function slugify(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, "_");
}

/**
 * Finds an unused slug by trying `base`, then `base_1`, `base_2`, ... until
 * `exists` returns false for a candidate.
 */
export async function resolveUniqueSlug(
  base: string,
  exists: (candidate: string) => Promise<boolean>,
): Promise<string> {
  let candidate = base;
  let suffix = 1;
  while (await exists(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}
