import { CONFIG } from './config.js';

export class StorageService {
    constructor() {
        this.db = null;
        this.useFallback = false;
        this.ready = false;
        this.lastTimestamp = null;
        this.initPromise = this.init();
    }

    async init() {
        try {
            if (!window.Dexie) {
                throw new Error("Dexie library not loaded");
            }
            this.db = new Dexie(CONFIG.DB_NAME);
            this.db.version(CONFIG.DB_VERSION).stores({
                [CONFIG.STORES.IMAGES]: "url",
                [CONFIG.STORES.API_CACHE]: "key"
            });
            await this.db.open();
            console.log("[Storage] IndexedDB ready");
        } catch (err) {
            console.warn("[Storage] IndexedDB failed, using localStorage fallback", err);
            this.useFallback = true;
        }
        this.ready = true;
    }

    async waitForReady() {
        if (this.ready) return;
        await this.initPromise;
    }

    // ========== إدارة الصور ==========
    async getImageBlob(url) {
        await this.waitForReady();
        if (!url) return null;

        if (this.useFallback) {
            const data = localStorage.getItem(`img_${url}`);
            if (data && data.startsWith("data:image")) {
                const response = await fetch(data);
                return await response.blob();
            }
            return null;
        }

        try {
            const record = await this.db.images.get(url);
            return record ? record.blob : null;
        } catch (e) {
            console.warn("[Storage] getImageBlob error", e);
            return null;
        }
    }

    async saveImageBlob(url, blob) {
        await this.waitForReady();
        if (!url || !blob) return;

        if (this.useFallback) {
            const reader = new FileReader();
            reader.onloadend = () => {
                try {
                    localStorage.setItem(`img_${url}`, reader.result);
                } catch (e) {
                    console.warn("[Storage] localStorage full", e);
                }
            };
            reader.readAsDataURL(blob);
            return;
        }

        try {
            await this.db.images.put({ url, blob });
        } catch (e) {
            console.warn("[Storage] saveImageBlob failed", e);
        }
    }

    // ========== إدارة كاش API ==========
    async getApiCache() {
        await this.waitForReady();

        if (this.useFallback) {
            const cached = localStorage.getItem("apiCache");
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
            const record = await this.db.apiCache.get("mainData");
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
            localStorage.setItem("apiCache", JSON.stringify({
                timestamp,
                data: data
            }));
            return;
        }

        try {
            await this.db.apiCache.put({
                key: "mainData",
                timestamp,
                data: data
            });
        } catch (e) {
            console.warn("[Storage] saveApiCache failed", e);
        }
    }

    async clearAllCache() {
        await this.waitForReady();

        if (this.useFallback) {
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith("img_") || key === "apiCache") {
                    localStorage.removeItem(key);
                }
            });
            return;
        }

        try {
            await this.db.images.clear();
            await this.db.apiCache.clear();
            console.log("[Storage] All cache cleared");
        } catch (e) {
            console.warn("[Storage] clearAllCache failed", e);
        }
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
            const cached = localStorage.getItem("apiCache");
            if (cached) {
                const { timestamp } = JSON.parse(cached);
                this.lastTimestamp = timestamp;
                return timestamp;
            }
        }
        return null;
    }
}
