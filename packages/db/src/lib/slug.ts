// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Latin letters that NFD does not decompose, so stripping combining marks
 * leaves them intact. Lowercase keys only — `slugify` lowercases first.
 */
const TRANSLITERATIONS: Record<string, string> = {
  ß: "ss",
  æ: "ae",
  œ: "oe",
  ø: "o",
  đ: "d",
  ð: "d",
  þ: "th",
  ł: "l",
  ħ: "h",
  ŋ: "n",
  ſ: "s",
};

/**
 * Folds a name down to a URL-safe ASCII slug: `[a-z0-9_-]` only.
 *
 * Slugs land in URL path segments, so anything outside that set has to go.
 * A non-ASCII slug survives `Link href` (the browser percent-encodes it) but
 * the round trip back to the `eq(slug)` lookup is fragile — most often on
 * Unicode normalization, where the stored form and the form the browser sends
 * differ (`ř` as U+0159 vs. `r` + U+030C) and the lookup silently 404s.
 *
 * Names that fold away entirely — non-Latin scripts, pure emoji — yield
 * `fallback`; callers pair this with `resolveUniqueSlug` to disambiguate, and
 * a human can set a better short name in the admin UI.
 */
export function slugify(input: string, fallback = "item"): string {
  const folded = input
    .toLowerCase()
    // Split accents off their base letters, then drop them: "ř" -> "r".
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[ßæœøđðþłħŋſ]/g, (ch) => TRANSLITERATIONS[ch]!)
    // Elision marks join the word rather than break it: "o'brien" -> "obrien".
    .replace(/['’]/g, "")
    // Everything else outside the safe set becomes a separator, so punctuation
    // and emoji leave a word boundary behind instead of fusing their neighbours.
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "");

  return folded || fallback;
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
