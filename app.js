// app.js
import { CONFIG } from './config.js';
import { StorageService } from './StorageService.js';
import { ProductsGrid } from './ProductsGrid.js';
import { CategoryManager } from './CategoryManager.js';
import { CartManager } from './CartManager.js';
import { ThemeManager } from './ThemeManager.js';

class App {
    constructor() {
        // الخدمات والمكونات
        this.storage = null;
        this.productsGrid = null;
        this.categoryManager = null;
        this.cartManager = null;
        this.themeManager = null;
        
        // الحالة
        this.fullData = null;
        this.isOnline = navigator.onLine;
        this.initPromise = null;
        this.abortController = null;        // لإلغاء طلبات الجلب السابقة
        this.retryTimeout = null;           // لمنع التكرار في إعادة المحاولة
        
        // عناصر DOM الهامة (تخزينها مرة واحدة)
        this.elements = {
            skeleton: null,
            productsGrid: null,
            progressBar: null,
            progressFill: null,
            searchInput: null,
            clearSearch: null,
            searchStats: null,
            offlineToast: null,
            cacheTime: null,
            refreshBtn: null,
            closeToastBtn: null,
            offlinePage: null,
            retryBtn: null,
            settingsBtn: null,
            settingsModal: null,
            modalClose: null,
            clearCacheBtn: null
        };
        
        this.init();
    }

    async init() {
        // منع التهيئة المتكررة
        if (this.initPromise) return this.initPromise;
        
        this.initPromise = (async () => {
            // إنشاء خدمة التخزين
            this.storage = new StorageService();
            await this.storage.init();
            
            // مدير الثيم
            this.themeManager = new ThemeManager();
            
            // تخزين مراجع العناصر الرئيسية
            this._cacheElements();
            
            // إنشاء مدير السلة (بدون callback مؤقت)
            this.cartManager = new CartManager(CONFIG.TARGET_NUMBER, (qty, total) => {});
            
            // إنشاء شبكة المنتجات
            this.productsGrid = new ProductsGrid('productsGrid', this.storage, (totalQty, totalPrice) => {
                if (this.cartManager) {
                    this.cartManager.updateFromCartItems(this.productsGrid.getAllCartItems());
                }
            });
            
            // إنشاء مدير التصنيفات
            this.categoryManager = new CategoryManager(
                'mainChipsContainer',
                'subChipsContainer',
                (mainCat) => {
                    if (!this.productsGrid) return;
                    this.productsGrid.setActiveMainCategory(mainCat);
                    if (mainCat !== 'all') {
                        const subs = this.productsGrid.getSubCategoriesFor(mainCat);
                        this.categoryManager.updateSubChips(mainCat, subs);
                    } else {
                        this.categoryManager.updateSubChips('all', []);
                    }
                },
                (subCat) => {
                    if (this.productsGrid) this.productsGrid.setActiveSubCategory(subCat);
                }
            );
            
            // ربط回调 إزالة العنصر في السلة
            if (this.cartManager) {
                this.cartManager.setRemoveItemCallback((productName) => {
                    if (this.productsGrid) {
                        this.productsGrid.removeItemFromCart(productName);
                        this.cartManager.updateFromCartItems(this.productsGrid.getAllCartItems());
                    }
                });
            }
            
            // إعداد شريط التقدم
            this._setupProgressBar();
            
            // إعداد البحث
            this._setupSearch();
            
            // عرض البيانات المخزنة مؤقتاً أولاً
            const skeleton = this.elements.skeleton;
            const gridDiv = this.elements.productsGrid;
            const cachedData = await this.storage.getApiCache();
            if (cachedData) {
                this.renderFullData(cachedData);
                this.showOfflineToast(true, this.storage.getLastUpdateTimestamp());
                if (skeleton) skeleton.style.display = 'none';
                if (gridDiv) gridDiv.style.display = 'grid';
            }
            
            // ثم جلب البيانات الجديدة في الخلفية
            this.fetchFreshData();
            
            // إعداد مستمعي الشبكة
            this.setupNetworkListeners();
            
            // إعداد مودال الإعدادات
            this.setupSettingsModal();
        })();
        
        return this.initPromise;
    }
    
    _cacheElements() {
        this.elements.skeleton = document.getElementById('skeletonLoader');
        this.elements.productsGrid = document.getElementById('productsGrid');
        this.elements.progressBar = document.getElementById('globalProgress');
        this.elements.progressFill = this.elements.progressBar?.querySelector('.progress-fill');
        this.elements.searchInput = document.getElementById('searchInput');
        this.elements.clearSearch = document.getElementById('clearSearch');
        this.elements.searchStats = document.getElementById('searchStats');
        this.elements.offlineToast = document.getElementById('offlineToast');
        this.elements.cacheTime = document.getElementById('cacheTime');
        this.elements.refreshBtn = document.getElementById('refreshDataBtn');
        this.elements.closeToastBtn = document.getElementById('closeToastBtn');
        this.elements.offlinePage = document.getElementById('offlinePage');
        this.elements.retryBtn = document.getElementById('retryConnection');
        this.elements.settingsBtn = document.getElementById('settingsBtn');
        this.elements.settingsModal = document.getElementById('settingsModal');
        this.elements.modalClose = this.elements.settingsModal?.querySelector('.modal-close');
        this.elements.clearCacheBtn = document.getElementById('clearCacheAction');
    }
    
    _setupProgressBar() {
        if (this.elements.progressBar && this.elements.progressFill && this.productsGrid) {
            this.productsGrid.setImageProgressCallback((percent) => {
                if (percent < 100 && percent > 0) {
                    if (this.elements.progressBar) this.elements.progressBar.style.display = 'block';
                    if (this.elements.progressFill) this.elements.progressFill.style.width = `${percent}%`;
                } else {
                    setTimeout(() => {
                        if (this.elements.progressBar) this.elements.progressBar.style.display = 'none';
                    }, 500);
                }
            });
        }
    }
    
    _setupSearch() {
        const searchInput = this.elements.searchInput;
        const clearSearch = this.elements.clearSearch;
        const searchStats = this.elements.searchStats;
        
        if (!searchInput) return;
        
        const handleSearch = (e) => {
            const query = e.target.value;
            if (!this.productsGrid) return;
            const count = this.productsGrid.filterBySearch(query);
            if (searchStats) {
                searchStats.innerText = query.trim() ? `${count} نتيجة` : '';
            }
            if (clearSearch) clearSearch.style.display = query ? 'flex' : 'none';
        };
        
        searchInput.addEventListener('input', handleSearch);
        
        if (clearSearch) {
            clearSearch.addEventListener('click', () => {
                if (searchInput) searchInput.value = '';
                if (this.productsGrid) this.productsGrid.filterBySearch('');
                if (searchStats) searchStats.innerText = '';
                if (clearSearch) clearSearch.style.display = 'none';
            });
        }
    }
    
    async fetchFreshData(retryCount = 0) {
        // إلغاء أي طلب سابق
        if (this.abortController) {
            this.abortController.abort();
        }
        
        const MAX_RETRIES = CONFIG.FETCH_RETRY_COUNT || 3;
        this.abortController = new AbortController();
        const signal = this.abortController.signal;
        
        try {
            const timeoutId = setTimeout(() => this.abortController.abort(), CONFIG.FETCH_TIMEOUT);
            const response = await fetch(CONFIG.API_URL, { signal });
            clearTimeout(timeoutId);
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (!data || typeof data !== 'object') throw new Error('Invalid data');
            
            // نجاح الجلب - حفظ وحفظ البيانات
            await this.storage.saveApiCache(data);
            this.renderFullData(data);
            this.showOfflineToast(false);
            this.hideOfflinePage();
            
        } catch (err) {
            if (err.name === 'AbortError') {
                console.log('[App] Fetch aborted');
                return;
            }
            console.error(`[App] Fetch failed (attempt ${retryCount + 1}):`, err);
            
            if (retryCount < MAX_RETRIES - 1 && navigator.onLine) {
                // تأخير تصاعدي مع إلغاء المؤقت السابق
                if (this.retryTimeout) clearTimeout(this.retryTimeout);
                const delay = Math.min(1000 * Math.pow(2, retryCount), 8000);
                this.retryTimeout = setTimeout(() => {
                    this.retryTimeout = null;
                    this.fetchFreshData(retryCount + 1);
                }, delay);
                return;
            }
            
            // فشل تام - عرض وضع عدم الاتصال إذا لم تكن هناك بيانات مخزنة
            if (!this.fullData) {
                this.showOfflinePage();
            } else {
                this.showOfflineToast(true, this.storage.getLastUpdateTimestamp());
            }
        } finally {
            if (this.abortController && this.abortController.signal === signal) {
                this.abortController = null;
            }
        }
    }
    
    renderFullData(data) {
        if (!data) return;
        this.fullData = data;
        if (this.productsGrid) {
            this.productsGrid.loadData(data);
            const mainCats = this.productsGrid.getMainCategories();
            if (this.categoryManager) {
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
            }
        }
        
        // إخفاء السكيلتون وإظهار الشبكة
        if (this.elements.skeleton) this.elements.skeleton.style.display = 'none';
        if (this.elements.productsGrid) this.elements.productsGrid.style.display = 'grid';
    }
    
    showOfflineToast(isCached, timestamp) {
        const toast = this.elements.offlineToast;
        if (!toast) return;
        
        if (isCached) {
            toast.style.display = 'flex';
            if (this.elements.cacheTime && timestamp) {
                this.elements.cacheTime.innerText = `آخر تحديث: ${new Date(timestamp).toLocaleTimeString()}`;
            }
            if (this.elements.refreshBtn) {
                // إزالة المستمع القديم وإضافة مستمع جديد
                const newBtn = this.elements.refreshBtn.cloneNode(true);
                this.elements.refreshBtn.parentNode.replaceChild(newBtn, this.elements.refreshBtn);
                this.elements.refreshBtn = newBtn;
                this.elements.refreshBtn.onclick = () => {
                    if (navigator.onLine) this.fetchFreshData();
                    else alert('لا يوجد اتصال بالإنترنت');
                };
            }
            if (this.elements.closeToastBtn) {
                const newClose = this.elements.closeToastBtn.cloneNode(true);
                this.elements.closeToastBtn.parentNode.replaceChild(newClose, this.elements.closeToastBtn);
                this.elements.closeToastBtn = newClose;
                this.elements.closeToastBtn.onclick = () => {
                    if (toast) toast.style.display = 'none';
                };
            }
        } else {
            toast.style.display = 'none';
        }
    }
    
    showOfflinePage() {
        const offlinePage = this.elements.offlinePage;
        if (!offlinePage) return;
        offlinePage.style.display = 'flex';
        
        if (this.elements.retryBtn) {
            const newRetry = this.elements.retryBtn.cloneNode(true);
            this.elements.retryBtn.parentNode.replaceChild(newRetry, this.elements.retryBtn);
            this.elements.retryBtn = newRetry;
            this.elements.retryBtn.onclick = () => {
                if (navigator.onLine) {
                    offlinePage.style.display = 'none';
                    this.fetchFreshData();
                } else {
                    alert('لا توجد شبكة');
                }
            };
        }
    }
    
    hideOfflinePage() {
        if (this.elements.offlinePage) this.elements.offlinePage.style.display = 'none';
    }
    
    setupNetworkListeners() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.hideOfflinePage();
            // إلغاء أي مؤقت إعادة محاولة قائم
            if (this.retryTimeout) {
                clearTimeout(this.retryTimeout);
                this.retryTimeout = null;
            }
            this.fetchFreshData();
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
            if (!this.fullData) this.showOfflinePage();
        });
    }
    
    setupSettingsModal() {
        const settingsBtn = this.elements.settingsBtn;
        const modal = this.elements.settingsModal;
        const closeBtn = this.elements.modalClose;
        const clearCacheBtn = this.elements.clearCacheBtn;
        
        if (!settingsBtn || !modal) return;
        
        const openModal = () => modal.classList.add('open');
        const closeModal = () => modal.classList.remove('open');
        
        settingsBtn.addEventListener('click', openModal);
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
        
        if (clearCacheBtn) {
            clearCacheBtn.addEventListener('click', async () => {
                if (confirm('سيتم مسح جميع الصور والبيانات المخزنة. هل أنت متأكد؟')) {
                    if (this.storage) await this.storage.clearAllCache();
                    alert('تم مسح الكاش، سيتم إعادة تحميل البيانات');
                    location.reload();
                }
            });
        }
    }
}

// بدء التطبيق بأمان
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new App());
} else {
    new App();
}
