// config.js - مستودع الثوابت والدوال المساعدة الموحدة للنظام
export const CONFIG = {
    TARGET_NUMBER: "963945083365",
    API_URL: "https://script.google.com/macros/s/AKfycbxupDW04PxItTLcmYyBT1sZyXSdOl4mcdUGTGEZn6zlWaDVYIrgKoIcZ6dD_RXF37vS/exec",
    ITEMS_PER_PAGE: 12,
    CACHE_TTL: 3600000, // ساعة واحدة كمعدل حياة افتراضي للكاش المحلي
    DB_NAME: "TogvenDB",
    DB_VERSION: 4,
    STORES: {
        IMAGES: "images",
        API_CACHE: "apiCache"
    },
    DEBOUNCE_DELAY: 150,
    FETCH_RETRY_COUNT: 3,
    FETCH_TIMEOUT: 10000,
    DEFAULT_THEME: "light",
    STORAGE_KEYS: {
        CART: "togven_cart",
        THEME: "togven_theme",
        OFFLINE_BANNER_SHOWN: "offline_banner_dismissed"
    },
    IMAGE_PLACEHOLDER: "https://via.placeholder.com/300?text=No+Image",
    IMAGE_LOADING_TIMEOUT: 5000,
    MAX_IMAGE_RETRIES: 2
};

/**
 * توليد مفتاح فريد ومعياري لكل منتج لمنع التضارب أثناء التخزين
 */
export function getProductKey(productName, category = "") {
    return `${category}-${productName}`.toLowerCase().replace(/[^a-z0-9-]/g, "_");
}

/**
 * التحقق من سلامة رابط الصورة قبل بدء عمليات الجلب والتخزين
 */
export function isValidImageUrl(url) {
    return url && url.startsWith('http');
}

/**
 * دالة تنسيق العملة الموحدة للاستهلاك البصري (ليرة سورية ل.س)
 */
export function formatCurrency(value) {
    const num = Number(value) || 0;
    return num.toLocaleString('ar-EG') + ' ل.س';
}

/**
 * دالة تطهير النصوص وتنظيف مخرجات الـ HTML (المفقودة سابقاً)
 * تحمي المتجر من هجمات حقن الشيفرات الخبيثة (XSS) وتمنع انهيار التصميم البصري
 */
export function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function(m) {
        switch (m) {
            case '&': return '&amp;';
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '"': return '&quot;';
            case "'": return '&#039;';
            default: return m;
        }
    });
}
