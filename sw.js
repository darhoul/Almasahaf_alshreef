const CACHE_NAME = 'quran-pwa-v1.0.0';
const DYNAMIC_CACHE = 'quran-dynamic-v1';
const API_CACHE = 'quran-api-v1';
const IMAGE_CACHE = 'quran-images-v1';

const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './main.js',
    './manifest.json',
    './offline.html',
    './icons/icon-72.png',
    './icons/icon-96.png',
    './icons/icon-128.png',
    './icons/icon-144.png',
    './icons/icon-152.png',
    './icons/icon-192.png',
    './icons/icon-384.png',
    './icons/icon-512.png',
    './quran_data.json',
    'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap',
    'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css',
    'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js'
];

// Install Event
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('📦 Caching app shell...');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => {
                console.log('✅ PWA installed successfully');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('❌ Installation failed:', error);
            })
    );
});

// Activate Event
self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME && 
                            cacheName !== DYNAMIC_CACHE && 
                            cacheName !== API_CACHE && 
                            cacheName !== IMAGE_CACHE) {
                            console.log('🗑️ Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            }),
            self.clients.claim(),
            self.registration.showNotification('المصحف الشريف', {
                body: 'التطبيق جاهز للعمل بدون إنترنت ✓',
                icon: './icons/icon-192.png',
                badge: './icons/icon-72.png',
                vibrate: [100, 50, 100],
                dir: 'rtl',
                lang: 'ar',
                silent: false
            })
        ])
    );
});

// Fetch Event - Advanced Strategy
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // Skip non-GET requests
    if (event.request.method !== 'GET') return;
    
    // API requests strategy (Cache with Network Update)
    if (url.pathname.includes('/quran_data.json') || url.pathname.includes('/api/')) {
        event.respondWith(apiStrategy(event.request));
        return;
    }
    
    // Images strategy (Cache First with Background Refresh)
    if (url.pathname.includes('/images/')) {
        event.respondWith(imageStrategy(event.request));
        return;
    }
    
    // Audio strategy (Network First with Cache Fallback)
    if (url.pathname.includes('/audio/') || url.hostname.includes('mp3quran.net')) {
        event.respondWith(audioStrategy(event.request));
        return;
    }
    
    // Main strategy (Cache First with Network Fallback)
    event.respondWith(mainStrategy(event.request));
});

// Cache First with Network Fallback
async function mainStrategy(request) {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
        // Update cache in background
        event.waitUntil(
            fetch(request).then((response) => {
                if (response.ok) {
                    cache.put(request, response.clone());
                }
            })
        );
        return cachedResponse;
    }
    
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        // Return offline page for HTML requests
        if (request.headers.get('accept').includes('text/html')) {
            return caches.match('./offline.html');
        }
        return new Response('محتوى غير متاح', { status: 404 });
    }
}

// API Strategy - Network First with Cache
async function apiStrategy(request) {
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const cache = await caches.open(API_CACHE);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        return new Response(JSON.stringify({ 
            error: 'offline', 
            message: 'لا يوجد اتصال بالإنترنت' 
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// Image Strategy - Cache First with Background Refresh
async function imageStrategy(request) {
    const cache = await caches.open(IMAGE_CACHE);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
        // Refresh cache in background
        fetch(request).then((response) => {
            if (response.ok) {
                cache.put(request, response.clone());
            }
        }).catch(() => {});
        return cachedResponse;
    }
    
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        return new Response(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600"><rect width="400" height="600" fill="#fdf6e3"/><text x="200" y="300" text-anchor="middle" font-family="Amiri" font-size="24" fill="#c9a050">الصفحة غير متاحة بدون إنترنت</text></svg>',
            { headers: { 'Content-Type': 'image/svg+xml' } }
        );
    }
}

// Audio Strategy - Network First with Cache
async function audioStrategy(request) {
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        return new Response('', { 
            status: 404,
            statusText: 'Audio offline' 
        });
    }
}

// Background Sync
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-bookmarks') {
        event.waitUntil(syncBookmarks());
    }
});

async function syncBookmarks() {
    try {
        const cache = await caches.open(CACHE_NAME);
        const bookmarks = await cache.match('/api/bookmarks');
        if (bookmarks) {
            console.log('📤 Syncing bookmarks...');
            // Add your sync logic here
        }
    } catch (error) {
        console.error('Sync failed:', error);
    }
}

// Push Notifications
self.addEventListener('push', (event) => {
    const data = event.data.json();
    
    const options = {
        body: data.body || 'تحديث جديد في تطبيق المصحف الشريف',
        icon: './icons/icon-192.png',
        badge: './icons/icon-72.png',
        vibrate: [200, 100, 200],
        data: {
            url: data.url || './'
        },
        actions: [
            {
                action: 'open',
                title: 'فتح التطبيق'
            },
            {
                action: 'close',
                title: 'إغلاق'
            }
        ],
        dir: 'rtl',
        lang: 'ar',
        tag: 'quran-update',
        renotify: true
    };
    
    event.waitUntil(
        self.registration.showNotification(
            data.title || 'المصحف الشريف',
            options
        )
    );
});

// Notification Click
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    if (event.action === 'close') {
        return;
    }
    
    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then((clientList) => {
            if (clientList.length > 0) {
                const client = clientList[0];
                client.focus();
                if (event.notification.data.url) {
                    client.navigate(event.notification.data.url);
                }
            } else {
                clients.openWindow(event.notification.data.url || './');
            }
        })
    );
});

// Periodic Sync (Every 24 hours)
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'update-quran-data') {
        event.waitUntil(updateQuranData());
    }
});

async function updateQuranData() {
    try {
        const cache = await caches.open(CACHE_NAME);
        const response = await fetch('./quran_data.json');
        if (response.ok) {
            cache.put('./quran_data.json', response.clone());
            console.log('🔄 Quran data updated successfully');
        }
    } catch (error) {
        console.error('Failed to update Quran data:', error);
    }
}

// Message Event
self.addEventListener('message', (event) => {
    if (event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data.type === 'GET_VERSION') {
        event.ports[0].postMessage(CACHE_NAME);
    }
    
    if (event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.delete(DYNAMIC_CACHE)
                .then(() => caches.delete(IMAGE_CACHE))
                .then(() => caches.delete(API_CACHE))
                .then(() => {
                    event.ports[0].postMessage({ success: true });
                })
        );
    }
});