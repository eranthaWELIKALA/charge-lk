# Charge.lk

An EV charging time and cost calculator, built as an installable PWA. Works offline,
keeps your cars between visits, and runs a real-time session that alerts you before
the charge finishes.

## Files

| File | Purpose |
|---|---|
| `index.html` | The whole app — markup, styles, logic. No build step, no dependencies. |
| `manifest.webmanifest` | Makes it installable to a phone home screen. |
| `sw.js` | Service worker: offline cache, and it owns the notifications. |
| `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` | App icons. |

## Deploying

The service worker and notifications both require **HTTPS** (or `localhost`). Opening
`index.html` from the filesystem gives you the calculator, but no install prompt, no
offline cache and no notifications.

Any static host works — GitHub Pages, Netlify, Cloudflare Pages, Vercel, or an nginx
directory. Drop all six files in one directory and serve it.

Local testing:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

Installing on a phone: open the site in Chrome (Android) or Safari (iOS) and choose
"Add to Home Screen". On iOS notifications only work **after** it is installed to the
home screen — Safari will not show them for a normal tab.

---

## Read this before you rely on the alert

This is the part worth being straight about.

**A web page cannot reliably wake itself up hours later.** The session ticks once a
second while the page is alive. When you switch apps or lock the phone, the browser
throttles that timer and eventually suspends the page entirely. iOS is the most
aggressive: a backgrounded Safari tab is typically frozen within seconds.

So the alert is dependable in these cases:

- the app is open in the foreground
- the app is backgrounded but the browser has not yet suspended it (minutes on
  Android, seconds on iOS)
- **"Keep the screen on" is ticked and the phone is plugged in** — the wake lock
  holds the page alive for the whole session

And it is **not** dependable if you close the tab, lock the phone, or leave it for
hours. The session itself is safe either way, because elapsed time is derived from
wall-clock timestamps rather than counted ticks: reopen the app and it recalculates
where the charge actually is and fires any alert you missed. But it will be late.

### Making it dependable

Two ways, in increasing order of effort.

**1. Web Push with a small backend.** Keeps this codebase. The server holds the
subscription and pushes at the scheduled moment, so delivery does not depend on the
page being alive. `sw.js` already has the `push` handler wired — you need VAPID keys,
a `pushManager.subscribe()` call, and a server that stores the subscription plus a
fire-at timestamp. Roughly a day of work. Note that iOS supports Web Push only for
home-screen-installed PWAs, 16.4 and later.

**2. A native app.** The right answer if the alert is the point of the product,
because a scheduled local notification needs no server and no network at all.

In Flutter, `flutter_local_notifications` with `zonedSchedule` covers it:

```dart
await notifications.zonedSchedule(
  0,
  '${car.name} is nearly charged',
  'About 10 minutes left.',
  tz.TZDateTime.now(tz.local).add(finishIn - Duration(minutes: 10)),
  const NotificationDetails(
    android: AndroidNotificationDetails('charge', 'Charging alerts',
        importance: Importance.high),
    iOS: DarwinNotificationDetails(),
  ),
  androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
);
```

Android 13+ needs the `POST_NOTIFICATIONS` runtime permission, and Android 12+ needs
`SCHEDULE_EXACT_ALARM` (or `USE_EXACT_ALARM`) for exact timing — otherwise Doze can
defer it by several minutes. iOS just needs notification authorisation at first run.

### Porting the maths

Everything you would move across is already isolated in `index.html` as pure
functions with no DOM access, under the heading `2. ENGINE`:

- `taperAt(soc, mode)` — charge-rate multiplier at a given state of charge
- `simulate({...})` — integrates the charge in 0.25% steps, returns time, energy,
  losses, per-band segments and a trace
- `socAt(sim, socFrom, t)` — where the battery is after `t` hours, used by the session
- `priceSession(sim, opts)` — per-unit, per-hour, or both, with round-up
- `consumption(car)`, `powerFromChargeTime(...)` — small helpers

Translating those to Dart or Kotlin is a mechanical exercise; there is no framework
coupling in any of them. The catalogue in section 1 is a plain data table and moves
across as JSON.

---

## Starting mid-charge

If you plug in and only remember the app an hour later, open **Already charging?** in
the session card and give it whichever figure you can see:

- **Battery %** — from the car or its app
- **kWh delivered** — from the charger's display. This is measured at the plug, so
  the conversion loss is deducted before it counts toward the battery: 13.3 kWh at
  the plug is about 11.7 kWh in the cells at 88% efficiency.
- **Minutes so far** — if all you know is when you plugged in

All three resolve to the same point on the charge curve. It previews the result
before you commit, then backdates `startedAt` so the countdown, the alerts and the
accruing cost are all correct from that moment.

## Data and storage

Cars and the running session are stored on the device, under the key `charge.lk.v1`
(and `charge.lk.session`). Nothing is sent anywhere — there is no backend and no
analytics. Clearing site data clears the garage.

## Accuracy

Catalogue figures are typical published values for models sold or imported into Sri
Lanka, and only ever prefill the form. Charging sockets in particular vary by source
market — check the port on your own car. The charge curve is a general model; your
car, its battery temperature and the charger's thermal limits all move it. Rates are
yours to enter.
