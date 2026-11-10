// Surat Saman service worker: offline app shell. AI requests are never cached.
const CACHE = 'surat-saman-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icons/icon-192.png', './icons/icon-512.png',
  './samples/saman-pdrm.jpg', './samples/lhdn-notis.jpg', './samples/tnb-bil.jpg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // Firebase/Gemini calls go straight to network
  if (req.mode === 'navigate') {
    // Network first for the page, fall back to cached shell when offline
    e.respondWith(fetch(req).then((res) => {
      caches.open(CACHE).then((c) => c.put('./index.html', res.clone()));
      return res;
    }).catch(() => caches.match('./index.html')));
    return;
  }
  // Cache first for static assets (Vite hashes filenames, so this is safe)
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  })));
});
