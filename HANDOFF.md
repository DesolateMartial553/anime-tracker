# Cozy Corner — Session Handoff (v2.8.1)

## Current state (as of 2026-11-01)
- **Repository**: `DesolateMartial553/anime-tracker` on GitHub (`main` branch)
- **Live site**: https://desolatemartial553.github.io/anime-tracker/
- **Android app**: **v2.8.1, versionCode 21**, signed, built and verified by `app/scripts/release.sh`.
  The APK is published **only** as a GitHub Release asset:
  https://github.com/DesolateMartial553/anime-tracker/releases/latest/download/CozyCorner.apk
  (sha256 `7089024d5040c6dc6aa41861773a317547ed70d59575ffd69341bdd5c0ab4e90`)
- **No APK in the repo.** `download/CozyCorner.apk` was removed from git; `*.apk` and `app/dist/` are
  gitignored, so 19 historical APK copies are no longer added on every build.
- **GitHub Releases**: v1.0.0 … v2.2.0, v2.5.0, v2.6.0, v2.7.0, **v2.8.1** (Latest). v2.4.0 was deleted
  on 2026-11-01 because its tag pointed at a commit that is no longer on `main`.

## How a release is made now
    cd app && ./scripts/release.sh 2.8.1 21

One script, and it refuses to finish unless the APK is right:
1. sets `versionName`/`versionCode` in `app/android/app/build.gradle` **and** `version.json`
   (`version.json.apk` always points at the release asset above);
2. `npm run sync` — copies the site into `app/www`, then into the Android assets
   (this is the step that was skipped in v2.8, which is why that APK still shipped Explore);
3. `./gradlew assembleRelease` (JDK 21; the script picks `/usr/lib/jvm/java-21-openjdk`);
4. copies the signed APK to `app/dist/CozyCorner.apk`;
5. verifies the APK itself: `assets/public/index.html`, `assets/public/js/app.js` and
   `assets/public/js/anilist.js` must be byte-identical to the site, and `aapt2 dump badging` must report
   the requested versionCode/versionName. It prints the timestamp and sha256.

It never pushes, tags or publishes. Publishing is manual, in this order:

    git commit -am "v2.8.2: ..."          # 1. commit the version bump + version.json
    git push origin main                  # 2. push, so Pages starts deploying version.json
    gh release create v2.8.2 app/dist/CozyCorner.apk \
      -R DesolateMartial553/anime-tracker --title "Cozy Corner v2.8.2" \
      --target "$(git rev-parse HEAD)" --latest        # 3. release, tagged at the pushed commit

Always pass `--target "$(git rev-parse HEAD)"`. Pages needs about a minute to deploy the new
`version.json`; the release must exist by the time it does, otherwise the update prompt points at a
missing asset. Committing and pushing first, then releasing against the pushed commit, gets both
right — and the tag lands on the real commit.

Installed apps fetch `https://desolatemartial553.github.io/anime-tracker/version.json`, compare
`versionCode` with the installed build, and the Update card downloads the release asset. Obtainium
reads the same release.

**Known issue (2026-11-01, deliberately not fixed):** the `v2.8.1` tag points at `21ac100` (the old
v2.8 commit) because that release was created *before* the push, without `--target`. The owner decided
to leave the tag and release alone. The APK attached to it is the correct one — 3,372,744 bytes,
sha256 `7089024d5040c6dc6aa41861773a317547ed70d59575ffd69341bdd5c0ab4e90`, versionCode 21 /
versionName 2.8.1. Only the tag's commit is wrong; nothing downloads from the tag.

## What changed in v2.8.1
1. **Explore is gone for real.** `js/explore-data.js`, `js/explore-embed.js`, `getAniListExplore()`,
   the `ui.view === 'explore'` branch and the `explore-refresh` action are deleted.
   `grep -rni explore index.html js css` returns nothing, and the shipped APK contains none.
2. **"For you" works again.** The shared media query asked AniList for `year`, which is not a field on
   `Media`, so every recommendations call returned HTTP 400 ("Couldn't reach AniList just now").
   It now asks for `seasonYear`.
3. **One build path.** The README's copy-paste build instructions (which wrote to `download/`) are
   replaced by `app/scripts/release.sh`.

## Not finished
- **Couple sharing — decided 2026-11-01: finish it later, not now.**
  Today: `couple.html` is a static stub (no JavaScript, no sign-in), `js/store.js` has
  `coupleInvite()` / `coupleAccept()` but nothing calls them, and the `couples` table **does not exist**
  in the Supabase project — `supabase.sql` defines it, but an anon REST read of `public/couples`
  returns `PGRST205 Could not find the table 'public.couples'` (while `entries` returns 200).
  To finish: run the `couples` block of `supabase.sql` in the Supabase SQL editor, wire the stub to
  `store.coupleInvite()` / `store.coupleAccept()`, and add the partner view.
- No tests. Verification is the release script's APK checks plus a manual pass in Chrome.

## Verification done for v2.8.1
- `node --check` clean on every file in `js/`.
- Local Chrome run: zero console errors, list view renders, AniList search returns results,
  Shelf / For you / Airing tabs and the Add sheet all open.
- Live site in Chrome after deploy: zero console errors, no `explore` in the served HTML/JS.
- Downloaded the release asset and compared sha256 with the local build: identical.
- Live `version.json` serves 2.8.1 / 21.
