export const CONFIG = {
    TARGET_NUMBER: "963945083365",
    API_URL: "https://script.google.com/macros/s/AKfycbxhS7woD3d3QO7uLR6Pl8U953ja1bQY9FQYIpjDcYAvvKUto3rA24LjLMkTKeIW-lzi/exec",
    ITEMS_PER_PAGE: 12,
    CACHE_TTL: 3600000, // 1 hour
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

export function getProductKey(productName, category = "") {
    return `${category}-${productName}`.toLowerCase().replace(/[^a-z0-9-]/g, "_");
}

export function isValidImageUrl(url) {
    return url && (url.startsWith("http://") || url.startsWith("https://"));
}

export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function formatCurrency(amount) {
    return amount.toLocaleString("ar-EG") + " ل.س";
}

export function escapeHtml(str) {
    if (!str) return "";
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
