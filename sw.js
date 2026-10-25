/* Révision DEMS — service worker : le site marche hors ligne une fois ouvert.
   Interface et données : préchargées à l'installation (cache versionné, remplacé à chaque mise en ligne).
   Pages manuscrites et PDF : gardés au fur et à mesure qu'on les ouvre, ou tous d'un coup sur demande (Réglages). */
var VERSION = 'e682c1fce0';
var CORE = 'dems-site-' + VERSION;
var MEDIA = 'dems-media-8ef191911a';
var CORE_FILES = ["index.html", "manifest.webmanifest", "fichiers/app.css", "fichiers/app.js", "fichiers/donnees.js", "fichiers/polices/atkinson-hyperlegible-next-latin-400-italic.woff2", "fichiers/polices/atkinson-hyperlegible-next-latin-400-normal.woff2", "fichiers/polices/atkinson-hyperlegible-next-latin-500-normal.woff2", "fichiers/polices/atkinson-hyperlegible-next-latin-600-normal.woff2", "fichiers/polices/atkinson-hyperlegible-next-latin-700-normal.woff2", "fichiers/polices/atkinson-hyperlegible-next-latin-800-normal.woff2", "fichiers/polices/atkinson-hyperlegible-next-latin-ext-400-italic.woff2", "fichiers/polices/atkinson-hyperlegible-next-latin-ext-400-normal.woff2", "fichiers/polices/atkinson-hyperlegible-next-latin-ext-500-normal.woff2", "fichiers/polices/atkinson-hyperlegible-next-latin-ext-600-normal.woff2", "fichiers/polices/atkinson-hyperlegible-next-latin-ext-700-normal.woff2", "fichiers/polices/atkinson-hyperlegible-next-latin-ext-800-normal.woff2", "fichiers/polices/inter-greek-400-normal.woff2", "fichiers/polices/inter-greek-500-normal.woff2", "fichiers/polices/inter-greek-600-normal.woff2", "fichiers/polices/inter-greek-700-normal.woff2", "fichiers/polices/inter-greek-800-normal.woff2", "fichiers/polices/inter-latin-400-normal.woff2", "fichiers/polices/inter-latin-500-normal.woff2", "fichiers/polices/inter-latin-600-normal.woff2", "fichiers/polices/inter-latin-700-normal.woff2", "fichiers/polices/inter-latin-800-normal.woff2", "fichiers/polices/inter-latin-ext-400-normal.woff2", "fichiers/polices/inter-latin-ext-500-normal.woff2", "fichiers/polices/inter-latin-ext-600-normal.woff2", "fichiers/polices/inter-latin-ext-700-normal.woff2", "fichiers/polices/inter-latin-ext-800-normal.woff2", "fichiers/polices/spectral-latin-400-italic.woff2", "fichiers/polices/spectral-latin-400-normal.woff2", "fichiers/polices/spectral-latin-600-italic.woff2", "fichiers/polices/spectral-latin-600-normal.woff2", "fichiers/polices/spectral-latin-ext-400-italic.woff2", "fichiers/polices/spectral-latin-ext-400-normal.woff2", "fichiers/polices/spectral-latin-ext-600-italic.woff2", "fichiers/polices/spectral-latin-ext-600-normal.woff2", "fichiers/figs/ADDITIF_a_p015_1.jpg", "fichiers/figs/ADDITIF_a_p016_1.jpg", "fichiers/figs/ADDITIF_a_p017_1.jpg", "fichiers/figs/ADDITIF_b_p041_1.jpg", "fichiers/figs/BASES_NB_p003_1.jpg", "fichiers/figs/BASES_NB_p007_1.jpg", "fichiers/figs/BASES_NB_p017_1.jpg", "fichiers/figs/CDT_b_p046_1.jpg", "fichiers/figs/COEUR_c_p060_1.jpg", "fichiers/figs/COEUR_d_p070_1.jpg", "fichiers/figs/LYMPH_INF_p005_1.jpg", "fichiers/figs/PTH_RIA_p002_1.jpg", "fichiers/figs/PTH_RIA_p002_2.jpg", "fichiers/figs/PTH_RIA_p004_1.jpg", "fichiers/figs/TEP_p002_1.jpg", "fichiers/figs/TNE_b_p028_1.jpg", "fichiers/icones/apple-touch-icon.png", "fichiers/icones/icone-192.png", "fichiers/icones/icone-512.png", "fichiers/icones/icone-masque-512.png"];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CORE).then(function (c) {
    return c.addAll(CORE_FILES.map(function (u) { return new Request(u, { cache: 'reload' }); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('dems-') === 0 && k !== CORE && k !== MEDIA; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function isMedia(path) { return path.indexOf('/fichiers/scans/') >= 0 || path.indexOf('/fichiers/pdf/') >= 0; }

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;
  var path = url.pathname;
  // la page elle-même (y compris avec un #/… ou un ?…) : version en cache, sinon réseau
  if (req.mode === 'navigate' && (path === '/' || path === '/index.html')) {
    e.respondWith(caches.match('index.html', { cacheName: CORE }).then(function (r) { return r || fetch(req); }).catch(function () { return fetch(req); }));
    return;
  }
  if (isMedia(path)) {
    e.respondWith(caches.open(MEDIA).then(function (c) {
      return c.match(req, { ignoreSearch: true }).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (r) { if (r.ok && r.status === 200 && !req.headers.get('range')) c.put(req, r.clone()); return r; });
      });
    }));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true, cacheName: CORE }).then(function (hit) {
    return hit || fetch(req).catch(function () { return caches.match(req, { ignoreSearch: true }); });
  }));
});

// téléchargement groupé (pages manuscrites pour le hors-ligne), avec avancement envoyé à la page
self.addEventListener('message', function (e) {
  var d = e.data || {}, src = e.source;
  if (d.type === 'version') { if (src) src.postMessage({ type: 'version', version: VERSION }); return; }
  if (d.type !== 'cache-media' || !Array.isArray(d.urls)) return;
  e.waitUntil(caches.open(MEDIA).then(function (c) {
    var i = 0, done = 0, fail = 0, n = d.urls.length;
    function post(fin) { if (src) src.postMessage({ type: 'cache-media', done: done, fail: fail, total: n, fin: !!fin }); }
    function worker() {
      if (i >= n) return Promise.resolve();
      var u = d.urls[i++];
      return c.match(u).then(function (hit) {
        if (hit) return;
        return fetch(u).then(function (r) { if (r.ok) return c.put(u, r); throw 0; });
      }).then(function () { done++; }, function () { fail++; }).then(function () { if ((done + fail) % 10 === 0) post(); return worker(); });
    }
    return Promise.all([worker(), worker(), worker(), worker()]).then(function () { post(true); });
  }));
});
