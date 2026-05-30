// StorageService.js
import { CONFIG } from './config.js';

export class StorageService {
    constructor() {
        this.db = null;
        this.useFallback = false;
        this.ready = false;
        this.lastTimestamp = null;
        this.initPromise = this._initInternal();
        
        // تتبع عناوين URL لتحريرها عند تدمير المكونات وليس بوقت عشوائي
        this.activeObjectURLs = new Set();
        
        // حد أقصى لعدد الصور المخزنة (تقريبي)
        this.maxImageCacheCount = 200;
    }

    async init() {
        return this.initPromise;
    }

    async _initInternal(retries = 2) {
        try {
            // التحقق من وجود مكتبة Dexie في النطاق العالمي أو كموديول
            const DexieInstance = window.Dexie;
            if (!DexieInstance) {
                throw new Error('Dexie library not loaded in window scope');
            }
            
            this.db = new DexieInstance(CONFIG.DB_NAME);
            this.db.version(CONFIG.DB_VERSION).stores({
                [CONFIG.STORES.IMAGES]: 'url, lastUsed',
                [CONFIG.STORES.API_CACHE]: 'key'
            });
            await this.db.open();
            console.log('[Storage] IndexedDB ready via Dexie');
            this.useFallback = false;
            
            // تنظيف الصور القديمة في الخلفية
            this._cleanOldImages().catch(e => console.warn('[Storage] Cleanup error', e));
        } catch (err) {
            console.warn('[Storage] IndexedDB failed, using localStorage fallback', err);
            if (retries > 0) {
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

    // ========== إدارة الصور مع LRU ومطابقة الصلاحية ==========
    async getImageBlob(url, maxAge = 7 * 24 * 60 * 60 * 1000) { // أسبوع واحد
        await this.waitForReady();
        if (!url) return null;

        if (this.useFallback) {
            return this._getImageFromLocalStorage(url);
        }

        try {
            const record = await this.db[CONFIG.STORES.IMAGES].get(url);
            if (record && record.blob) {
                // تحديث وقت آخر استخدام لآلية LRU
                await this.db[CONFIG.STORES.IMAGES].update(url, { lastUsed: Date.now() });
                
                // التحقق من صلاحية العمر
                if (record.timestamp && (Date.now() - record.timestamp) > maxAge) {
                    await this.db[CONFIG.STORES.IMAGES].delete(url);
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
            const count = await this.db[CONFIG.STORES.IMAGES].count();
            if (count >= this.maxImageCacheCount) {
                await this._evictOldestImages(Math.floor(count * 0.2)); // حذف 20% الأقدم
            }
            
            await this.db[CONFIG.STORES.IMAGES].put({
                url: url,
                blob: blob,
                timestamp: Date.now(),
                lastUsed: Date.now()
            });
        } catch (e) {
            if (e.name === 'QuotaExceededError') {
                await this._evictOldestImages(Math.floor(this.maxImageCacheCount * 0.5));
                try {
                    await this.db[CONFIG.STORES.IMAGES].put({ url, blob, timestamp: Date.now(), lastUsed: Date.now() });
                } catch (e2) {
                    console.warn('[Storage] Critical QuotaExceededError on IndexedDB', e2);
                }
            } else {
                console.warn('[Storage] saveImageBlob failed', e);
            }
        }
    }
    
    async _evictOldestImages(howMany) {
        if (howMany <= 0) return;
        try {
            const oldest = await this.db[CONFIG.STORES.IMAGES].orderBy('lastUsed').limit(howMany).toArray();
            const urls = oldest.map(r => r.url);
            await this.db[CONFIG.STORES.IMAGES].bulkDelete(urls);
            console.log(`[Storage] Evicted ${urls.length} old images from IndexedDB`);
        } catch (e) {
            console.warn('[Storage] Eviction failed', e);
        }
    }
    
    async _cleanOldImages(maxAge = 30 * 24 * 60 * 60 * 1000) { // 30 يوم
        try {
            const cutoff = Date.now() - maxAge;
            await this.db[CONFIG.STORES.IMAGES].where('timestamp').below(cutoff).delete();
        } catch (e) {
            console.warn('[Storage] Background cleanup failed', e);
        }
    }
    
    async _getImageFromLocalStorage(url) {
        return new Promise((resolve) => {
            try {
                const data = localStorage.getItem(`img_${url}`);
                if (data && data.startsWith('data:image')) {
                    fetch(data)
                        .then(res => res.blob())
                        .then(blob => resolve(blob))
                        .catch(() => resolve(null));
                } else {
                    resolve(null);
                }
            } catch (e) {
                resolve(null);
            }
        });
    }
    
    _saveImageToLocalStorage(url, blob) {
        const reader = new FileReader();
        reader.onloadend = () => {
            try {
                localStorage.setItem(`img_${url}`, reader.result);
                this._trimLocalStorageImages();
            } catch (e) {
                if (e.name === 'QuotaExceededError') {
                    this._clearOldLocalStorageImages();
                    try {
                        localStorage.setItem(`img_${url}`, reader.result);
                    } catch (e2) {
                        console.warn('[Storage] LocalStorage fallback completely full');
                    }
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
        if (total > 4.5 * 1024 * 1024) { 
            items.sort((a, b) => a.size - b.size);
            let removed = 0;
            for (let item of items) {
                localStorage.removeItem(item.key);
                removed++;
                total -= item.size;
                if (total < 3 * 1024 * 1024) break;
            }
            console.log(`[Storage] Trimmed ${removed} images from localStorage`);
        }
    }
    
    _clearOldLocalStorageImages() {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('img_')) keys.push(key);
        }
        const toDelete = keys.slice(0, Math.floor(keys.length / 2));
        toDelete.forEach(k => localStorage.removeItem(k));
    }

    // ========== إدارة كاش واجهة الـ API ==========
    async getApiCache() {
        await this.waitForReady();

        if (this.useFallback) {
            const cached = localStorage.getItem('apiCache');
            if (cached) {
                try {
                    const { timestamp, data } = JSON.parse(cached);
                    if (Date.now() - timestamp < CONFIG.CACHE_TTL) {
                        this.lastTimestamp = timestamp;
                        return data;
                    }
                } catch (e) {
                    return null;
                }
            }
            return null;
        }

        try {
            const record = await this.db[CONFIG.STORES.API_CACHE].get('mainData');
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
            try {
                localStorage.setItem('apiCache', JSON.stringify({ timestamp, data }));
            } catch (e) {
                console.warn('[Storage] LocalStorage full, cannot save API cache', e);
            }
            return;
        }

        try {
            await this.db[CONFIG.STORES.API_CACHE].put({
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
            await this.db[CONFIG.STORES.IMAGES].clear();
            await this.db[CONFIG.STORES.API_CACHE].clear();
            console.log('[Storage] IndexedDB cache completely cleared');
        } catch (e) {
            console.warn('[Storage] clearAllCache failed', e);
        }
    }
    
    // إدارة آمنة للروابط المؤقتة لمنع اختفاء الصور فجأة أثناء التصفح
    revokeObjectURL(url) {
        if (this.activeObjectURLs.has(url)) {
            URL.revokeObjectURL(url);
            this.activeObjectURLs.delete(url);
        }
    }
    
    registerObjectURL(url) {
        this.activeObjectURLs.add(url);
    }

    // تفريغ كافة الروابط عند الحاجة (مثال: عند الخروج أو تغيير الصفحة بشكل كامل)
    revokeAllObjectURLs() {
        this.activeObjectURLs.forEach(url => URL.revokeObjectURL(url));
        this.activeObjectURLs.clear();
    }

    saveCart(cartMap) {
        try {
            localStorage.setItem(CONFIG.STORAGE_KEYS.CART, JSON.stringify(cartMap));
        } catch (e) {
            console.warn('[Storage] Failed to save cart to localStorage', e);
        }
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
        try {
            if (this.useFallback) {
                const cached = localStorage.getItem('apiCache');
                if (cached) {
                    const { timestamp } = JSON.parse(cached);
                    this.lastTimestamp = timestamp;
                    return timestamp;
                }
            }
        } catch (e) {}
        return null;
    }
}
