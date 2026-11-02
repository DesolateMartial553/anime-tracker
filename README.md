# Cozy Corner ✿

*just for my sweet princess*

A cozy tracker for the anime and donghua she's watching, wants to watch, and has finished.
It comes two ways, built from the same code:

| | Where | Best for |
|---|---|---|
| 🌐 **Website** | **https://desolatemartial553.github.io/anime-tracker/** | Laptop, or any phone browser |
| 📱 **Android app** | **[Download CozyCorner.apk](https://github.com/DesolateMartial553/anime-tracker/releases/latest/download/CozyCorner.apk)** (attached to the latest [GitHub Release](https://github.com/DesolateMartial553/anime-tracker/releases/latest)) | Her Android phone: opens like a real app and works offline |

---

## 📱 Installing the Android app

1. On the phone, open **https://github.com/DesolateMartial553/anime-tracker/releases/latest/download/CozyCorner.apk**
   (or open the website in Chrome and tap **Download** on the "Get the Cozy Corner app" card at the bottom).
2. When the download finishes, tap **CozyCorner.apk** in the notification or in **Files → Downloads**.
3. Android will say installing from this source isn't allowed yet. Tap **Settings**, turn on
   **Allow from this source**, then go back and tap **Install**.
   *(This is normal for apps that aren't from the Play Store. You only do it once.)*
4. If **Play Protect** shows a warning about an unrecognised app, tap **More details → Install anyway**.
   The app is just this website packaged up. It only uses the internet (to search AniList and load covers)
   and the vibration motor (for little taps of feedback).
5. Open **Cozy Corner** from the home screen: it's the pink icon with the white cat. ✿

### Updating the app
- When a new version is published, a pink card appears at the top of her shelf:
  **"Cozy Corner 1.x is ready ✿"**. Tap **Update**, open the downloaded file and tap **Install**.
  It installs over the old version and **keeps her list**.
- The app checks when it opens, and again whenever she comes back to it (at most every 6 hours).
  She can also check by hand: tap the **sliders button** (top right) → **Check for updates**.
- Tapping **×** on the card hides it until the next version comes out.
- *Never uninstall the app to update it: uninstalling deletes the list on that phone.*

**Optional, fully automatic updates:** install [Obtainium](https://github.com/ImranR98/Obtainium)
(free), tap **Add App**, paste `https://github.com/DesolateMartial553/anime-tracker` and save.
It will notify her about new releases and can install them in the background.

---

## 🌐 Using the website

Just open **https://desolatemartial553.github.io/anime-tracker/** in any browser. Nothing to install.

On iPhone or Android you can also add it to the home screen so it opens full-screen:
- **Android (Chrome):** ⋮ menu → **Add to Home screen**
- **iPhone (Safari):** Share button → **Add to Home Screen**

---

## ✿ How to use it (same in the app and on the website)

### Adding a show
1. Tap the big pink **+** button (bottom of the screen; top right on a laptop).
2. Type the name in English, romaji, or Chinese/Japanese, e.g. *Link Click*, *Mo Dao Zu Shi*, *仙逆*.
   You can also tap one of the suggestion chips.
3. Each result shows its cover, an **Anime** or **Donghua** badge, the format/year and the episode count.
4. Tap **▶ Watching** if she's already started it, or **+ Plan to watch** to save it for later.
   Shows already on her shelf say **On Watching ✓**. Tap that to open the show instead.

### Her shelf
- The chips at the top are her five lists: **Watching · Plan to watch · Completed · On hold · Dropped**.
  The number on each chip is how many shows are in it. Swipe the row sideways to see them all.
- **All / Anime / Donghua** filters the list by type.
- The **Recent / Title A–Z / Rating** menu changes the sort order.

### Tracking episodes
- Tap **+1** on a show's card after each episode. The bar fills up and shows e.g. *ep 5 / 12*.
- Pressing +1 on a show in *Plan to watch*, *On hold* or *Dropped* moves it to **Watching** automatically.
- After the last episode it asks **"Mark completed?"**. Tap it for a little celebration 🎉.
- Shows that are still airing show a countdown like **✦ ep 7 in 2d 4h**.

### Show details: rating, notes, moving lists
Tap a show's cover or title to open its details sheet:
- **List:** move it between Watching, Plan to watch, Completed, On hold, Dropped.
- **Progress:** use **−** and **+**, or type the episode number.
- **Rating:** tap a heart (1–10). Tap the same heart again to clear the rating.
- **Notes:** anything she likes (favourite character, where she paused, who recommended it). Saves automatically.
- **View on AniList ↗** opens the show's full page.
- **Remove from list:** tap it twice to confirm.
- To close the sheet: tap **×**, tap outside it, **swipe it down** by the little handle, or press the phone's **back** button.

### Airing tab
**Airing** (bottom bar) lists the next episode of every currently airing show on her lists,
grouped by day (**Today**, **Tomorrow**, …) with the time in her own time zone.

### Back up or move her list
Tap the **sliders button** at the top right (next to 🌙):
- **Copy backup code** copies her whole list as a block of text. Paste it into a note, or send it
  to herself in a chat, to keep it safe.
- **Restore or move:** paste a backup code and tap **Restore**. Shows she doesn't have yet are added.
  For shows on both, the most recently changed version is kept, and nothing is ever deleted.
- To move her list from the phone app to the laptop website (or back): copy the code on one, send it to
  herself, and restore it on the other. Do this before reinstalling the app or clearing browser data.

### Light / dark
Tap the 🌙 / ☀️ button at the top right. Day mode has drifting sakura petals, night mode has twinkling stars.
It remembers the choice.

---

## 💾 Where her list is saved, and syncing

Her list syncs between her phone and laptop once she signs in. It is stored in a free Supabase
database that only she can read, and a copy is also kept on each device so the app opens instantly
and still shows her shelf offline.

### Signing in (one time per device)
1. Open the app or the website. On first launch it asks for her **email address**: enter it and tap
   **Send me a sign-in email**.
2. Open the email titled **"Your Cozy Corner sign-in ✿"** (check Spam the first time).
3. **Tap "Tap here to sign in".** On the phone, the link opens the Cozy Corner app and signs her in.
   On the laptop it signs her in on the website. *Alternatively*, type the **6-digit code** from the
   email into the box on the sign-in screen.
4. Her shelf appears. Anything she had saved on that device before signing in is uploaded
   automatically, so nothing is lost.

Links and codes only work once and expire after a while. If one says it has expired, just request a new email.
She stays signed in. To sign out, tap the **sign-out button** (top right) twice.

- Changes are saved immediately and appear on her other device the next time she opens it.
- If she is offline, the shelf still shows, but changes may fail to save until she's back online.
- Clearing browser data on a device only removes that device's copy; her list is safe in the database.
- It is still worth making a **backup code** now and then (see *Back up or move her list*).

---

## 🛠 Developer notes

Plain HTML/CSS/JS (ES modules), no build step. Hosted on GitHub Pages from the repo root.

| Path | What it is |
|---|---|
| `index.html`, `css/`, `js/`, `fonts/` | The website (also bundled into the app) |
| `js/anilist.js` | AniList GraphQL search + batched airing lookups (cached 30 min) |
| `js/store.js` | Storage: Supabase sync with optimistic updates, or localStorage only |
| `js/app.js` | UI, animations, sheets, back-button handling |
| `js/config.js` | Supabase keys, subtitle text, APK download link |
| `supabase.sql` | Database table + row-level security policies |
| `app/` | Capacitor Android project that wraps the website |
| `app/scripts/release.sh` | Builds **and verifies** a signed APK: sets the versions, syncs the site, runs Gradle, checks the APK |
| `version.json` | Latest app version; installed apps check this to offer updates |

### Run the website locally

    python -m http.server 8765      # then open http://127.0.0.1:8765

### The app loads the live site
The APK is a thin shell: `app/capacitor.config.json` sets `server.url` to the GitHub Pages address, so the
app always runs the deployed website — a website deploy reaches her app on the next open, no new APK needed.
`sw.js` (service worker) caches the app shell so it still opens offline, and `offline.html` is the fallback
shown if the very first open has no connection. A new APK is only needed for native changes (Capacitor
upgrades, plugins, icons, version bumps). Because the app now *is* the website, signing in once in the app
after the switch-over moves her device copy to the website's origin; her list is in her account either way.

### Build a new APK

    cd app && npm install        # first time only
    ./scripts/release.sh 2.8.1 21

That one command sets `versionCode`/`versionName` in `app/android/app/build.gradle` **and**
`version.json`, copies the website into the app, builds the signed APK, puts it at
`app/dist/CozyCorner.apk`, and then checks the APK itself: the bundled `index.html`, `js/app.js`
and `js/anilist.js` must be byte-identical to the site, and the version inside the
APK must match the arguments. It never pushes or publishes anything.

### Publishing an update
1. `app/scripts/release.sh <versionName> <versionCode>` — read the verification output at the end.
2. Commit the version bump and `version.json`, then push:

       git commit -am "v2.8.2: ..."
       git push origin main

3. Create the GitHub release against the commit you just pushed:

       gh release create v2.8.2 app/dist/CozyCorner.apk -R DesolateMartial553/anime-tracker \
         --title "Cozy Corner v2.8.2" --target "$(git rev-parse HEAD)" --latest

   Push first because Pages needs about a minute to deploy the new `version.json`: the release has to
   exist by the time the update prompt appears, or the prompt points at a missing file. Always pass
   `--target "$(git rev-parse HEAD)"` so the tag lands on the pushed commit — v2.8.1's tag points at
   the old v2.8 commit for exactly that reason (its APK asset is fine; see `HANDOFF.md`).
4. Installed apps fetch `version.json`, see a higher `versionCode`, and show the update card; the
   **Update** button downloads the release asset.
5. APKs are **never committed** — `*.apk` and `app/dist/` are gitignored. GitHub Releases is the only
   place an APK is published (Obtainium reads the same release).

- Release builds are signed with `~/.keystores/cozy-corner.jks` (settings in
  `~/.keystores/cozy-corner.properties`, never committed). **Keep a backup:** Android only installs an
  update signed with the same key.

### Sync (Supabase), already set up
- Project URL and publishable key are in `js/config.js` (the key is meant to be public;
  row-level security in `supabase.sql` keeps each person's list private).
- Auth settings: Site URL is the GitHub Pages address, and Redirect URLs include it plus
  `com.desolatemartial.cozycorner://login` (the app's deep link).
- Sign-in emails are sent through custom SMTP (Gmail app password) so the limit is 30/hour and the
  templates (Confirm signup and Magic link) include `{{ .ConfirmationURL }}` and `{{ .Token }}`.
- Free plan note: Supabase pauses a project after about a week with no activity. If sync stops,
  open the Supabase dashboard and click **Restore project**.
