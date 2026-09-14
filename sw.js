/* Charge.lk service worker.
   Two jobs: serve the app offline, and own the notifications so they
   still appear when the page itself is not in the foreground. */
const CACHE = "charge-lk-v1";
const ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first for the page so updates land, cache first for everything else.
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (req.mode === "navigate"){
    e.respondWith(fetch(req).catch(() => caches.match("./index.html")));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});

// Tapping the alert should bring the running session to the front,
// not open a second copy of the app.
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({type: "window", includeUncontrolled: true}).then(list => {
      for (const c of list) if ("focus" in c) return c.focus();
      return self.clients.openWindow("./index.html");
    })
  );
});

// If you later add a push server, this is where its message arrives.
self.addEventListener("push", e => {
  let d = {title: "Charge.lk", body: "Your charge is nearly done."};
  try { d = {...d, ...e.data.json()}; } catch (_) {}
  e.waitUntil(self.registration.showNotification(d.title, {
    body: d.body, icon: "./icon-192.png", badge: "./icon-192.png",
    tag: "charge-lk", renotify: true, requireInteraction: true
  }));
});
