// sw.js - مدير الشبكة والتخزين المؤقت لمتجر حلب للتوصيل
const CACHE_NAME = 'aleppo-delivery-v1.0.3'; // تم رفع الإصدار لفرض التحديث
const OFFLINE_URL = './offline.html';

// الملفات الأساسية الحرجة للإقلاع فقط (بدون الـ API)
const PRECACHE_URLS = [
    './',
    './index.html',
    './offline.html',
    './style.css',
    './app.js',
    './manifest.json',
    './config.js',
    './StorageService.js',
    './ProductCard.js',
    './ProductsGrid.js',
    './CategoryManager.js',
    './CartManager.js',
    './ThemeManager.js'
];

// 1. مرحلة التثبيت: تخزين ملفات الواجهة الأساسية
self.addEventListener('install', event => {
    self.skipWaiting(); // إجبار المتصفح على تفعيل النسخة الجديدة فوراً
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('[SW] Pre-caching core assets');
            return cache.addAll(PRECACHE_URLS);
        })
    );
});

// 2. مرحلة التفعيل: تنظيف الكاش القديم
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// 3. مرحلة الاعتراض (Fetch): توجيه ذكي للطلبات
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // 🚨 التخطي الهندسي: تجاهل طلبات Google API تماماً وتركها لـ StorageService.js
    if (url.href.includes('script.google.com') || url.href.includes('script.googleusercontent.com')) {
        return; // خروج مبكر، المتصفح سيتعامل مع الطلب مباشرة
    }

    // استراتيجية Cache First, Fallback to Network لباقي الملفات والصور
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) {
                return cachedResponse;
            }

            return fetch(event.request).catch(() => {
                // في حال انقطاع الشبكة وطلب المستخدم لصفحة تنقل، نعرض صفحة الأوفلاين
                if (event.request.mode === 'navigate') {
                    return caches.match(OFFLINE_URL);
                }
            });
        })
    );
});

// 4. استقبال أوامر التنظيف من التطبيق
self.addEventListener('message', event => {
    if (event.data === 'CLEAR_CACHE') {
        caches.keys().then(names => {
            for (let name of names) caches.delete(name);
        });
    }
});
