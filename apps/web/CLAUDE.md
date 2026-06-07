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

| Data type | Display example | Helper |
|---|---|---|
| Score / large integers | `7,420` | `formatScore(n)` |
| Percentages (stored as 0–1 decimal) | `73.2%` | `formatPct(n)` |
| Milliseconds duration | `8:42` | `formatMs(ms)` |
| Hit differential | `1.24` (2 decimal places) | `formatHitDiff(n)` |

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

Client components that call server actions must explicitly call `router.refresh()` after the action completes. `revalidatePath` alone does not reliably clear the Next.js client-side router cache in production — the RSC re-fetch returns 200 but React applies a stale cached payload, leaving the button in a permanent loading state.

**Do NOT tie the button's loading state to the same transition that calls `router.refresh()`.** Two separate bugs bracket this:
- Wrapping `await action(); router.refresh()` together in one `startTransition` can leave `isPending` stuck forever (the transition's pending state doesn't reliably resolve after `router.refresh()`).
- Calling `router.refresh()` completely outside any transition causes the opposite failure: the RSC refetch completes (200 in the network tab) but React never commits the new payload to the rendered tree — the UI stays stale until you navigate away and back or hard-refresh. `router.refresh()` needs React's transition machinery to actually apply the patch.

The fix is to **decouple them**: track button loading with plain `useState`, and wrap *only* the `router.refresh()` call in its own `startTransition`.

**Required pattern for any client component that calls a server action:**

```tsx
"use client"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

export function MyActionButton({ action }: { action: () => Promise<void> }) {
  const [isPending, setIsPending] = useState(false)
  const [, startRefreshTransition] = useTransition()
  const router = useRouter()

  async function handleClick() {
    setIsPending(true)
    try {
      await action()
    } finally {
      setIsPending(false)
    }
    startRefreshTransition(() => {
      router.refresh()
    })
  }

  return (
    <Button disabled={isPending} onClick={handleClick}>
      {isPending ? "Saving…" : "Save"}
    </Button>
  )
}
```

`router.refresh()` runs **after** the `try/finally` resolves the button's own pending state, inside its own dedicated transition. This gives Next.js the transition context it needs to commit the refreshed RSC payload, without making the button hostage to that transition's lifecycle.

Server actions should still call `revalidatePath` — it clears the server-side cache so the fresh fetch returns updated data. The two work together: `revalidatePath` on the server, `router.refresh()` on the client.

## What Not to Build

- **No ingestion UI** — ingestion is `apps/chomper`, triggered by S3 events, not the web app
- **No inline queries** — always add query logic to `packages/db/queries/` first, then import
- **No manual `components/ui/` files** — use `npx shadcn@latest add <component>`
- **No stat computation at render time** — all derived stats are pre-calculated at ingest;
  display them, don't recompute them
- **No UTC conversion** — all timestamps are stored as local center time; display as-is
