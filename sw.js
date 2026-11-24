/* 浩海 study PWA Service Worker
   策略：
   - 页面导航：先走网络，拿到新的 index.html；断网时回退 offline.html
   - 静态资源：缓存优先，后台更新
   - API / 管理后台 / APK 下载：不缓存，直接走网络
*/
const CACHE = 'haohai-shell-v9';

const CORE = [
    '/',
    '/index.html',
    '/assets/p0.css',
    '/assets/p0.js',
    '/assets/hh-plus.css',
    '/assets/hh-plus.js',
    '/assets/hh-mobile.css',
    '/assets/hh-mobile.js',
    '/assets/hh-polish.css',
    '/assets/hh-polish.js',
    '/assets/mascot-cloud-body.png',
    '/assets/stellar.css',
    '/favicon.svg',
    '/icon-192.png',
    '/icon-512.png',
    '/manifest.json',
    '/offline.html'
];

self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE).then(function (cache) {
            return cache.addAll(CORE);
        }).then(function () {
            return self.skipWaiting();
        })
    );
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(keys.filter(function (k) {
                return k !== CACHE;
            }).map(function (k) {
                return caches.delete(k);
            }));
        }).then(function () {
            return self.clients.claim();
        })
    );
});

function isBypassed(url) {
    if (url.origin !== self.location.origin) return true;
    if (url.pathname.indexOf('/api/') === 0) return true;
    if (url.pathname === '/news') return true;
    if (url.pathname === '/sw.js') return true;
    // 缓存自愈模块必须永远走网络，否则它自己被旧缓存卡住就失去自愈能力
    if (url.pathname.indexOf('/assets/hh-cache.js') === 0) return true;
    if (url.pathname === '/admin.html') return true;
    if (url.pathname.indexOf('/download/') === 0) return true;
    return false;
}

self.addEventListener('fetch', function (event) {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (isBypassed(url)) return;

    // 页面导航：网络优先
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).then(function (response) {
                const copy = response.clone();
                caches.open(CACHE).then(function (cache) {
                    cache.put('/index.html', copy);
                });
                return response;
            }).catch(function () {
                return caches.match('/offline.html').then(function (offline) {
                    return offline || caches.match('/index.html');
                });
            })
        );
        return;
    }

    // 静态资源：缓存优先
    event.respondWith(
        caches.match(request).then(function (cached) {
            if (cached) return cached;
            return fetch(request).then(function (response) {
                if (response && response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE).then(function (cache) {
                        cache.put(request, copy);
                    });
                }
                return response;
            }).catch(function () {
                return caches.match('/offline.html');
            });
        })
    );
});


