// sw.js - Service Worker محسّن للأجهزة الضعيفة والشبكات البطيئة
// يستخدم استراتيجيات: stale-while-revalidate، network-first مع fallback، وتخزين مؤقت ذكي

const CACHE_NAME = 'togven-v3.0.0';
const OFFLINE_URL = '/offline.html';
const API_CACHE_NAME = 'togven-api-v2';

// الملفات الأساسية المطلوب تخزينها مسبقاً (فقط الملفات الحرجة)
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/offline.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/config.js',
  '/StorageService.js',
  '/ProductCard.js',
  '/ProductsGrid.js',
  '/CategoryManager.js',
  '/CartManager.js',
  '/ThemeManager.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://unpkg.com/dexie@3.2.4/dist/dexie.js'
];

// فترة صلاحية الـ API في الكاش (ساعة واحدة)
const API_CACHE_MAX_AGE = 60 * 60 * 1000;

// تثبيت الـ Service Worker وتخزين الملفات الأساسية
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// تفعيل الـ Service Worker وحذف الكاشات القديمة
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME && cache !== API_CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// === استراتيجيات الجلب ===

// 1. استراتيجية stale-while-revalidate للملفات الثابتة (HTML, CSS, JS)
//    تعرض من الكاش أولاً ثم تحدثه في الخلفية
async function staleWhileRevalidate(request) {
  const cachedResponse = await caches.match(request);
  const fetchPromise = fetch(request).then(networkResponse => {
    // تحديث الكاش بنسخة جديدة (إذا كانت الاستجابة صالحة)
    if (networkResponse && networkResponse.status === 200) {
      const responseClone = networkResponse.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, responseClone));
    }
    return networkResponse;
  }).catch(() => null);
  
  // إذا وجدنا نسخة مخزنة، نعيدها فوراً
  if (cachedResponse) {
    // نحدث الخلفية دون انتظار
    fetchPromise.catch(() => {});
    return cachedResponse;
  }
  // وإلا ننتظر نتيجة الجلب
  return fetchPromise;
}

// 2. استراتيجية network-first مع fallback إلى الكاش (لـ API)
async function networkFirstWithCacheFallback(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      // تخزين النسخة الجديدة مع إضافة رأس زمني (لصلاحية لاحقة)
      const responseClone = networkResponse.clone();
      const headers = new Headers(responseClone.headers);
      headers.set('sw-fetched-on', Date.now().toString());
      const modifiedResponse = new Response(responseClone.body, {
        status: responseClone.status,
        statusText: responseClone.statusText,
        headers: headers
      });
      const cache = await caches.open(API_CACHE_NAME);
      await cache.put(request, modifiedResponse);
      return networkResponse;
    }
    throw new Error('Network response not ok');
  } catch (err) {
    // فشل الشبكة - نبحث في الكاش
    const cached = await caches.match(request);
    if (cached) {
      // التحقق من صلاحية الكاش (اختياري)
      const fetchedOn = cached.headers.get('sw-fetched-on');
      if (fetchedOn && (Date.now() - parseInt(fetchedOn) < API_CACHE_MAX_AGE)) {
        return cached;
      }
      // حتى لو انتهت الصلاحية نعيد المخزن مؤقتاً مع تحديث في الخلفية لاحقاً
      return cached;
    }
    // لا كاش ولا شبكة
    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// 3. استراتيجية cache-first للصور (تحميل سريع ثم تحديث بالخلفية)
async function cacheFirstForImages(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
      return networkResponse;
    }
    throw new Error('Network failed');
  } catch (err) {
    // صورة placeholder محلية (يمكن استخدام صورة افتراضية)
    return new Response('', { status: 404 });
  }
}

// === معالج الجلب الرئيسي ===
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // طلبات API (script.google.com)
  if (url.href.includes('script.google.com') || url.href.includes('exec')) {
    event.respondWith(networkFirstWithCacheFallback(request));
    return;
  }

  // طلبات الصور
  if (request.destination === 'image') {
    event.respondWith(cacheFirstForImages(request));
    return;
  }

  // طلبات الخطوط (تحسين الأداء)
  if (request.destination === 'font') {
    event.respondWith(cacheFirstForImages(request));
    return;
  }

  // طلبات HTML (التنقل بين الصفحات) – stale-while-revalidate مع fallback إلى offline.html
  if (request.mode === 'navigate') {
    event.respondWith(
      staleWhileRevalidate(request).catch(async () => {
        const offlinePage = await caches.match(OFFLINE_URL);
        return offlinePage || new Response('غير متصل', { status: 503 });
      })
    );
    return;
  }

  // باقي الطلبات (JS, CSS, إلخ) – stale-while-revalidate
  event.respondWith(staleWhileRevalidate(request));
});

// استقبال رسائل من الصفحة الرئيسية (مثل مسح الكاش)
self.addEventListener('message', event => {
  if (event.data?.action === 'clearCache') {
    Promise.all([caches.delete(CACHE_NAME), caches.delete(API_CACHE_NAME)]).then(() => {
      console.log('[SW] Caches cleared');
      if (event.ports[0]) event.ports[0].postMessage({ success: true });
    });
  }
});
