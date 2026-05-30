// sw.js - نسخة هندسية مطهرة ومقاومة لظروف انقطاع الشبكة والاتصالات البطيئة
const CACHE_NAME = 'aleppo-delivery-v1.0.0';
const OFFLINE_URL = './offline.html';

// الملفات الاستراتيجية والحرجة التي يتوجب حزمها مسبقاً لضمان العمل التام Offline
const PRECACHE_URLS = [
  './',
  './index.html',
  './offline.html',
  './style.css',
  './config.js',
  './StorageService.js',
  './ThemeManager.js',
  './ProductCard.js',
  './ProductsGrid.js',
  './CategoryManager.js',
  './CartManager.js',
  './app.js',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://unpkg.com/dexie@3.2.4/dist/dexie.js'
];

// تثبيت الـ Service Worker وحقن الملفات الأساسية في الكاش
self.addEventListener('install', event => {
  console.log('[SW] Installing structural assets...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // استخدام addAll بشكل صارم لضمان تخزين الأصول الأساسية
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => self.skipWaiting())
  );
});

// تفعيل وتطهير الكاشات القديمة لعدم تعليق المتصفحات
self.addEventListener('activate', event => {
  console.log('[SW] Activating and cleansing old structures...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('[SW] Deleting deprecated cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// ميكانيكية استراتيجية الاستجابة المحدثة (Stale-While-Revalidate) مع معالجة حماية الفشل
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  const fetchPromise = fetch(request).then(async networkResponse => {
    // التأكد من جودة الاستجابة وسلامتها قبل تخزينها لمنع كاش الملفات التالفة
    if (networkResponse && networkResponse.status === 200) {
      await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch(err => {
    console.warn('[SW] Fetch failed in revalidation, using cache fallback for:', request.url, err);
  });

  return cachedResponse || fetchPromise;
}

// معالجة طلبات التصفح والانتقال (Navigation Requests)
async function handleNavigation(event) {
  try {
    return await staleWhileRevalidate(event.request);
  } catch (error) {
    console.error('[SW] Navigation failed, routing to official offline screen', error);
    const cache = await caches.open(CACHE_NAME);
    const offlinePage = await cache.match(OFFLINE_URL);
    return offlinePage || new Response('خطأ في الاتصال بالشبكة', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

// معالج الجلب والاعتراض المركزي للملفات والأصول والخطوط
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // استبعاد خطوط إمداد بيانات الـ API من نطاق كاش الـ SW لأنها تدار مباشرة عبر طبقة StorageService (IndexedDB)
  if (url.href.includes('script.google.com') || url.href.includes('exec')) {
    return;
  }

  // فرز طلبات الصور والخطوط وتطبيق التخزين السريع الآمن لها
  if (request.destination === 'image' || request.destination === 'font') {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // استراتيجية طلبات التنقل الكلية للموقع لتوجيهها لصفحة الـ Offline عند الفشل الكامل
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(event));
    return;
  }

  // باقي الملفات البرمجية والأنماط (JS, CSS)
  event.respondWith(staleWhileRevalidate(request));
});

// استقبال الرسائل والأوامر الإدارية المباشرة من التطبيق
self.addEventListener('message', event => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});
