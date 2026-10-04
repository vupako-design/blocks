const F = ['./', 'index.html', 'logic.js', 'manifest.json', 'icon-192.png', 'icon-512.png'];
addEventListener('install', (e) => { skipWaiting(); e.waitUntil(caches.open('v2').then((c) => c.addAll(F))); });
addEventListener('activate', (e) => e.waitUntil(clients.claim()));
addEventListener('fetch', (e) => e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open('v2').then((x) => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request))));
