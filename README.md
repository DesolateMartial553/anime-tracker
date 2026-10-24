# Cozy Corner ✿

A cozy anime & donghua watchlist. Search AniList, add shows, track episodes,
rate them, keep notes, and see countdowns to the next episode.

Plain HTML/CSS/JS, no build step. Hosted on GitHub Pages.

## Turning on sync (phone + laptop)

Without Supabase keys the app saves to the current browser only.

1. Create a free project at https://supabase.com.
2. SQL Editor → New query → paste `supabase.sql` → Run.
3. Project Settings → API: copy the **Project URL** and the **anon / publishable** key
   into `js/config.js`. (The anon key is meant to be public; row-level security
   keeps each person's list private.)
4. Authentication → URL Configuration: set **Site URL** to the GitHub Pages URL
   and add it under **Redirect URLs**.
5. Optional, for the home-screen app on iPhone: Authentication → Email Templates →
   Magic Link, add `{{ .Token }}` to the email so she can type the code in the app
   instead of tapping the link (which opens Safari, not the home-screen app).
6. Optional: once she has signed in, turn off "Allow new users to sign up" under
   Authentication → Sign In / Providers.

## Android app

The `app/` folder wraps the same site in a Capacitor Android app (the website files are
copied in at build time, so there is only one codebase).

    cd app
    npm install
    export JAVA_HOME=/usr/lib/jvm/java-21-openjdk ANDROID_HOME=~/Android/Sdk
    npm run build:apk     # → app/android/app/build/outputs/apk/release/app-release.apk

Release builds are signed with `~/.keystores/cozy-corner.jks` (settings in
`~/.keystores/cozy-corner.properties`). **Back that folder up**: Android only accepts an
update if it's signed with the same key. Bump `versionCode` in
`app/android/app/build.gradle` for each new release, then upload the APK to a GitHub
Release as `CozyCorner.apk` (the site's "Get the app" banner links to the latest one).

## Running locally

    python -m http.server 8765

then open http://127.0.0.1:8765.

## Files

- `js/anilist.js`: AniList GraphQL search + batched airing lookups (cached 30 min)
- `js/store.js`: Supabase / localStorage storage with optimistic updates
- `js/app.js`: UI rendering and events
- `supabase.sql`: table + row-level security policies
