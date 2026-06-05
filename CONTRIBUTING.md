# Contributing to LFstats

Thanks for your interest in contributing. LFstats is a community-maintained tool
for recording and analyzing LaserForce stats. It exists to support its community,
and the goal is for anyone to be able to pick up and continue the work over time.
Contributions of all sizes are welcome.

---

## License of contributions

This project is licensed under the **GNU Affero General Public License v3.0 or
later (`AGPL-3.0-or-later`)**. See the [`LICENSE`](./LICENSE) file for the full
text.

Contributions follow the principle of **inbound = outbound**: when you submit a
patch, you are offering it under the same license the project already uses
(`AGPL-3.0-or-later`). Everything in the repository — including all merged
contributions — lives under that single license. There is no separate
contributor license agreement and no copyright assignment: you retain copyright
on your own contributions, and the project as a whole stays AGPL.

This is deliberate. Keeping copyright distributed among contributors means no
single party can relicense or close the project, which is what keeps it open and
continuable for the community in the long run.

---

## Developer Certificate of Origin (DCO)

Instead of a CLA, this project uses the **Developer Certificate of Origin**. The
DCO is a lightweight statement that you have the right to submit the code you are
contributing under the project's license. You agree to it by adding a
`Signed-off-by` line to each commit.

### How to sign off

Add the `-s` (or `--signoff`) flag when you commit:

```
git commit -s -m "Fix double-resupply detection for simultaneous tags"
```

This appends a line to your commit message:

```
Signed-off-by: Your Name <your.email@example.com>
```

Use your real name and an email you can be reached at. The sign-off must match
the author of the commit.

If you forget, you can amend the most recent commit with:

```
git commit --amend -s --no-edit
```

To sign off several commits at once, an interactive rebase with
`git rebase --signoff <base>` will add the line to each.

### What you are certifying

By signing off, you certify the following (the standard DCO 1.1):

> **Developer's Certificate of Origin 1.1**
>
> By making a contribution to this project, I certify that:
>
> (a) The contribution was created in whole or in part by me and I have the right
> to submit it under the open source license indicated in the file; or
>
> (b) The contribution is based upon previous work that, to the best of my
> knowledge, is covered under an appropriate open source license and I have the
> right under that license to submit that work with modifications, whether created
> in whole or in part by me, under the same open source license (unless I am
> permitted to submit under a different license), as indicated in the file; or
>
> (c) The contribution was provided directly to me by some other person who
> certified (a), (b) or (c) and I have not modified it.
>
> (d) I understand and agree that this project and the contribution are public and
> that a record of the contribution (including all personal information I submit
> with it, including my sign-off) is maintained indefinitely and may be
> redistributed consistent with this project or the open source license(s)
> involved.

---

## How to contribute

1. **Fork** the repository and create a branch off the default branch for your
   change.
2. Make your change, keeping commits focused and signed off (`git commit -s`).
3. Run the build and any tests locally before opening a pull request.
4. **Open a pull request** describing what the change does and why. If it fixes a
   bug or implements something from the spec documents, link to the relevant
   section.
5. A maintainer will review. Be ready for some back-and-forth — review is about
   keeping the codebase consistent, not a judgment of the work.

---

## Project conventions

Chomper is written in TypeScript throughout. Please follow the existing
conventions so the codebase stays consistent:

- **Strict TypeScript.** `"strict": true` is on. Prefer `unknown` over `any` and
  narrow types explicitly, especially when parsing raw TDF fields.
- **Shared types live in `src/types.ts`.** Do not define shared interfaces inline
  in individual files; import them.
- **Database queries live in `packages/db/queries/chomper.ts`** as named exports.
  No inline SQL and no Drizzle calls inside `apps/chomper`. The db package is the
  single source of query logic.
- **Use Drizzle's inferred types** (`typeof table.$inferInsert` /
  `$inferSelect`) rather than hand-writing insert/select types.
- **Bulk insert with the array form** for high-volume tables — never loop
  individual inserts.
- **Use discriminated unions** for fields like job `status` and
  `deactivationCause` rather than bare strings where practical.

When in doubt about game logic, parsing rules, or schema, the specification
documents are authoritative:

- `TDF_Specification.md` — the complete TDF format, line types, event codes, and
  version-gated features.
- `Scorecard_Specification.md` — every Scorecard column and its derivation.
- `SM5_Core_Schema.md` — the full database schema, MVP formula, and state model.

---

## A note on continuity

This project is meant to outlast any single maintainer. The AGPL guarantees that
anyone can fork it and keep it going under the same open terms. If you become a
regular contributor and would like to help steward the project, reach out — adding
trusted co-maintainers is how the work stays alive.
