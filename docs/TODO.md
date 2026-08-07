# TODO

Tracking list for known bugs and planned features.

## Roll out `refresh()` pattern to remaining `window.location.reload()` sites

Two sites have been migrated from the full-page-reload workaround (documented in
`apps/web/CLAUDE.md` under "Server Actions and UI Updates", Pattern B) to Next 16's
`refresh()` (`next/cache`) called from inside the server action instead of
`router.refresh()` on the client — both trialed live in production without issue:

- `GameTagManager.tsx` / `src/app/games/[slug]/actions.ts` (`assignTagAction`,
  `removeTagAction`)
- Team roster admin page: `PlayerRosterSearch.tsx`, `ParticipantActions.tsx`,
  `TeamLogoUpload.tsx`, `PlayerPictureUpload.tsx` / `src/app/admin/competitions/[slug]/
teams/[teamSlug]/actions.ts`

**29 files still use `window.location.reload()`** (grep `window\.location\.reload` under
`apps/web/src`) and are candidates for the same migration. Notably `DeleteEntityButton.tsx`
(`components/admin/competition/`) is shared across 7+ admin pages and was deliberately left
on the reload pattern — it now accepts either calling convention (see the redaction-fix TODO
below), so each caller can be migrated to `refresh()` independently without touching the
shared component again.

**Per-site migration pattern:**

1. In the server action: after `revalidatePath(...)`, add `refresh()` (import from
   `next/cache`).
2. In the client component: remove `window.location.reload()` from the `finally`/success
   path; replace with `setIsPending(false)` (or equivalent) since the component now stays
   mounted and must reset its own pending state.
3. Watch for implicit state resets a full reload used to provide for free — e.g.
   `PlayerRosterSearch.tsx` had to explicitly filter the added player out of its local
   `results` list, since nothing else would clear it once the page stopped reloading.
4. Test manually in the browser (repeated clicks, slow network) watching for the
   `isPending`-stuck scheduler bug the reload pattern was originally added to avoid
   (vercel/next.js#88767, #77504, #86055, #82289) — no automated repro exists for this.
5. Update `apps/web/CLAUDE.md`'s Pattern B guidance once a broader rollout is validated.

## Audit for other Server Action errors that get silently redacted in production

Discovered in this session: Next.js redacts thrown `Error` messages from `"use server"`
actions to a bare digest in production builds — the client shows a useless "Minified React
error #441" instead of the real message. Fully invisible in `pnpm dev` (only reproduces
after deploying), which is how the team roster page's roster-conflict checks sat broken for
a while unnoticed. Full writeup and the fix pattern (`{ok:false, error}` return value instead
of throw) saved to memory as `feedback_server_action_errors`.

**Scope the audit:** grep `throw new Error` across `apps/web/src` (69 occurrences across 21
files as of this writing — `actions.ts` files under `app/**`, plus a few components). For
each, judge whether the thrown message is meant to reach the user (validation/business-rule
failures — convert to the return-value pattern) versus a genuinely exceptional/unauthorized
case where a generic fallback is fine (e.g. `requireAdmin()`'s "Forbidden"/"Unauthorized" —
leave as-is). The existing precedent to follow is `updateGameVideoAction`/`VideoManager.tsx`
and the now-fixed `setPlayerMercenary`/`addPlayerToCompetitionTeam`/
`removePlayerFromCompetitionTeam` in `packages/db/src/queries/competition-tournament.ts`.
