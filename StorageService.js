// StorageService.js
import { CONFIG } from './config.js';

export class StorageService {
    constructor() {
        this.db = null;
        this.useFallback = false;
        this.ready = false;
        this.lastTimestamp = null;
        this.initPromise = this._initInternal();
        
        // تتبع عناوين URL لتحريرها لاحقاً
        this.activeObjectURLs = new Set();
        
        // حد أقصى لعدد الصور المخزنة (تقريبي)
        this.maxImageCacheCount = 200;
    }

    async init() {
        return this.initPromise;
    }

    async _initInternal(retries = 2) {
        try {
            if (!window.Dexie) {
                throw new Error('Dexie library not loaded');
            }
            this.db = new Dexie(CONFIG.DB_NAME);
            this.db.version(CONFIG.DB_VERSION).stores({
                [CONFIG.STORES.IMAGES]: 'url, lastUsed',
                [CONFIG.STORES.API_CACHE]: 'key'
            });
            await this.db.open();
            console.log('[Storage] IndexedDB ready');
            this.useFallback = false;
            
            // تنظيف الصور القديمة في الخلفية
            this._cleanOldImages().catch(e => console.warn('[Storage] Cleanup error', e));
        } catch (err) {
            console.warn('[Storage] IndexedDB failed, using localStorage fallback', err);
            if (retries > 0) {
                // محاولة إعادة فتح بعد تأخير
                await new Promise(r => setTimeout(r, 500));
                return this._initInternal(retries - 1);
            }
            this.useFallback = true;
        }
        this.ready = true;
    }

    async waitForReady() {
        if (this.ready) return;
        return this.initPromise;
    }

    // ========== إدارة الصور مع LRU تقريبي ==========
    async getImageBlob(url, maxAge = 7 * 24 * 60 * 60 * 1000) { // أسبوع واحد
        await this.waitForReady();
        if (!url) return null;

        if (this.useFallback) {
            return this._getImageFromLocalStorage(url);
        }

        try {
            const record = await this.db.images.get(url);
            if (record && record.blob) {
                // تحديث وقت آخر استخدام (LRU)
                await this.db.images.update(url, { lastUsed: Date.now() });
                // التحقق من صلاحية العمر
                if (record.timestamp && (Date.now() - record.timestamp) > maxAge) {
                    // تجاوز الصلاحية - حذف وإرجاع null
                    await this.db.images.delete(url);
                    return null;
                }
                return record.blob;
            }
            return null;
        } catch (e) {
            console.warn('[Storage] getImageBlob error', e);
            return null;
        }
    }

    async saveImageBlob(url, blob) {
        await this.waitForReady();
        if (!url || !blob) return;

        if (this.useFallback) {
            this._saveImageToLocalStorage(url, blob);
            return;
        }

        try {
            // أولاً: التحقق من عدد الصور المخزنة
            const count = await this.db.images.count();
            if (count >= this.maxImageCacheCount) {
                await this._evictOldestImages(Math.floor(count * 0.2)); // حذف 20% الأقدم
            }
            
            await this.db.images.put({
                url: url,
                blob: blob,
                timestamp: Date.now(),
                lastUsed: Date.now()
            });
        } catch (e) {
            if (e.name === 'QuotaExceededError') {
                // مساحة غير كافية – نحذف أقدم الصور ونحاول مرة واحدة
                await this._evictOldestImages(Math.floor(this.maxImageCacheCount * 0.5));
                try {
                    await this.db.images.put({ url, blob, timestamp: Date.now(), lastUsed: Date.now() });
                } catch (e2) {
                    console.warn('[Storage] Still cannot save image', e2);
                }
            } else {
                console.warn('[Storage] saveImageBlob failed', e);
            }
        }
    }
    
    async _evictOldestImages(howMany) {
        if (howMany <= 0) return;
        try {
            const oldest = await this.db.images.orderBy('lastUsed').limit(howMany).toArray();
            const urls = oldest.map(r => r.url);
            await this.db.images.bulkDelete(urls);
            console.log(`[Storage] Evicted ${urls.length} old images`);
        } catch (e) {
            console.warn('[Storage] Eviction failed', e);
        }
    }
    
    async _cleanOldImages(maxAge = 30 * 24 * 60 * 60 * 1000) { // 30 يوم
        try {
            const cutoff = Date.now() - maxAge;
            await this.db.images.where('timestamp').below(cutoff).delete();
        } catch (e) {}
    }
    
    async _getImageFromLocalStorage(url) {
        return new Promise((resolve) => {
            const data = localStorage.getItem(`img_${url}`);
            if (data && data.startsWith('data:image')) {
                fetch(data)
                    .then(res => res.blob())
                    .then(blob => resolve(blob))
                    .catch(() => resolve(null));
            } else {
                resolve(null);
            }
        });
    }
    
    _saveImageToLocalStorage(url, blob) {
        const reader = new FileReader();
        reader.onloadend = () => {
            try {
                localStorage.setItem(`img_${url}`, reader.result);
                // الحد من حجم localStorage بحذف أقدم الصور إذا تجاوز 4.5 ميجابايت
                this._trimLocalStorageImages();
            } catch (e) {
                if (e.name === 'QuotaExceededError') {
                    this._clearOldLocalStorageImages();
                    try {
                        localStorage.setItem(`img_${url}`, reader.result);
                    } catch (e2) {}
                }
            }
        };
        reader.readAsDataURL(blob);
    }
    
    _trimLocalStorageImages() {
        let total = 0;
        const items = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('img_')) {
                const val = localStorage.getItem(key);
                total += val ? val.length : 0;
                items.push({ key, size: val ? val.length : 0 });
            }
        }
        if (total > 4.5 * 1024 * 1024) { // أكثر من 4.5 ميجا
            items.sort((a, b) => a.size - b.size);
            let removed = 0;
            for (let item of items) {
                localStorage.removeItem(item.key);
                removed++;
                total -= item.size;
                if (total < 3 * 1024 * 1024) break;
            }
            console.log(`[Storage] Removed ${removed} images from localStorage`);
        }
    }
    
    _clearOldLocalStorageImages() {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('img_')) keys.push(key);
        }
        // نحذف نصفها
        const toDelete = keys.slice(0, Math.floor(keys.length / 2));
        toDelete.forEach(k => localStorage.removeItem(k));
    }

    // ========== إدارة كاش API ==========
    async getApiCache() {
        await this.waitForReady();

        if (this.useFallback) {
            const cached = localStorage.getItem('apiCache');
            if (cached) {
                const { timestamp, data } = JSON.parse(cached);
                if (Date.now() - timestamp < CONFIG.CACHE_TTL) {
                    this.lastTimestamp = timestamp;
                    return data;
                }
            }
            return null;
        }

        try {
            const record = await this.db.apiCache.get('mainData');
            if (record && (Date.now() - record.timestamp < CONFIG.CACHE_TTL)) {
                this.lastTimestamp = record.timestamp;
                return record.data;
            }
            return null;
        } catch (e) {
            return null;
        }
    }

    async saveApiCache(data) {
        await this.waitForReady();
        const timestamp = Date.now();
        this.lastTimestamp = timestamp;

        if (this.useFallback) {
            localStorage.setItem('apiCache', JSON.stringify({ timestamp, data }));
            return;
        }

        try {
            await this.db.apiCache.put({
                key: 'mainData',
                timestamp,
                data: data
            });
        } catch (e) {
            console.warn('[Storage] saveApiCache failed', e);
        }
    }

    async clearAllCache() {
        await this.waitForReady();

        if (this.useFallback) {
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith('img_') || key === 'apiCache') {
                    localStorage.removeItem(key);
                }
            });
            return;
        }

        try {
            await this.db.images.clear();
            await this.db.apiCache.clear();
            console.log('[Storage] All cache cleared');
        } catch (e) {
            console.warn('[Storage] clearAllCache failed', e);
        }
    }
    
    // إصدار عناوين objectURL المخزنة (للاستخدام من قبل المكونات)
    revokeObjectURL(url) {
        if (this.activeObjectURLs.has(url)) {
            URL.revokeObjectURL(url);
            this.activeObjectURLs.delete(url);
        }
    }
    
    registerObjectURL(url) {
        this.activeObjectURLs.add(url);
        // تنظيف تلقائي بعد دقيقة (لن يتم استخدامها بعدها)
        setTimeout(() => this.revokeObjectURL(url), 60000);
    }

    saveCart(cartMap) {
        try {
            localStorage.setItem(CONFIG.STORAGE_KEYS.CART, JSON.stringify(cartMap));
        } catch (e) {}
    }

    loadCart() {
        try {
            const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.CART);
            return saved ? JSON.parse(saved) : {};
        } catch (e) {
            return {};
        }
    }

    getLastUpdateTimestamp() {
        if (this.lastTimestamp) return this.lastTimestamp;
        if (this.useFallback) {
            const cached = localStorage.getItem('apiCache');
            if (cached) {
                const { timestamp } = JSON.parse(cached);
                this.lastTimestamp = timestamp;
                return timestamp;
            }
        }
        return null;
    }
}
