// app.js
import { CONFIG } from './config.js';
import { StorageService } from './StorageService.js';
import { ProductsGrid } from './ProductsGrid.js';
import { CategoryManager } from './CategoryManager.js';
import { CartManager } from './CartManager.js';
import { ThemeManager } from './ThemeManager.js';

class App {
    constructor() {
        this.storage = new StorageService();
        this.themeManager = null;
        this.productsGrid = null;
        this.categoryManager = null;
        this.cartManager = null;

        this.allProductsRaw = [];
        this.isOnline = navigator.onLine;

        this.elements = {
            searchInput: document.getElementById('searchInput'),
            clearSearch: document.getElementById('clearSearch'),
            refreshBtn: document.getElementById('refreshBtn'),
            offlineBanner: document.getElementById('offlineBanner'),
            settingsBtn: document.getElementById('settingsBtn'),
            settingsModal: document.getElementById('settingsModal'),
            closeModalBtn: document.getElementById('closeModalBtn'),
            clearCacheBtn: document.getElementById('clearCacheBtn')
        };
    }

    async start() {
        // 1. تشغيل واجهة التخزين أولاً والموازنة
        await this.storage.init();

        // 2. تفعيل المايسترو البصري للقوالب (Themes)
        this.themeManager = new ThemeManager();

        // 3. بناء شبكة العرض والمدراء مع حقن الميكانيكيات المتبادلة
        this.productsGrid = new ProductsGrid('productsGrid', this.storage, (product, change) => {
            this.cartManager.updateItemQuantity(product, change);
        });

        this.categoryManager = new CategoryManager(
            'mainCategoriesContainer',
            'subCategoriesContainer',
            (mainCat) => this.productsGrid.setCategory(mainCat),
            (subCat) => this.productsGrid.setCategory(subCat === 'all' ? this.categoryManager.currentMain : subCat)
        );

        this.cartManager = new CartManager(CONFIG.TARGET_NUMBER, this.storage, (currentCartMap) => {
            this.productsGrid.render(currentCartMap);
        });

        // 4. تفعيل مستمعي الأحداث للواجهة العامة
        this._setupGlobalEvents();

        // 5. بدء جلب البيانات وضخها داخل التطبيق
        await this.loadApplicationData();
    }

    async loadApplicationData() {
        this.productsGrid.renderSkeletons();

        // محاولة سحب الكاش من المخزن الداخلي لسرعة الاستجابة
        const cachedData = await this.storage.getApiCache();
        if (cachedData) {
            console.log('[App] Rendering via local storage cache');
            this._processAndDistributeData(cachedData);
        }

        if (this.isOnline) {
            await this.fetchFreshDataFromServer();
        } else {
            this._toggleOfflineBanner(true);
            if (!cachedData) {
                this._showEmptyNetworkErrorState();
            }
        }
    }

    async fetchFreshDataFromServer() {
        try {
            const response = await fetch(CONFIG.API_URL, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });

            if (!response.ok) throw new Error('Network spreadsheet fetch failed');
            
            const freshData = await response.json();
            if (freshData && Array.isArray(freshData)) {
                await this.storage.saveApiCache(freshData);
                this._processAndDistributeData(freshData);
                this._toggleOfflineBanner(false);
            }
        } catch (error) {
            console.error('[App] Server fetch failed, layout intact', error);
            if (!this.allProductsRaw || this.allProductsRaw.length === 0) {
                this._showEmptyNetworkErrorState();
            }
        }
    }

    _processAndDistributeData(products) {
        this.allProductsRaw = products;

        // معالجة واستخلاص الفئات (Categories) وهيكلتها داخل الـ Maps
        const mainCats = new Set();
        const subsMap = new Map();

        products.forEach(p => {
            if (p.category) {
                mainCats.add(p.category);
                if (p.subCategory) {
                    if (!subsMap.has(p.category)) subsMap.set(p.category, new Set());
                    subsMap.get(p.category).add(p.subCategory);
                }
            }
        });

        // حقن الفئات لمدير القوائم
        this.categoryManager.setSubCategoriesMap(subsMap);
        this.categoryManager.renderMainCategories(Array.from(mainCats));

        // دفع المنتجات لشبكة العرض والرندرة مع مطابقة السلة الحالية
        this.productsGrid.setProducts(products);
        this.productsGrid.render(this.cartManager.getCartMap());
    }

    _setupGlobalEvents() {
        // مستمع البحث مع إخماد التأخير الخفيف
        if (this.elements.searchInput) {
            let searchTimeout = null;
            this.elements.searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                if (this.elements.clearSearch) {
                    this.elements.clearSearch.style.display = e.target.value ? 'block' : 'none';
                }
                searchTimeout = setTimeout(() => {
                    this.productsGrid.setSearch(e.target.value);
                    this.productsGrid.render(this.cartManager.getCartMap());
                }, CONFIG.DEBOUNCE_DELAY);
            });
        }

        if (this.elements.clearSearch) {
            this.elements.clearSearch.addEventListener('click', () => {
                this.elements.searchInput.value = '';
                this.elements.clearSearch.style.display = 'none';
                this.productsGrid.setSearch('');
                this.productsGrid.render(this.cartManager.getCartMap());
            });
        }

        if (this.elements.refreshBtn) {
            this.elements.refreshBtn.addEventListener('click', () => {
                if (this.isOnline) this.fetchFreshDataFromServer();
            });
        }

        // مراقبة الاتصال والشبكة تلقائياً
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.fetchFreshDataFromServer();
        });
        window.addEventListener('offline', () => {
            this.isOnline = false;
            this._toggleOfflineBanner(true);
        });

        this._setupSettingsModalLogic();
    }

    _setupSettingsModalLogic() {
        const { settingsBtn, settingsModal, closeModalBtn, clearCacheBtn } = this.elements;
        
        if (settingsBtn && settingsModal) {
            settingsBtn.addEventListener('click', () => settingsModal.classList.add('open'));
            if (closeModalBtn) closeModalBtn.addEventListener('click', () => settingsModal.classList.remove('open'));
            
            settingsModal.addEventListener('click', (e) => {
                if (e.target === settingsModal) settingsModal.classList.remove('open');
            });
        }

        if (clearCacheBtn) {
            clearCacheBtn.addEventListener('click', async () => {
                if (confirm('سيتم تنظيف كاش الصور والمنتجات بالكامل بشكل هندسي، هل تود الاستمرار؟')) {
                    await this.storage.clearAllCache();
                    location.reload();
                }
            });
        }
    }

    _toggleOfflineBanner(show) {
        if (this.elements.offlineBanner) {
            this.elements.offlineBanner.style.display = show ? 'block' : 'none';
        }
    }

    _showEmptyNetworkErrorState() {
        const gridContainer = document.getElementById('productsGrid');
        if (gridContainer) {
            gridContainer.innerHTML = `
                <div class="empty-grid-state">
                    <i class="fas fa-wifi"></i>
                    <p>أنت تصفح بدون إنترنت حالياً، ولا توجد نسخة مخزنة لعرضها. يرجى التحقق من اتصال الشبكة وإعادة المحاولة.</p>
                </div>
            `;
        }
    }
}

// إقلاع التطبيق الهندسي الآمن
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new App().start());
} else {
    new App().start();
}
