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

## ~~Audit for other Server Action errors that get silently redacted in production~~ (done)

Next.js redacts thrown `Error` messages from `"use server"` actions to a bare digest in
production builds — the client shows a useless "Minified React error #441" instead of the
real message. Fully invisible in `pnpm dev` (only reproduces after deploying), which is how
the team roster page's roster-conflict checks sat broken for a while unnoticed. Full writeup
and the fix pattern (`{ok:false, error}` return value instead of throw) saved to memory as
`feedback_server_action_errors`.

**Audit completed.** All 69 `throw new Error` sites across `apps/web/src` were reviewed;
9 user-facing ones were converted to the return-value pattern, leaving 55 deliberate throws.

A second problem turned up during the audit and mattered more than the redaction itself:
**every** client caller of these actions used `try { await action() } finally { … }` with no
`catch`. So a thrown validation message wasn't merely redacted — it became an unhandled
promise rejection and the user saw _nothing at all_, just a control that appeared to do
nothing. Each conversion below therefore also added the missing error display.

Converted (action → caller that now renders the message):

- `addGameVideoAction`, `addLbGameVideoAction` → `VideoManager.tsx` (add and edit now share
  one result-handling path; edit was already converted, add was not)
- `getPresignedUrlsAction` → `UploadZone.tsx` (the `.tdf`-only and "competition is not
  active" refusals now name the rejected files)
- `bulkAssignGamesAction` → `BulkAssignForm.tsx` (new error line)
- `assignGameAction`, `createForfeitAction` → `MatchGameAssignForm.tsx`, `ForfeitButtons.tsx`
  (both had no error UI at all; the assign form now keeps the admin's selections on failure)
- `createApiKeyAction` → `ApiKeysClient.tsx` (dialog stays open on failure)
- `getTeamLogoUploadUrlAction`, `getPlayerPictureUploadUrlAction` → `TeamLogoUpload.tsx`,
  `PlayerPictureUpload.tsx` (the file picker's `accept` filter is bypassable, so
  "Unsupported image type" is genuinely reachable)

Deliberately left as throws: `requireAdmin`/`requireCenterAdmin`/`requireSuperAdmin`
"Forbidden"/"Unauthorized"; "not found" cases that only fire against stale UI; missing-env
config errors (`INCOMING_BUCKET`, `IMAGES_BUCKET`); and throws in client components
(`UploadZone`, the two upload widgets, `components/ui/*`), which never cross the server
action boundary and so are never redacted.

### Follow-ups found during the audit (both now done)

1. **`updateTeamAction` converted.** It was the last user-facing throw ("Team name is
   required"), left over because it was wired as a bare `<form action={boundUpdate}>`, which
   cannot read a return value. The form markup moved into a new client component
   `[teamSlug]/EditTeamForm.tsx`, which renders `result.error` and a "Saved." confirmation.
   Deliberately plain `useState` rather than `useActionState`, since the latter is
   transition-based and this app has repeatedly hit the stuck-`isPending` scheduler bug
   documented under "Server Actions and UI Updates" in `apps/web/CLAUDE.md`. Because
   submitting no longer navigates, the action gained a `refresh()` (Pattern B) so the page
   heading and teams list pick the rename up. Also hardened the two `formData.get(...)`
   reads, which would have thrown a `TypeError` on a missing field.
2. **Three dead actions deleted** from `admin/competitions/[slug]/teams/actions.ts`:
   `addPlayerToTeamAction`, `removePlayerFromTeamAction` and — found while confirming those
   two — `searchPlayersAction`. All were leftovers from the roster UI moving to the
   `[teamSlug]/` route, which has its own copies; `teams/page.tsx` only ever imported
   `createCompetitionTeamAction` and `deleteCompetitionTeamAction`. The two roster mutations
   also discarded the `RosterMutationResult` they got back, so a roster conflict there would
   have failed silently. Worth noting the reason this mattered: the pre-deletion build
   emitted both into `.next/server/server-reference-manifest.json`, confirming that an
   exported `"use server"` function ships as a callable POST endpoint even with no caller.
