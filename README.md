# Cozy Corner ✿

*just for my sweet princess*

A cozy tracker for the anime and donghua she's watching, wants to watch, and has finished.
It comes two ways, built from the same code:

| | Where | Best for |
|---|---|---|
| 🌐 **Website** | **https://desolatemartial553.github.io/anime-tracker/** | Laptop, or any phone browser |
| 📱 **Android app** | **[Download CozyCorner.apk](https://desolatemartial553.github.io/anime-tracker/download/CozyCorner.apk)** (in this repo at [`download/CozyCorner.apk`](download/CozyCorner.apk)) | Her Android phone: opens like a real app and works offline |

---

## 📱 Installing the Android app

1. On the phone, open **https://desolatemartial553.github.io/anime-tracker/download/CozyCorner.apk**
   (or open the website in Chrome and tap **Download** on the "Get the Cozy Corner app" card at the bottom).
2. When the download finishes, tap **CozyCorner.apk** in the notification or in **Files → Downloads**.
3. Android will say installing from this source isn't allowed yet. Tap **Settings**, turn on
   **Allow from this source**, then go back and tap **Install**.
   *(This is normal for apps that aren't from the Play Store. You only do it once.)*
4. If **Play Protect** shows a warning about an unrecognised app, tap **More details → Install anyway**.
   The app is just this website packaged up. It only uses the internet (to search AniList and load covers)
   and the vibration motor (for little taps of feedback).
5. Open **Cozy Corner** from the home screen: it's the pink icon with the white cat. ✿

**Updating:** when a new version is published, download and install the APK the same way. It installs
over the old one and **keeps her list**. *(Uninstalling the app first would delete the list, so don't.)*

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

### Light / dark
Tap the 🌙 / ☀️ button at the top right. Day mode has drifting sakura petals, night mode has twinkling stars.
It remembers the choice.

---

## 💾 Where her list is saved (please read)

Right now, **each device keeps its own list**. The app on her phone and the website on her laptop
don't share data yet, and two different browsers don't share either.

- The list is saved on the device automatically and survives closing the app or browser.
- Clearing the browser's site data, or uninstalling the app, deletes that device's list.

**Syncing between devices** is built in but switched off until a free Supabase database is connected.
Once it's on, she signs in with her email (no password: she gets a sign-in email and taps the link,
or types the 6-digit code into the app) and the same list appears everywhere. Anything already saved
on a device is uploaded the first time she signs in. Setup steps are in the developer notes below.

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
| `download/CozyCorner.apk` | The current signed Android build |

### Run the website locally

    python -m http.server 8765      # then open http://127.0.0.1:8765

### Build a new APK

    cd app
    npm install
    export JAVA_HOME=/usr/lib/jvm/java-21-openjdk ANDROID_HOME=~/Android/Sdk
    npm run copy-web && npx cap copy android
    cd android && ./gradlew assembleRelease --offline --max-workers=1
    cp app/build/outputs/apk/release/app-release.apk ../../download/CozyCorner.apk

- Increase `versionCode` (and `versionName`) in `app/android/app/build.gradle` before each new release.
- Release builds are signed with `~/.keystores/cozy-corner.jks` (settings in
  `~/.keystores/cozy-corner.properties`, never committed). **Keep a backup:** Android only installs an
  update signed with the same key.

### Turn on sync (Supabase)

1. Create a free project at https://supabase.com.
2. **SQL Editor → New query →** paste `supabase.sql` **→ Run**.
3. **Project Settings → API:** copy the Project URL and anon/publishable key into `js/config.js`.
   (The anon key is meant to be public; row-level security keeps each person's list private.)
4. **Authentication → URL Configuration:** set the Site URL to the GitHub Pages URL and add it to Redirect URLs.
5. **Authentication → Email Templates → Magic Link:** add `{{ .Token }}` so the email includes a code.
   Inside the Android app she types the code, because the email link opens the browser, not the app.
6. Optional: after she has signed in, turn off new sign-ups under **Authentication → Sign In / Providers**.
7. Push the website, then build and publish a new APK so the app gets the keys too.
