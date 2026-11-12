# Admin Tools

How-to guides for the command-line tools used to fix data by hand. Each section says when to
use the tool, how to run it, and what to check afterwards. How the tools work inside is covered
in [chomper-design.md](chomper-design.md).

All tools run from the repo root on a machine with `packages/db/.env` set up: the database URL,
AWS credentials that can read and write the archive bucket, and `MODERN_ARCHIVE_BUCKET`.

---

## fix-player — a game played under the wrong codename

### When to use it

- **Wrong login:** someone played logged in as another member. For example, TheBabe
  (`8nfsQ93`) shows on the scorecard but Ⓢ Ⓐ Ⓑ Ⓞ (`3HcR6fG`) actually played.
- **Swapped suits:** two players logged in on each other's suits.
- **Played as a guest:** a member played without logging in, so the game recorded them as a guest
  with a hardware id like `@123`.

The tool corrects the **archived TDF file**, not just the database. A later reingest or bulk
reingest reads the corrected file, so the fix is permanent. Before this tool existed, the fix was
to edit the TDF by hand.

### Finding the ids

- **Game:** copy the game page URL, e.g. `https://lfstats.com/games/4-19-20261111212439`. The
  slug (`4-19-20261111212439`) or the archive key (`4-19-20261111212439.tdf`) also work.
- **Member ipl ids:** shown on each player's profile and in the scorecard data. The leading `#`
  is optional, so `8nfsQ93` and `#8nfsQ93` both work.
- **Guest ids:** open the game's TDF (linked from the game page) and find the guest's line 3
  entry: `3 <time> @123 player <callsign> …`. The id must include the `@`.

### Running it

Always do a dry run first. It downloads the TDF, applies the change in memory, validates it
and prints the result. Nothing is written.

```bash
pnpm --filter chomper fix-player https://lfstats.com/games/4-19-20261111212439 --map 8nfsQ93=3HcR6fG --dry-run
```

```
Game 4-19-20261111212439.tdf (sm5)

  #8nfsQ93 "TheBabe"  →  #3HcR6fG "Ⓢ Ⓐ Ⓑ Ⓞ"
      memberId → 4-19-153281
      fields rewritten: L3×1 L4×201 L5×149 L6×1 L7×1 L9×163 L10×426 L11×49 L12×121 L13×6

✔ Corrected TDF parses, simulates and passes the consistency check

Dry run — nothing written to S3 or the database.
```

Check that the callsigns on both sides are the people you expect. Then run the same command
without `--dry-run`. It shows the summary again and asks for confirmation before writing
anything:

```bash
pnpm --filter chomper fix-player 4-19-20261111212439 --map 8nfsQ93=3HcR6fG
```

#### More examples

Two players swapped suits. Give both mappings in **one** run, since two separate runs would each
be refused because the other player is still in the game:

```bash
pnpm --filter chomper fix-player <game> --map AAAAAAA=BBBBBBB --map BBBBBBB=AAAAAAA
```

Several unrelated mix-ups in the same game, fixed together:

```bash
pnpm --filter chomper fix-player <game> --map AAAAAAA=XXXXXXX --map @57=YYYYYYY
```

A guest who was really a member:

```bash
pnpm --filter chomper fix-player <game> --map @123=3HcR6fG
```

A member who has never been seen on LFstats before. The tool can't look up their callsign, so
give it:

```bash
pnpm --filter chomper fix-player <game> --map @123=NEWIPL1 --callsign NEWIPL1="Their Callsign"
```

### Options

| Option               | Meaning                                                                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--map FROM=TO`      | `FROM` is the wrong id: a member (`8nfsQ93`) or a guest (`@123`). `TO` is the right member. Repeat for more players.                                      |
| `--callsign TO=Name` | Callsign to record for `TO`. Only needed when `TO` has never been ingested; otherwise their current callsign is used. Quote names that contain spaces.    |
| `--dry-run`          | Validate and print the changes, then stop. Writes nothing.                                                                                                |
| `--yes`, `-y`        | Skip the confirmation prompt.                                                                                                                             |
| `--out <path>`       | Also save the corrected TDF to a local file. Useful with `--dry-run` to inspect it.                                                                       |
| `--file <path>`      | Start from a local TDF instead of the archived one. The archived copy is still the one backed up.                                                         |
| `--no-reingest`      | Update the archive but leave the database alone. Reingest later with `pnpm --filter chomper bulk-reingest <game id>` (the tool prints the exact command). |

### What it changes

For each mapping, every place the wrong id appears in the TDF is changed to the right one. On
the player's entry line, the callsign and centre member number are also replaced with the right
player's. Without that, the right player's profile would be renamed to the wrong callsign.

After confirmation it:

1. Saves the file exactly as the centre uploaded it to `originals/<game>.tdf` in the archive
   bucket. This happens only the first time a game is corrected, so the true original is never
   overwritten.
2. Writes the corrected TDF over `<game>.tdf`.
3. Adds an entry to `corrections/<game>.json` recording what was changed and when.
4. Reingests the game. Admin edits are kept: competition, match assignment, excluded flag,
   description, penalty overrides, post-game penalties and mercenary flags. Penalty edits and
   mercenary flags move with the corrected player.

### When it refuses

| Message                                             | What it means                                                                                                               |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `… does not appear in this game`                    | Wrong id or wrong game. Check the TDF for the exact id, including `#` or `@`.                                               |
| `… is not a player entity`                          | The `@NNN` belongs to a target, beacon or referee, not a player.                                                            |
| `… already played in this game`                     | The right player also has a scorecard in this game. If the two swapped, give both mappings in one run.                      |
| `… has never been ingested, so pass their callsign` | Add `--callsign TO="Name"`.                                                                                                 |
| `Validation: consistency check fails`               | The corrected file no longer simulates cleanly. Nothing was written. This should not happen; investigate before forcing it. |

### Afterwards

- Open the game page and check that the right player has the scorecard.
- The global player rating is **not** recomputed automatically. When convenient, run:

  ```bash
  pnpm --filter @lfstats/db recalc-rating
  ```

- Penalty edits made against a **guest** can't be moved to the member automatically, since a
  guest has no ipl id to match on. The tool prints a note when this applies. Re-enter any such
  edits on the game page.
- The wrong player's callsign history still shows this game's date as the last time they used
  that callsign. This is cosmetic.

### Undoing a fix

The original upload is kept in `originals/`. To undo, copy it back over the corrected file and
reingest:

```bash
aws s3 cp s3://lfstats-modern-archive/originals/<game>.tdf s3://lfstats-modern-archive/<game>.tdf
```

```bash
pnpm --filter chomper bulk-reingest <game id>
```

A plain reingest won't move penalty edits back to the original player. If the game had penalty
or mercenary edits for the corrected player, check them afterwards. A cleaner undo is to run
`fix-player` again with the mapping reversed (`--map 3HcR6fG=8nfsQ93`).

### Finding past fixes

Every correction is recorded in the archive bucket, so there is no separate log to keep:

```bash
aws s3 ls s3://lfstats-modern-archive/corrections/
```
