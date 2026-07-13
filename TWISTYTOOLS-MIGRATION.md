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

## ⚠ Status alert (2026-07-13): domain cutover ran ahead of the Firebase cutover

The repo CNAME flips and old-domain 301s (parts of Phases 5 and 6) happened on
2026-07-13, before Phases 2–4. Both old domains now redirect to the new
subdomains, which still run against the OLD Firebase projects (fine for data,
same backend). Two live problems until fixed:

- [x] **Sign-in is broken on both new origins.** ~~The new subdomains are not
      in the old projects' Auth authorized domains.~~ **Fixed 2026-07-13:**
      both subdomains added to the old projects' authorized domains and
      verified via the identitytoolkit config API.
- [x] **Deep-link 404s: fixed and verified 2026-07-13.** Root cause was
      GoDaddy Domain Forwarding (fixed-destination, no path preservation).
      Both zones moved to Cloudflare with an all-incoming dynamic redirect
      rule per zone (301, `concat(target, http.request.uri.path)`, preserve
      query string). Full battery verified: apex + www, root + deep paths +
      query strings, http + https, on both pyraminx.net and skewbiks.com.

**Alert resolved 2026-07-13.** Both issues fixed and verified; the early
domain cutover is now stable on the old Firebase projects until Phases 2–6
complete the backend migration.
- Demo-mode localStorage on the old origins is now stranded behind the
  redirects (the planned "sign in to keep your progress" banner never
  shipped before the flip). Nothing cheap recovers it.

---

## Phase 0 — Inventory (15 min, Firebase console)

- [x] Skewb data: **worth migrating.** Firestore counts (read 2026-07-13,
      doc counts only): 5 `users` docs created 2026-07-06..10, 1 approved
      solution, 0 moderators, census at done=1/132315. Small but real; the
      Phase 6 copy script pointed at `skewbiks` → `twistytools` handles it
      in seconds. (Auth user list itself still unexported — not needed for
      this decision.)
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
      2026-07-13. All four hostnames serve: the hub landing page on the apex,
      and the three sites on their subdomains. The old domains 301 to the
      subdomains (root path only — see the status alert). Canonical tags on
      pyraminx and skewb still name the old domains; update at their Phase
      5/6 canonical/OG passes.

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

- [x] Port pyraminx's `firestore.rules` to one ruleset parameterized on
      `{puzzle}` — done 2026-07-13 from the post-audit version (committed in
      the pyraminx repo as `319f0b4`). Per-puzzle constants map: pyraminx
      nslots 3,732,480 / total 78,012 / doneMap 13,004 b64; skewb 9,447,840 /
      132,315 / 22,056 plus its required `notation in ['wca','ns']` field.
      FTO has no census so no cfg entry — census writes under `puzzles/fto`
      deny via the failed lookup.
- [x] Move `test/firestore.rules.test.mjs` into the hub repo, extend for the
      namespaced paths, run against the emulator — done 2026-07-13: 47/47
      (adds cross-puzzle moderator isolation, per-puzzle bounds/totals,
      notation, fto lockout, users/{uid}/puzzles/{puzzle} subtree).
- [x] Deploy rules to `twistytools` from the hub repo — deployed and
      verified live 2026-07-13 (fetched the deployed ruleset; byte-for-byte
      the hub file).
- [x] **Deploy the pyraminx repo's post-audit rules to OLD `pyraminx-oo`** —
      deployed and verified live 2026-07-13. (Until then the live ruleset
      was still pre-audit: no meta shape pinning, forgeable reviewedBy,
      non-single-use invites, no name-privacy pin.)
- [~] Delete `firestore.rules` / `firebase.json` from the three puzzle repos
      (leave a README pointer to the hub repo).
      - [x] FTO: removed + README pointer, pushed 2026-07-13 (`5f30328`).
      - [~] Skewb: the cleanup (rules files, .firebaserc, rules tests,
            `test:rules` script, doc pointers) rides the
            `twistytools-cutover` branch and lands at the Phase 5 merge;
            main stays untouched for the parallel session working there.
      - [x] Pyraminx: removed rules files + rules tests + `test:rules`
            script; SETUP/README/CLAUDE pointers to the hub repo; pushed
            2026-07-13 (`0dc02f1`).

## Phase 3 — Client refactor on a branch (2–3 hrs, code)

- [x] Pyraminx repo, branch **`twistytools-cutover`** (pushed 2026-07-13):
      `puzzle: "pyraminx"` + twistytools-3bf66 config; account.js writes
      users/{uid}/puzzles/pyraminx (parent account doc never written);
      oo.js routes all census refs through pdoc/pcol helpers under
      puzzles/pyraminx (21 refs; admins stays global); **CSP frame-src on
      all six pages updated to twistytools-3bf66.firebaseapp.com** (found
      during implementation — old host would have blocked sign-in);
      restamped, check:fresh + engine tests pass. **Do not merge until
      Phase 6.**
- [x] Skewb repo, branch **`twistytools-cutover`** (pushed 2026-07-13):
      same refactor with `puzzle: "skewb"`, plus the post-audit client
      parity the deployed rules enforce (reviewedBy = acting uid, invites
      lowercased + consumed on accept, empty name when showName is off).
      The Phase 2 rules-file cleanup rides this branch too (main hosts
      parallel work). Restamped; build + engine tests pass. **Do not merge
      until Phase 5.**
- [x] FTO repo, branch **`twistytools-cutover`** (pushed 2026-07-13):
      config swaps firebase:null for twistytools-3bf66 with `puzzle:
      "fto"`; account.js → users/{uid}/puzzles/fto; stale .firebaserc
      removed; restamped; build + 67 engine tests pass. Merge at Phase 4.
- All three branches were built and adversarially audited against the
  DEPLOYED ruleset (write shapes, path parity, leftover refs, stale
  stamps). Also fixed 2026-07-13: the Firebase CLI configstore had a
  directory override pointing the hub repo at `pyraminx-oo` (left by MCP
  project switching) — a bare `firebase deploy` from the hub would have
  hit the live project. Repointed to twistytools-3bf66.

## Phase 4 — FTO goes first (30 min, greenfield, zero risk)

- [x] Merge FTO's config change, `npm run build`, deploy — done 2026-07-13.
      (Merged together with the parallel session's 1LP alg commit; stamp
      conflicts resolved by restamping; check:fresh passed; verified live:
      fto.twistytools.com serves config.js?v=638e6cf4 → twistytools-3bf66.)
- [ ] **Auth import BEFORE first sign-in (sequencing fix, found 2026-07-13):**
      Phase 6's `auth:import` preserves old uids, but any Google sign-in on a
      twistytools origin before the import mints a FRESH uid for that email;
      the later import then collides (same email, two uids; migrated data
      keys to the orphaned one). Nobody has signed in yet, so import NOW:
      `firebase auth:export` from `pyraminx-oo` → `auth:import` into
      `twistytools-3bf66` (Google-only users, uids preserved, invisible to
      users). Skewbiks' 5 users can import in the same pass; overlapping
      emails (the owner's own account) will be skipped and need a uid remap
      in the Phase 5 data copy. *Needs explicit user authorization (user
      table export/import).*
- [ ] Create `admins/{uid}` — once, for all three sites. The owner's uid in
      pyraminx-oo is `yajUvP6xgINGQ7vIVtfnjEMKQaI3`; after the auth import
      it is the same in the shared project. *Blocked in auto mode as a
      permission grant — user must name it (or create it in the console;
      FTO has no About page, the uid also shows via
      `OOAccount.user.uid` in the browser console).*
- [~] Verify: anon rule probes against the live project all correct
      2026-07-13 (users read 403, admins read 403, fto meta write 403,
      users/x/puzzles/fto write 403, world-readable meta read passes as
      404-missing). Still to do after sign-in: user doc lands at
      users/{uid}/puzzles/fto with the right shape, trainer/solver progress
      syncs. This validates the whole shared stack.

## Phase 5 — Skewb cutover (~1 hr)

- [~] Repo CNAME file → `skewb.twistytools.com`: **done on GitHub 2026-07-13**
      (commit `cff87de`, made via Pages settings; the local clone is behind 1
      and has unrelated uncommitted alg work — pull before working there).
      Still to do: canonical/OG/sitemap/robots to the new origin; rebuild
      (the stamp pipeline handles asset hashes).
- [ ] Merge skewb's config/refactor branch. If Phase 0 found real data, run the
      Phase 6 copy script pointed at `skewbiks` → `twistytools` first.
- [x] 301 `skewbiks.com` → `skewb.twistytools.com`: done via Cloudflare
      dynamic redirect, path + query preserving, apex + www, verified
      2026-07-13.
- [x] Flip the hub landing page's Skewb card from skewbiks.com to
      skewb.twistytools.com (hub repo `index.html`) — done 2026-07-13.

## Phase 6 — Pyraminx cutover (half a day, the only one with users)

- [ ] **Migration script** (hub repo, `firebase-admin`, service-account keys
      for both projects — works on Spark, no billing needed):
      source preflight must pass before any copy: run
      `node tools/scrub-legacy-pii.mjs` (pyraminx repo) against source, verify
      zero remaining legacy-PII hits, and block migration on any hit;
      `users/{uid}` → account doc + `users/{uid}/puzzles/pyraminx`;
      `solutions` → `puzzles/pyraminx/solutions`; `meta/*` →
      `puzzles/pyraminx/meta/*`; `moderators` + `moderatorInvites` → under
      `puzzles/pyraminx/`; `admins` → `admins`. Build with `--dry-run` and a
      doc-count report. After copy, run a post-copy legacy-PII scan on target
      and block cutover unless it reports zero hits.
- [ ] **Auth**: `firebase auth:export users.json --project pyraminx-oo` →
      `firebase auth:import users.json --project twistytools`. Google-only
      users import clean with uids preserved (no hash params needed).
- [ ] **Cutover, one deploy**: run auth import + data script, then merge the
      branch (new config + namespaced paths + canonical/OG/sitemap updates +
      regenerated OG image), build, push. *(The CNAME flip that was part of
      this deploy already happened 2026-07-13, commit `7153894` — the site
      already serves from pyraminx.twistytools.com against old Firebase.)*
- [ ] Immediately deploy a **deny-all-writes** ruleset to old `pyraminx-oo`
      so cached pages can't write to the abandoned database (split-brain guard).
- [x] DNS: 301 `pyraminx.net` → `pyraminx.twistytools.com`: done via
      Cloudflare dynamic redirect, path + query preserving, apex + www,
      verified 2026-07-13. Keep the zone and rule long-term — launch links
      point at pyraminx.net.
- [x] Flip the hub landing page's Pyraminx card from pyraminx.net to
      pyraminx.twistytools.com (hub repo `index.html`) — done 2026-07-13.
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
