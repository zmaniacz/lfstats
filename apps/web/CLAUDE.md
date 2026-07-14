# apps/web — LFstats Next.js Frontend

## Architecture

**App Router only.** No Pages Router patterns.

Default to server components. Add `"use client"` only when you need:

- useState / useReducer / useEffect
- Browser APIs (window, localStorage)
- Event handlers that can't be passed as props

Data fetching happens in server components or route handlers.
Never fetch from the database client-side.

**File layout:**

```
app/
  (routes)/
    games/[id]/
      page.tsx          ← server component, fetches data
      loading.tsx       ← skeleton that mirrors the layout
    players/[iplId]/
      page.tsx
    ...
components/
  games/                ← game-scoped components
  players/              ← player-scoped components
  scorecards/           ← scorecard table, cards, stat rows
  ui/                   ← shadcn primitives (don't edit these)
lib/
  format.ts             ← all formatting helpers (see below)
  positions.ts          ← position integer → metadata
  team-colors.ts        ← colour_enum → display values
packages/db/
  queries/              ← all DB query functions live here, not inline
```

## Data Display Rules

### Null vs zero — this is critical

`null` means the stat does not apply to this position. `0` means it applies but the player recorded zero.

- Null stats render as **`—`** (em dash), never `0` or blank
- Zero stats render as **`0`**
- Never use `value ?? 0` or `value || '—'` — check explicitly: `value === null ? '—' : value`

### Number formatting

Always use helpers from `lib/format.ts`. If a helper doesn't exist for a case, add it there —
never format inline.

| Data type                           | Display example           | Helper             |
| ----------------------------------- | ------------------------- | ------------------ |
| Score / large integers              | `7,420`                   | `formatScore(n)`   |
| Percentages (stored as 0–1 decimal) | `73.2%`                   | `formatPct(n)`     |
| Milliseconds duration               | `8:42`                    | `formatMs(ms)`     |
| Hit differential                    | `1.24` (2 decimal places) | `formatHitDiff(n)` |

### Position display

Never hardcode position names inline. Use `lib/positions.ts`:

```typescript
// lib/positions.ts exports:
POSITIONS[1] // { label: 'Commander', abbr: 'CMD', category: 1 }
getPosition(category: number) // → Position
```

### Team colors

`colour_rgb` is null for pre-2.004 games. Always derive display values from `colour_enum`
via `lib/team-colors.ts`. Never read `colour_rgb` directly in components.

### Eliminated players

Eliminated players have `eliminated: true` and `lives_left: 0`.
Show a visual indicator (Badge variant="destructive" or a muted row style) — don't just
show 0 lives without context. An eliminated team always loses, even if their score is higher.

### Stat applicability

Before rendering any position-specific stat column (nukes, rapid fire, resupplies, SP, etc.),
gate on the player's `position` value, not just whether the column is null. Positions are
fixed per game and determine which stats are meaningful.

## shadcn/ui Usage

Load the shadcn skill before any UI work:

```
npx skills add https://github.com/shadcn/ui --skill shadcn
```

The skill handles component docs, correct imports, variants, and CLI. App-specific conventions
on top of that:

- **Tables**: Use shadcn `Table` for static display. Only reach for TanStack sorting if the
  table has more than ~20 rows or there's an explicit sort requirement.
- **Loading states**: Every page needs a co-located `loading.tsx`. Use shadcn `Skeleton`
  components shaped to match the loaded content — not a spinner.
- **Stat groupings**: Use `Card` → `CardHeader` + `CardContent` for grouping related stats.
- **Position badges**: Derive Badge color/variant from `position` category via `lib/positions.ts`,
  not hardcoded per-position classNames scattered across components.
- **Empty states**: When a player has no games or a stat group has no data, render a meaningful
  empty state inside the Card — not a blank area or null.
- **New components**: Never manually create files in `components/ui/`. Always use the CLI:
  `npx shadcn@latest add <component>`

## Database Query Conventions

All query functions live in `packages/db/queries/`. Import from there — no inline Drizzle
calls inside `app/` or `components/`.

Query file naming mirrors the domain: `games.ts`, `players.ts`, `scorecards.ts`.

Queries return typed objects using Drizzle's inferred types (`typeof table.$inferSelect`).
Never cast query results with `as`.

## Key Domain Facts

A **Game** has 2 competing teams + 1 Neutral team (`is_neutral = true`). Always filter
`is_neutral = false` for competing team queries. `GameTeam.score` excludes
`elimination_bonus` — add them separately if displaying total competition points.

A **Scorecard** is one player's performance in one game. `player_id` is null for guest
players (no iplId). Always handle this — guests appear in game views but have no profile page.
Never link to a player profile without checking `player_id` is non-null.

**Game outcome enum**: `'score'` | `'elimination'` | `'draw'`. An eliminated team always
loses even if their score is higher. Never determine the winner from score alone — check
`GameTeam.result` or `GameTeam.eliminated`.

**iplId** format is `#xxxxxxx`. Strip the `#` for iPlayLaserforce profile URLs:

```
https://www.iplaylaserforce.com/mission-stats/?t={iplId_without_hash}
```

**MVP points** (`Scorecard.mvp_points`) are pre-calculated at ingest and safe to sort and
display directly. `Scorecard.mvp_model_id` identifies which formula version produced the
number — surface this when displaying historical comparisons across model versions.

**SP (Special Points)** are null for Heavy Weapons only — all other positions track SP.
The cap is 99; `sp_earned` reflects actual accrual respecting that cap, not a theoretical
uncapped total.

## Server Actions and UI Updates

**Do not use `useTransition` or `router.refresh()` for server-action follow-up UI updates.** Both have proven unreliable in production: `startTransition` around `await action()` and/or `router.refresh()` can leave `isPending` stuck forever (the transition never settles), permanently disabling the control. This is the same family of scheduler/transition bugs as vercel/next.js#88767, #77504, #86055, and #82289.

Use one of two patterns instead, depending on whether the mutation's effect is visible only in the component that triggered it, or also shown elsewhere on the page.

**Pattern A — self-contained mutation (e.g. a favorite toggle):**

Track the displayed value and the pending flag with plain `useState`. No transition, no refresh.

```tsx
"use client";
import { useState } from "react";

export function MyToggleButton({
  value,
  action,
}: {
  value: boolean;
  action: (next: boolean) => Promise<void>;
}) {
  const [current, setCurrent] = useState(value);
  const [isPending, setIsPending] = useState(false);

  async function handleClick() {
    const next = !current;
    setCurrent(next);
    setIsPending(true);
    try {
      await action(next);
    } catch {
      setCurrent(!next);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Button disabled={isPending} onClick={handleClick}>
      ...
    </Button>
  );
}
```

**Pattern B — mutation affects other UI on the page (e.g. tags, exclusion status, competition assignment):**

Track only the pending flag with `useState`, then call `window.location.reload()` once the action resolves. A full reload is heavier (loses scroll position / tab selection) but is unconditionally correct and avoids the RSC-cache/scheduler issue entirely. These are infrequent, deliberate actions, not high-frequency interactions.

```tsx
"use client";
import { useState } from "react";

export function MyActionButton({ action }: { action: () => Promise<void> }) {
  const [isPending, setIsPending] = useState(false);

  async function handleClick() {
    setIsPending(true);
    try {
      await action();
    } finally {
      window.location.reload();
    }
  }

  return (
    <Button disabled={isPending} onClick={handleClick}>
      {isPending ? "Saving…" : "Save"}
    </Button>
  );
}
```

Server actions should still call `revalidatePath` — it clears the server-side cache so the reloaded page returns fresh data.

## Cross-Page Filter State (scope / gameType / center / competition)

Four filter dimensions are shared across the "browse" pages (games, players, leaderboards,
centers, penalties, standings, all-star, player profile):

- `gameType`: `"sm5" | "lb"` — SM5 vs Laserball. Displayed fully separately.
- `scope`: `"social" | "competition" | "all"`.
- `center`: a center slug, or `null` for "all centers" (applies in social scope).
- `competition`: a competition slug, or `null` for "all competitions" (applies in competition
  scope; Laserball has no competitions yet).

### Storage: cookies, split by game type

Cookie names live in `lib/filter-cookies.ts` (`filterCookieNames(gameType)`, `GAME_TYPE_COOKIE`).
SM5 and Laserball keep **independent** scope/center/competition cookies (`lastScope`/
`lastCenterSlug`/`lastCompetitionSlug` for SM5, `lbLastScope`/`lbLastCenterSlug`/
`lbLastCompetitionSlug` for Laserball) so switching game type never leaks an SM5-only center
selection into Laserball or vice versa. `lastGameType` is a single shared cookie (no
per-game-type split, since it selects _between_ the two namespaces).

### Resolution order (everywhere): URL param > cookie > default

- **Server-side, in every page component:** call `resolveGameType(searchParams.game)` and
  `resolveFilterContext(searchParams, { gameType, defaultScope?, allowedScopes? })` from
  `lib/filter-context.ts`. These are the only sanctioned entry points for reading filter
  cookies server-side. Never call `cookies()` from `next/headers` and hand-parse a
  scope/center/competition/gameType cookie inline in a page, and never redeclare a cookie
  name as a local string literal — always source names from `filterCookieNames()` /
  `CENTER_COOKIE` etc. in `lib/filter-cookies.ts`.
- **Client-side, anywhere a user changes a filter:** write cookies exclusively via
  `writeFilterCookies(state, gameType)` and `writeGameTypeCookie(gameType)` from
  `components/filters/filter-url.ts`. Never write `document.cookie` inline in a component —
  if you need a new filter-cookie write site, add a helper to `filter-url.ts` instead of
  duplicating the `document.cookie = ...` string-building logic.

### Shared components

- `components/filters/FilterBar.tsx` — renders the scope toggle / center select / competition
  select for a page, calls `writeFilterCookies` + `router.push` on change. `mode`:
  `"generic"` (all 3 scopes) | `"social-only"` | `"competition-only"`.
- `components/filters/GameTypeToggle.tsx` — SM5/Laserball switcher, calls `writeGameTypeCookie`
  on click.
- `components/filters/filter-url.ts` — `buildFilterUrl()`, `writeFilterCookies()`,
  `writeGameTypeCookie()`. The single source of truth for both URL-building and cookie-writing.
- `components/filters/ResetFilterCookies.tsx` — mount this (client component, writes cookies in
  a `useEffect` on mount) on any page that must force a specific scope+gameType every time it's
  landed on, regardless of what's currently stored (e.g. `/nightly` always resets to
  `scope="social"`, `gameType="sm5"`; `/nightly-lb` to `scope="social"`, `gameType="lb"`). It
  intentionally does not touch center/competition cookies — those stay sticky even on a
  forced-reset landing page. Use this pattern for any future page with the same "always open in
  a fixed context" requirement rather than inventing a new session-storage or query-param based
  mechanism.

### Adding a new filter-consuming page

1. Resolve filters server-side with `resolveGameType` + `resolveFilterContext`.
2. Render `<GameTypeToggle>` (if the page supports both game types) and `<FilterBar>` with the
   resolved values.
3. If the page needs to force a specific scope/gameType on landing rather than inherit the
   sticky cookie values, mount `<ResetFilterCookies>` with the desired fixed values.
4. Never write `document.cookie` or read `cookies()` directly — always go through
   `lib/filter-context.ts` (server) and `components/filters/filter-url.ts` (client).

## What Not to Build

- **No ingestion UI** — ingestion is `apps/chomper`, triggered by S3 events, not the web app
- **No inline queries** — always add query logic to `packages/db/queries/` first, then import
- **No manual `components/ui/` files** — use `npx shadcn@latest add <component>`
- **No stat computation at render time** — all derived stats are pre-calculated at ingest;
  display them, don't recompute them
- **No UTC conversion** — all timestamps are stored as local center time; display as-is
