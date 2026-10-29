// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/** One pickable entity. `keywords` are searched but not shown; `hint` is shown but not searched. */
export type EntityOption = {
  value: string;
  label: string;
  keywords?: string;
  hint?: string;
};

/** A labelled section of the picker. A null label renders the items without a heading. */
export type EntityGroup = {
  key: string;
  label: string | null;
  items: EntityOption[];
};

type CenterLike = { slug: string; name: string; gameCount?: number };

type CompetitionLike = {
  slug: string;
  name: string;
  state?: "preshow" | "upcoming" | "active" | "completed";
  startDate?: string;
  gameType?: "sm5" | "lb";
};

/** Prepends an "All …" option as its own unlabelled group, when the page allows it. */
function withAll(groups: EntityGroup[], all: EntityOption | null): EntityGroup[] {
  return all ? [{ key: "all", label: null, items: [all] }, ...groups] : groups;
}

/**
 * Centers, in the order given (the busiest first), with the game count as a hint. The slug
 * (e.g. "4-2", the TDF filename prefix) is searchable too.
 */
export function centerGroups<T extends CenterLike>(
  centers: T[],
  options: { getValue?: (c: T) => string; all?: EntityOption | null } = {},
): EntityGroup[] {
  const getValue = options.getValue ?? ((c: T) => c.slug);
  const items = centers.map((c) => ({
    value: getValue(c),
    label: c.name,
    keywords: c.slug,
    hint: c.gameCount === undefined ? undefined : c.gameCount.toLocaleString(),
  }));
  return withAll([{ key: "centers", label: "Centers", items }], options.all ?? null);
}

/**
 * Competitions grouped as Active, Upcoming, then completed ones by start year (newest first),
 * so the current season is at the top instead of buried among a decade of past events.
 */
export function competitionGroups<T extends CompetitionLike>(
  competitions: T[],
  options: {
    getValue?: (c: T) => string;
    all?: EntityOption | null;
    /** Label Laserball competitions; only needed when the list mixes both game types. */
    labelLaserball?: boolean;
  } = {},
): EntityGroup[] {
  const getValue = options.getValue ?? ((c: T) => c.slug);
  const byKey = new Map<string, EntityGroup>();
  const groupFor = (key: string, label: string) => {
    let group = byKey.get(key);
    if (!group) {
      group = { key, label, items: [] };
      byKey.set(key, group);
    }
    return group;
  };

  for (const c of competitions) {
    const year = c.startDate?.slice(0, 4) ?? "";
    const isLb = c.gameType === "lb";
    const option: EntityOption = {
      value: getValue(c),
      label: c.name,
      keywords: [c.slug, year, isLb ? "laserball" : ""].join(" "),
      hint: options.labelLaserball && isLb ? "Laserball" : undefined,
    };
    if (c.state === "active") groupFor("active", "Active").items.push(option);
    else if (c.state === "upcoming") groupFor("upcoming", "Upcoming").items.push(option);
    else groupFor(`y${year}`, year || "Other").items.push(option);
  }

  const order = (key: string) => (key === "active" ? 0 : key === "upcoming" ? 1 : 2);
  const groups = [...byKey.values()].sort(
    (a, b) => order(a.key) - order(b.key) || b.key.localeCompare(a.key),
  );
  return withAll(groups, options.all ?? null);
}
