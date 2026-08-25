// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Classes for the leftmost column of a wide, horizontally-scrolling stat table, keeping the
 * player's callsign in view while the stat columns scroll under it.
 *
 * A pinned cell needs an opaque backdrop of its own, and `bg-card` is the one to match: these
 * tables all live inside a `Card`, whose `--card` is a different colour from `--background` in
 * both themes. It also has to repaint the row-hover tint, because `TableRow`'s translucent
 * `bg-muted/50` sits behind the pinned cell rather than over it — so the row needs `group` on
 * it. Opaque `bg-muted` is a shade off that blend, but only just, and it avoids an arbitrary
 * colour-mix value.
 *
 * `Table` already supplies the scroll container (`overflow-x-auto`), so no extra wrapper is
 * needed around the table for this to stick.
 */
export const STICKY_CALLSIGN_COL = "sticky left-0 z-10 bg-card group-hover:bg-muted";
