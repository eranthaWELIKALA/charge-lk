# Charge.lk

EV charging time & cost calculator for Sri Lanka. Installable PWA, single HTML
file, no framework, no build step.

## Run it

```bash
npx serve .          # or: python3 -m http.server 8080
```

Open the printed localhost URL. The service worker and notifications both
require **HTTPS or localhost** — opening `index.html` directly from the
filesystem (`file://`) gives you the calculator but no install prompt, no
offline cache, and no notifications. Don't "fix" that; it's a platform
restriction, not a bug.

There is no build step and no package.json dependency for the app itself —
`index.html` is the entire product. `package.json` here only exists for the
dev-time test dependency (`jsdom`).

## Files

| File | Purpose |
|---|---|
| `index.html` | Everything — markup, CSS, and JS in one file. See below for its internal structure. |
| `manifest.webmanifest` | Home-screen install metadata. |
| `sw.js` | Service worker: offline cache + owns notification display (`showNotification`, `notificationclick`, `push`). |
| `icon-*.png` | App icons (192, 512, 512 maskable). Regenerate with the Pillow script in git history if you need to change the mark. |
| `README.md` | User/deployer-facing docs — deployment, and an honest writeup of background-notification limits on the web (read this before promising a user "you'll get notified" — see below). |

## `index.html` internal structure

Numbered sections, in order, findable by searching for the heading text:

1. **`REFERENCE DATA`** — the vehicle catalogue (`CATALOGUE`), connector
   metadata (`PLUGS`), and the AC/DC charge taper tables (`CURVES`). Pure data,
   no logic. This is the thing you edit when adding a car model or fixing a
   published figure — see "Editing the catalogue" below.
2. **`ENGINE`** — pure functions, zero DOM access. `taperAt`, `simulate`,
   `priceSession`, `socAt`, `timeAtSoc`, `consumption`, `powerFromChargeTime`,
   `acceptRate`, `carPlug`. Everything time/cost/energy-related lives here.
   This is the block to port if you ever build a native app — see
   "Porting the engine" in README.md.
3. **`STORAGE`** — a tiny `DB` wrapper: tries `window.storage` (Claude
   artifact sandbox), falls back to `localStorage`, falls back to an in-memory
   object. Two keys: `charge.lk.v1` (cars + active car) and a `session` field
   for the in-progress charge.
4. **`UI`** — everything else, in labelled `/* --- x --- */` blocks: field
   explanations (`INFO` map + popover), view switching, the car-form modal,
   delete confirmation, the real-time session engine (timestamps, not frame
   counts — see below), notifications, wake lock, the catch-up panel, garage
   rendering, the calculator's render loop, the chart, and boot.

## Non-obvious design decisions (don't undo these by accident)

- **The session is timestamp-based, not tick-counted.** Elapsed charge-time is
  always recomputed from `Date.now() - startedAt - pausedMs`, never
  accumulated by adding up `setInterval` deltas. This is why it survives a
  reload, a throttled background tab, or the device sleeping — reopen it and
  it recalculates where the charge actually is. If you touch `tick()` or
  `sessElapsedHours()`, preserve this property or the countdown will drift.
- **`priceSession` bills grid energy by default, not battery energy.** A
  `meterCar` flag switches it, because public DC stations usually bill what
  they delivered to the car, while a home meter counts what it drew from the
  wall. Getting this backwards silently under- or over-charges by the
  efficiency margin (~7-12%).
- **The AC/DC mode is derived from the charger socket, not a separate
  toggle.** `PLUGS[key].mode` is the single source of truth. Don't reintroduce
  an independent AC/DC switch — it can drift out of sync with the socket
  choice, which is exactly the bug this replaced.
- **Catalogue entries are prefill only.** Picking a car from `CATALOGUE` never
  writes directly to a saved car — it fills the form fields, which the user
  can then override, and *those* values get saved. Don't shortcut this by
  saving the catalogue row directly; real cars vary from spec (see "A live
  example" below).
- **Efficiency defaults (88% AC / 93% DC) are set automatically** when the
  charger socket changes, but the field stays user-editable in an "Advanced"
  `<details>`. Don't hide it entirely — it's the one number in the whole
  simulation nobody can look up, so it needs to stay correctable.
- **Notifications are best-effort, not guaranteed**, and the code should never
  imply otherwise in copy/UI. A backgrounded tab gets throttled and eventually
  suspended by the browser (iOS especially aggressively), so the in-app
  countdown can only promise delivery when the page is alive, briefly after
  backgrounding, or when the wake lock is holding it open. README.md has the
  full explanation and the two real fixes (Web Push + tiny backend, or a
  native app with local scheduled notifications) — point users there rather
  than re-explaining it inline if it comes up again.

## Editing the catalogue

`CATALOGUE` entries are `[name, batteryKWh, realRangeKm, acKW, acPlugKey,
dcKW|null, dcPlugKey|null]`. A few rules that keep the data honest:

- **`realRangeKm` must be real-world range, not the brochure's WLTP/NEDC/CLTC
  figure.** Lab figures run 20-40% optimistic and corrupt the derived Wh/km
  (`consumption()`), which then corrupts cost-per-km and range-added for every
  session using that catalogue entry.
- **`dcKW` and `dcPlugKey` must agree** — both `null` (no DC port) or both
  set. `acceptRate()` and the form's own validation assume this.
- Only touch a published figure when you have something better than a spec
  sheet to replace it with — a plausible session log, a manufacturer
  correction, etc. See "A live example" for what good evidence looks like and
  how much to trust one data point.

### A live example (BAW E7)

A user reported a completed public-charging session: 12.327 kWh, 3h 28m 04s,
station rated at 7 kW. That's a 3.55 kW sustained average — nowhere near the
station's rating, which told us the *car's* onboard charger was the real
limit, not the station. The catalogue's AC figure for the E7 was 3.3 kW; it's
now 3.6, splitting the difference between the manual's rounder number and the
session's more precise 3.55, since a single session is decent evidence but not
enough to fully discard the manufacturer figure. If more E7 sessions come in
and they cluster tightly, tighten the catalogue value to match; if they scatter,
that's real unit-to-unit or mains-voltage variation and the catalogue entry
should stay a rounder estimate rather than chase noise.

This is the intended workflow for improving the catalogue over time: real
session data beats spec sheets, but one session is a hint, not a fact.

## Testing

No formal test suite is checked in, but the engine functions were verified
with `jsdom` during development — render the page headlessly, drive the DOM
(`click`, `input` events), and assert on rendered text. `package.json` has
`jsdom` as a dev dependency for this. There's no fixed test file; write one at
`test.js` when you need to verify a change, run it with `node test.js`, and
feel free to delete it after — that's been the working pattern so far. Cover,
at minimum, whatever a change actually touches:

- `simulate()` against a known real-world figure (e.g. a Leaf 40 on 50kW DC
  should read ~38 min for 20→80%) whenever the taper curve or integration
  step changes
- the AC/DC mode still follows the charger socket, not a stale toggle
- a session survives being torn down and rebuilt mid-charge (simulates a
  reload) whenever you touch the session/storage code
- the delete confirmation actually blocks deletion until confirmed
- every field with a `<label for>` still has a matching `INFO` entry and a
  rendered `.info` button, if you add a new form field

## Deployment

See README.md — static hosting, any provider, HTTPS required for the service
worker and notifications. No environment variables, no secrets, no backend.
