const F = ['./', 'index.html', 'logic.js', 'manifest.json', 'icon-192.png', 'icon-512.png'];
addEventListener('install', (e) => e.waitUntil(caches.open('v1').then((c) => c.addAll(F))));
addEventListener('fetch', (e) => e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request))));
