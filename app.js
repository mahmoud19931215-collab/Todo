import { CONFIG } from './config.js';
import { StorageService } from './StorageService.js';
import { ProductsGrid } from './ProductsGrid.js';
import { CategoryManager } from './CategoryManager.js';
import { CartManager } from './CartManager.js';
import { ThemeManager } from './ThemeManager.js';

class App {
    constructor() {
        this.storage = new StorageService();
        this.productsGrid = null;
        this.categoryManager = null;
        this.cartManager = null;
        this.themeManager = null;
        this.fullData = null;
        this.isOnline = navigator.onLine;
        this.init();
    }

    async init() {
        await this.storage.init();
        this.themeManager = new ThemeManager();
        this.cartManager = new CartManager(CONFIG.TARGET_NUMBER, (qty, total) => {});
        
        this.productsGrid = new ProductsGrid('productsGrid', this.storage, (totalQty, totalPrice) => {
            this.cartManager.updateFromCartItems(this.productsGrid.getAllCartItems());
        });
        this.categoryManager = new CategoryManager(
            'mainChipsContainer',
            'subChipsContainer',
            (mainCat) => {
                this.productsGrid.setActiveMainCategory(mainCat);
                if (mainCat !== 'all') {
                    const subs = this.productsGrid.getSubCategoriesFor(mainCat);
                    this.categoryManager.updateSubChips(mainCat, subs);
                } else {
                    this.categoryManager.updateSubChips('all', []);
                }
            },
            (subCat) => {
                this.productsGrid.setActiveSubCategory(subCat);
            }
        );
        
        this.cartManager.setRemoveItemCallback((productName) => {
            this.productsGrid.removeItemFromCart(productName);
            this.cartManager.updateFromCartItems(this.productsGrid.getAllCartItems());
        });

        const progressBar = document.getElementById('globalProgress');
        const progressFill = progressBar?.querySelector('.progress-fill');
        if (progressBar && progressFill) {
            this.productsGrid.setImageProgressCallback((percent) => {
                if (percent < 100 && percent > 0) {
                    progressBar.style.display = 'block';
                    progressFill.style.width = `${percent}%`;
                } else {
                    setTimeout(() => progressBar.style.display = 'none', 500);
                }
            });
        }

        const searchInput = document.getElementById('searchInput');
        const clearSearch = document.getElementById('clearSearch');
        const searchStats = document.getElementById('searchStats');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value;
                const count = this.productsGrid.filterBySearch(query);
                if (searchStats) {
                    searchStats.innerText = query.trim() ? `${count} نتيجة` : '';
                }
                if (clearSearch) clearSearch.style.display = query ? 'flex' : 'none';
            });
        }
        if (clearSearch) {
            clearSearch.addEventListener('click', () => {
                if (searchInput) searchInput.value = '';
                this.productsGrid.filterBySearch('');
                if (searchStats) searchStats.innerText = '';
                clearSearch.style.display = 'none';
            });
        }

        const skeleton = document.getElementById('skeletonLoader');
        const productsGridDiv = document.getElementById('productsGrid');
        const cachedData = await this.storage.getApiCache();
        if (cachedData) {
            this.renderFullData(cachedData);
            this.showOfflineToast(true, this.storage.getLastUpdateTimestamp());
            if (skeleton) skeleton.style.display = 'none';
            if (productsGridDiv) productsGridDiv.style.display = 'grid';
        }
        this.fetchFreshData();
        this.setupNetworkListeners();
        this.setupSettingsModal();
    }

    async fetchFreshData() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONFIG.FETCH_TIMEOUT);
            const response = await fetch(CONFIG.API_URL, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (!data || typeof data !== 'object') throw new Error("Invalid data");
            await this.storage.saveApiCache(data);
            this.renderFullData(data);
            this.showOfflineToast(false);
            this.hideOfflinePage();
        } catch (err) {
            console.error("Fetch failed:", err);
            if (!this.fullData) {
                this.showOfflinePage();
            } else {
                this.showOfflineToast(true, this.storage.getLastUpdateTimestamp());
            }
        }
    }

    renderFullData(data) {
        this.fullData = data;
        this.productsGrid.loadData(data);
        const mainCats = this.productsGrid.getMainCategories();
        this.categoryManager.buildMainChips(mainCats);
        const subMap = new Map();
        for (const main of mainCats) {
            subMap.set(main, this.productsGrid.getSubCategoriesFor(main));
        }
        this.categoryManager.setSubCategoriesMap(subMap);
        const currentMain = this.categoryManager.getCurrentMain();
        if (currentMain && currentMain !== 'all') {
            this.categoryManager.selectMainCategory(currentMain);
        }
        const skeleton = document.getElementById('skeletonLoader');
        const gridDiv = document.getElementById('productsGrid');
        if (skeleton) skeleton.style.display = 'none';
        if (gridDiv) gridDiv.style.display = 'grid';
    }

    showOfflineToast(isCached, timestamp) {
        const toast = document.getElementById('offlineToast');
        if (!toast) return;
        if (isCached) {
            toast.style.display = 'flex';
            const timeSpan = document.getElementById('cacheTime');
            if (timeSpan && timestamp) {
                timeSpan.innerText = `آخر تحديث: ${new Date(timestamp).toLocaleTimeString()}`;
            }
            const refreshBtn = document.getElementById('refreshDataBtn');
            if (refreshBtn) {
                refreshBtn.onclick = () => {
                    if (navigator.onLine) this.fetchFreshData();
                    else alert("لا يوجد اتصال بالإنترنت");
                };
            }
            const closeToast = document.getElementById('closeToastBtn');
            if (closeToast) closeToast.onclick = () => toast.style.display = 'none';
        } else {
            toast.style.display = 'none';
        }
    }

    showOfflinePage() {
        const offlinePage = document.getElementById('offlinePage');
        if (offlinePage) offlinePage.style.display = 'flex';
        const retryBtn = document.getElementById('retryConnection');
        if (retryBtn) {
            retryBtn.onclick = () => {
                if (navigator.onLine) {
                    offlinePage.style.display = 'none';
                    this.fetchFreshData();
                } else {
                    alert("لا توجد شبكة");
                }
            };
        }
    }

    hideOfflinePage() {
        const offlinePage = document.getElementById('offlinePage');
        if (offlinePage) offlinePage.style.display = 'none';
    }

    setupNetworkListeners() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.hideOfflinePage();
            this.fetchFreshData();
        });
        window.addEventListener('offline', () => {
            this.isOnline = false;
            if (!this.fullData) this.showOfflinePage();
        });
    }

    setupSettingsModal() {
        const settingsBtn = document.getElementById('settingsBtn');
        const modal = document.getElementById('settingsModal');
        const closeBtn = modal?.querySelector('.modal-close');
        const clearCacheBtn = document.getElementById('clearCacheAction');
        if (settingsBtn && modal) {
            settingsBtn.addEventListener('click', () => modal.classList.add('open'));
            if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.remove('open'));
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.remove('open');
            });
            if (clearCacheBtn) {
                clearCacheBtn.addEventListener('click', async () => {
                    if (confirm('سيتم مسح جميع الصور والبيانات المخزنة. هل أنت متأكد؟')) {
                        await this.storage.clearAllCache();
                        alert('تم مسح الكاش، سيتم إعادة تحميل البيانات');
                        location.reload();
                    }
                });
            }
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new App());
} else {
    new App();
}
