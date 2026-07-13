# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This is the **TwistyTools hub repo**: the apex landing page for **twistytools.com** (GitHub Pages) and the **sole owner** of the shared Firebase project's `firebase.json`, `firestore.rules`, rules tests, and migration scripts. It exists to consolidate three puzzle sites onto one Firebase project (`twistytools`) under subdomains of twistytools.com.

**Current state (2026-07-13):** repo just created; docs only. No landing page, no CNAME, no Firebase project yet. `TWISTYTOOLS-MIGRATION.md` is the roadmap — work through its phases in order and keep its checkboxes current as things land.

## Why this repo owns the rules

A `firebase deploy --only firestore:rules` replaces the **entire project ruleset**, so exactly one repo may own `firestore.rules` for the shared project. That is this repo. Once Phase 2 lands, the three puzzle repos must delete their own `firestore.rules`/`firebase.json` and point here instead. Never add rules files to the puzzle repos again.

## The three puzzle sites

| Puzzle | Local repo | Target origin | Status / order |
|---|---|---|---|
| FTO | `C:\Projects\FTO` | fto.twistytools.com | Demo mode, no Firebase project, CNAME already switched. **Migrates first** (greenfield validation of the shared stack). |
| Skewb | `C:\Projects\Skewbiks` | skewb.twistytools.com | Live on skewbiks.com, probably no real users (Phase 0 verifies). Second. |
| Pyraminx | `c:\Projects\Pyraminx.net\pyraminx-oo-main` | pyraminx.twistytools.com | Live on pyraminx.net **with real users** (launched 2026-07-02). **Migrates last**, via a one-deploy cutover (Phase 6). |

All three are static, no-build-required GitHub Pages sites sharing the same architecture (a `js/engine.js` core, `js/account.js` Firebase layer, `js/config.js` per-site config). Skewb and FTO are forks of pyraminx, so a client diff made in pyraminx mostly transfers.

## Target Firestore schema (shared project)

```
puzzles/{puzzle}/solutions/{id}
puzzles/{puzzle}/meta/{doneMap,stats}
puzzles/{puzzle}/moderators/{uid}
puzzles/{puzzle}/moderatorInvites/{email}
users/{uid}                      ← global account doc
users/{uid}/puzzles/{puzzle}     ← per-puzzle progress
admins/{uid}                     ← global; one bootstrap covers all sites
```

One ruleset parameterized on `{puzzle}`. `admins/{uid}` is global: bootstrap it once in the console (uid shown on any site's About page when signed in) and it covers all three sites.

## Where the rules come from

Port from the **pyraminx repo's post-audit `firestore.rules`** (2026-07-10 security fixes: meta doc shape/bounds validation, single-use moderator invites, `reviewedBy` stores uid not email). As of 2026-07-13 those fixes were uncommitted working-tree changes in the pyraminx repo — verify they are committed there before treating that file as the source. The rules test suite to move and extend for `{puzzle}` paths is pyraminx's `test/firestore.rules.test.mjs` (34/34 against the emulator there); it needs the Firebase emulator plus dev deps, same as in the pyraminx repo.

## Hard constraints

- **Firestore region is immutable.** The new database must use the same region as `pyraminx-oo` (Phase 0 records it) or the Phase 6 data copy gets slow/awkward and latency characteristics change.
- **Spark (free) plan**: named per-puzzle databases were rejected because non-default databases get no free tier. Collection namespacing (`puzzles/{puzzle}/...`) is the design.
- **No cross-subdomain SSO**: Firebase Auth persists per-origin. Same account, but users click sign-in once per subdomain. Demo-mode localStorage does not cross domains either; plan a "sign in to keep your progress" banner for the redirect period.
- **After the pyraminx cutover**, immediately deploy a deny-all-writes ruleset to the old `pyraminx-oo` project (split-brain guard for cached pages).
- **Keep the pyraminx.net 301 for a year or more**: launch links and the user's ENG 313 class submission point at pyraminx.net.

## Site text conventions

Any user-facing copy (landing page, README shown on GitHub): plain, human voice. **No em dashes** in site text, nothing that reads AI-generated. This matches the standing convention across the puzzle sites.

## Build/deploy conventions to inherit if this repo grows assets

The puzzle repos stamp every local asset ref with a `?v=<content-hash>` query via a `tools/stamp-assets.mjs` script wired into `npm run build`. If the landing page grows CSS/JS/images, copy that pattern rather than inventing manual cache-busting.
