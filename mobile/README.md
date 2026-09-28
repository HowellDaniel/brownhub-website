# BrownHub — phone app shell

Wraps the live site (`https://www.brownhub283.com`) in a real iOS and Android app so it can be
listed on the App Store and Google Play. The website itself stays the source of truth: this
folder only holds the native container, its icons and its store listings.

## What already exists

| Piece | Where |
| --- | --- |
| App icon, all sizes | `../icons/` — `store-1024.png` is the App Store icon, `maskable-512.png` the Play one |
| Name and description | `../manifest.webmanifest` (`name`, `short_name`, `description`) |
| Offline behaviour | `../sw.js` — the bundled copy of the site works with no signal |
| Splash background | `#1b0b0c`, the brand ink used in `capacitor.config.json` |

## Before you start

This machine has no Node.js, so the commands below need it installed first (`node 20+`, `npm 10+`).
Apple also needs Xcode and a paid Apple Developer account; Google needs the Play Console fee and
a completed identity check. Both accounts belong to BrownHub, not to an agent.

## Build

```bash
cd mobile
npm install
npx cap add ios
npx cap add android
npx cap sync
npx cap open ios       # then Editor > Open Project, choose a Simulator, press Run
npx cap open android   # Android Studio, let it Gradle-sync, pick a device, Run
```

Point `webDir` at the site root, or set `server.url` to `https://www.brownhub283.com` if you would
rather the app stream the live site instead of shipping a bundled copy. Streaming is simpler but
Apple rejects shells that add nothing over the website, so keep the native parts below in.

## What makes it more than the website

Both stores judge a wrapper on what it adds. These are the pieces worth wiring in, in order:

1. **Push on order updates** — `@capacitor/push-notifications` plus the existing Supabase
   `send-sms` Edge Function: when a request changes state, also send an APNs/FCM message.
2. **Saved requests offline** — the account page already lists past requests; cache the last
   payload so it opens with no signal.
3. **Native share** — `@capacitor/share` to send a quote or a catalog item straight to WhatsApp.
4. **Camera for briefs** — `@capacitor/camera` so a client can photograph a sketch and attach it.

## Store listings

- Apple App Store Connect: bundle id `com.brownhub.app`, category Business or Graphics & Design,
  privacy policy URL `https://www.brownhub283.com/privacy.html`.
- Google Play: application id `com.brownhub.app`, data-safety form answers "no data collected
  beyond what the website already handles", full-stop listing URL
  `https://www.brownhub283.com/privacy.html`.
- Screenshots: iPhone 6.7" and 6.5" for Apple, a phone and a 7" tablet for Play. Take them from
  the running app, not from the website in a browser.
- Contact and support email on both listings must be one of the studio addresses already on the
  site (`howelldaniel533@gmail.com` or `anghadaniel621@gmail.com`).
