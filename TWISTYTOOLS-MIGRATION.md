# TwistyTools migration plan

Consolidate pyraminx.net, skewbiks.com, and the FTO site onto subdomains of
**twistytools.com** (pyraminx. / skewb. / fto.) backed by **one shared Firebase
project**. Written 2026-07-13. Lives in the hub repo (moved here from the
pyraminx repo when the hub was created, 2026-07-13).

**Decision summary:** one fresh Firebase project (`twistytools`), not three;
repos stay separate (GitHub Pages is one custom domain per repo); a new hub
repo for the apex landing page becomes the sole owner of `firestore.rules`.
Pyraminx migrates last because it is the only site with real users.

---

## Phase 0 — Inventory (15 min, Firebase console)

- [ ] In the `skewbiks` project console, check **Authentication → Users** and
      the `solutions` / `users` collections. Decide: does skewb have real user
      data worth migrating, or just your own test account?
      *(Needs your eyes or explicit permission: exporting the user list was
      blocked as PII handling on 2026-07-13.)*
- [x] In `pyraminx-oo`, note the Firestore **region**: **`us-east5`**
      (verified via CLI 2026-07-13). Skewbiks is `nam5` — only matters if
      Phase 0 decides its data is worth copying.

## Phase 1 — Create the shared project (45 min, console + DNS)

- [x] Create Firebase project **`twistytools`** — done 2026-07-13. Actual
      project ID is **`twistytools-3bf66`** (bare `twistytools` was taken).
      Web app registered; Firestore `(default)` database created in
      **us-east5** (matches pyraminx-oo) with deny-all rules (production
      mode) — all verified via CLI 2026-07-13. Web SDK config:

      ```js
      {
        apiKey: "AIzaSyC5b82XjgZ26GsVvgTO0nCK_KiltQhRozM",
        authDomain: "twistytools-3bf66.firebaseapp.com",
        projectId: "twistytools-3bf66",
        storageBucket: "twistytools-3bf66.firebasestorage.app",
        messagingSenderId: "446558622358",
        appId: "1:446558622358:web:b99303e5695392108e68b7",
        measurementId: "G-1435QXXZM8"
      }
      ```
- [ ] Auth: enable **Google** provider, set support email, set OAuth consent
      screen public name to **TwistyTools** (what users see in the popup).
      *(Console-only; not verifiable via CLI — confirm even if you think it's
      done.)*
- [ ] Authorized domains: `twistytools.com`, `pyraminx.twistytools.com`,
      `skewb.twistytools.com`, `fto.twistytools.com`, `localhost`.
      *(Console-only; not verifiable via CLI.)*
- [x] Create the hub repo (`twistytools.com`): apex landing page on GitHub
      Pages (`CNAME twistytools.com`). It becomes the **only** home of
      `firebase.json`, `firestore.rules`, the rules tests, and migration
      scripts. (A rules deploy replaces the whole project ruleset — exactly one
      repo may own it.)
      *(Done 2026-07-13: landing page + CNAME pushed, Pages enabled on
      main branch root, https://twistytools.com verified serving. Landing
      cards link to each site's current home; flip skewb/pyraminx links at
      their cutovers.)*
- [x] DNS: apex + all three subdomains resolve via Cloudflare proxy as of
      2026-07-13. fto.twistytools.com serves the FTO site; skewb. and
      pyraminx. subdomains already serve live mirrors of skewbiks.com /
      pyraminx.net (canonicals still point at the old domains, which keeps
      SEO safe until cutover). The apex 404s until the hub repo gets its
      CNAME + Pages setup.

## Phase 2 — Shared schema + rules (2–3 hrs, code)

Target schema:

```
puzzles/{puzzle}/solutions/{id}
puzzles/{puzzle}/meta/{doneMap,stats}
puzzles/{puzzle}/moderators/{uid}
puzzles/{puzzle}/moderatorInvites/{email}
users/{uid}                      ← global account doc
users/{uid}/puzzles/{puzzle}     ← per-puzzle progress
admins/{uid}                     ← global; one bootstrap covers all sites
```

- [ ] Port pyraminx's `firestore.rules` to one ruleset parameterized on
      `{puzzle}`. **Port the post-audit version** (2026-07-10 fixes: meta
      doc shape/bounds validation — the "meta-vandalism" fix — plus single-use
      moderator invites and `reviewedBy` as uid). As of 2026-07-13 those fixes
      were still uncommitted working-tree changes in the pyraminx repo; verify
      they've been committed there before porting.
- [ ] Move `test/firestore.rules.test.mjs` into the hub repo, extend for the
      namespaced paths, run against the emulator.
- [ ] Deploy rules to `twistytools` from the hub repo.
- [ ] Delete `firestore.rules` / `firebase.json` from the three puzzle repos
      (leave a README pointer to the hub repo).

## Phase 3 — Client refactor on a branch (2–3 hrs, code)

- [ ] Pyraminx repo, on a branch: add `puzzle: "pyraminx"` to `js/config.js`,
      add a path-prefix helper, route Firestore references through it —
      `js/account.js` has 2 refs (`users/{uid}` → account doc +
      `users/{uid}/puzzles/pyraminx`), `js/oo.js` ~24. Swap the firebase config
      block to `twistytools`. **Do not merge yet** — this branch is the cutover.
- [ ] Apply the same diff to the skewb repo (fork; the patch mostly transfers).
- [ ] FTO: it's in demo mode, so just paste the config with `puzzle: "fto"`.

## Phase 4 — FTO goes first (30 min, greenfield, zero risk)

- [ ] Merge FTO's config change, `npm run build`, deploy.
- [ ] Sign in on fto.twistytools.com, grab your uid from the About page, create
      `admins/{your-uid}` in the console — once, for all three sites.
- [ ] Verify: sign-in works, user doc writes land under the new schema, rules
      deny what they should. This validates the whole shared stack.

## Phase 5 — Skewb cutover (~1 hr)

- [ ] Repo CNAME file → `skewb.twistytools.com`; enforce HTTPS once the cert
      issues. Update canonical/OG/sitemap/robots to the new origin; rebuild
      (the stamp pipeline handles asset hashes).
- [ ] Merge skewb's config/refactor branch. If Phase 0 found real data, run the
      Phase 6 copy script pointed at `skewbiks` → `twistytools` first.
- [ ] 301 `skewbiks.com` → `skewb.twistytools.com` at the registrar/Cloudflare
      level (GitHub Pages can't serve the old domain *and* redirect it).
- [ ] Flip the hub landing page's Skewb card from skewbiks.com to
      skewb.twistytools.com (hub repo `index.html`).

## Phase 6 — Pyraminx cutover (half a day, the only one with users)

- [ ] **Migration script** (hub repo, `firebase-admin`, service-account keys
      for both projects — works on Spark, no billing needed):
      `users/{uid}` → account doc + `users/{uid}/puzzles/pyraminx`;
      `solutions` → `puzzles/pyraminx/solutions`; `meta/*` →
      `puzzles/pyraminx/meta/*`; `moderators` + `moderatorInvites` → under
      `puzzles/pyraminx/`; `admins` → `admins`. Build with `--dry-run` and a
      doc-count report.
- [ ] **Auth**: `firebase auth:export users.json --project pyraminx-oo` →
      `firebase auth:import users.json --project twistytools`. Google-only
      users import clean with uids preserved (no hash params needed).
- [ ] **Cutover, one deploy**: run auth import + data script, then merge the
      branch (new config + namespaced paths + CNAME `pyraminx.twistytools.com`
      + canonical/OG/sitemap updates + regenerated OG image), build, push.
- [ ] Immediately deploy a **deny-all-writes** ruleset to old `pyraminx-oo`
      so cached pages can't write to the abandoned database (split-brain guard).
- [ ] DNS: 301 `pyraminx.net` → `pyraminx.twistytools.com`. Keep long-term —
      launch links and the ENG313 submission point at it.
- [ ] Flip the hub landing page's Pyraminx card from pyraminx.net to
      pyraminx.twistytools.com (hub repo `index.html`).
- [ ] Verify live: sign in (same uid as before), Moderation tab loads (proves
      `admins/{uid}` + rules), census renders, done-bitmap updates, trainer
      progress syncs.

## Phase 7 — Cleanup

- [ ] Update each repo's SETUP.md / CLAUDE.md for the shared-project reality;
      cross-link the three sites in the navbar; check the moderator Google Form
      text for pyraminx.net references.
- [ ] After 2–4 quiet weeks, delete the `pyraminx-oo` and `skewbiks` Firebase
      projects. Keep domain redirects for a year or more.

---

## Caveats to keep in mind

- **No automatic SSO**: Firebase Auth persists per-origin, so users sign in
  once per subdomain — same account underneath, one click.
- **Demo-mode localStorage does not cross domains**: signed-out progress and
  solver prefs on pyraminx.net won't follow users. Signed-in data lives in
  Firestore and carries. Cheap mitigation: a "we've moved — sign in to keep
  your progress" banner during the redirect period.
- **Firestore region is immutable** — set it right at project creation.
- **Named per-puzzle databases were rejected**: non-default databases get no
  free tier; collection namespacing is the right tool on Spark.
