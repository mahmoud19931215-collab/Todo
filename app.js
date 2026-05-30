// app.js - النواة المركزية والمتحكم الرئيسي لعمليات المتجر
import { CONFIG } from './config.js';
import { StorageService } from './StorageService.js';
import { ProductsGrid } from './ProductsGrid.js';
import { CategoryManager } from './CategoryManager.js';
import { CartManager } from './CartManager.js';
import { ThemeManager } from './ThemeManager.js';

class App {
    constructor() {
        // إدارة الخدمات والمكونات الأساسية
        this.storage = null;
        this.productsGrid = null;
        this.categoryManager = null;
        this.cartManager = null;
        this.themeManager = null;
        
        // الحالة التشغيلية للتطبيق
        this.fullData = null;
        this.isOnline = navigator.onLine;
        this.abortController = null;        // لإلغاء طلبات الجلب المتداخلة
        this.retryTimeout = null;           // موازنة مهلة إعادة المحاولة
        
        // ربط وتخزين مراجع عناصر الـ DOM الحيوية لمنع المعالجة المتكررة
        this.elements = {
            productsGrid: document.getElementById('productsGrid'),
            searchInput: document.getElementById('searchInput'),
            clearSearch: document.getElementById('clearSearch'),
            refreshBtn: document.getElementById('refreshBtn'),
            offlinePage: document.getElementById('offlinePage'),
            retryBtn: document.getElementById('retryConnection'),
            settingsBtn: document.getElementById('themeToggle'), // موازن مع زر النمط أو الإعدادات
            settingsModal: document.getElementById('settingsModal'),
            modalClose: document.querySelector('.modal-close'),
            clearCacheBtn: document.getElementById('clearCacheAction')
        };
        
        this.init();
    }

    /**
     * الإقلاع التدريجي للمتجر والتحقق من سلامة البنية التحتية للتخزين
     */
    async init() {
        try {
            // 1. تشغيل مدير المظهر الثنائي (ليلي / نهاري)
            this.themeManager = new ThemeManager();

            // 2. تفعيل وتحضير قاعدة البيانات المحلية (IndexedDB / LocalStorage Fallback)
            this.storage = new StorageService();
            await this.storage.init();
            
            // 3. بناء شبكة المنتجات الموحدة والربط مع معالج الكميات
            this.productsGrid = new ProductsGrid('productsGrid', this.storage, (prodName, newQty, delta) => {
                this.handleQuantityChange(prodName, newQty, delta);
            });

            // 4. تشغيل مدير الأقسام والفئات المتقدمة
            this.categoryManager = new CategoryManager(
                'mainCategoriesFields',
                'subCategoriesFields',
                (mainCat) => this.handleMainCategorySelect(mainCat),
                (subCat) => this.handleSubCategorySelect(subCat)
            );

            // 5. تهيئة مدير سلة المشتريات وقنوات الـ WhatsApp
            this.cartManager = new CartManager(CONFIG.TARGET_NUMBER, () => {
                this.syncCartToCards();
            });
            this.cartManager.setRemoveItemCallback((prodName) => {
                if (this.productsGrid) this.productsGrid.removeItemFromCart(prodName);
            });

            // 6. ربط مستمعي الأحداث والشبكة والأجهزة الطرفية
            this.initEventListeners();
            this.setupSettingsModal();

            // 7. سحب وتغذية المتجر بالبيانات الحية
            await this.loadStoreData();

        } catch (error) {
            console.error('[App Critical Error] فشل إقلاع النظام الموحد:', error);
        }
    }

    /**
     * سحب البيانات الذكي (كاش محلي أولاً مع جلب بالخلفية لضمان الأداء السريع)
     */
    async loadStoreData() {
        if (this.productsGrid) this.productsGrid.showSkeleton();

        // محاولة سحب النسخة المخبأة محلياً لسرعة الاستجابة
        const cachedData = await this.storage.getCachedApiData(CONFIG.API_URL);
        if (cachedData) {
            this.fullData = cachedData;
            this.renderStore();
            // إذا كان النظام متصلاً، نقوم بتحديث البيانات في الخلفية بهدوء دون إزعاج المستخدم
            if (this.isOnline) {
                this.fetchFreshData(true);
            }
        } else {
            // لا يوجد كاش، جلب إجباري ومباشر من السيرفر
            await this.fetchFreshData(false);
        }
    }

    /**
     * جلب البيانات الصافية من السيرفر السحابي
     */
    async fetchFreshData(isBackground = false) {
        if (!this.isOnline) {
            if (!this.fullData) this.showOfflinePage();
            return;
        }

        if (this.abortController) this.abortController.abort();
        this.abortController = new AbortController();

        try {
            const response = await fetch(CONFIG.API_URL, {
                signal: this.abortController.signal
            });
            
            if (!response.ok) throw new Error('Network response status error');
            
            const data = await response.json();
            if (Array.isArray(data) && data.length > 0) {
                this.fullData = data;
                await this.storage.cacheApiData(CONFIG.API_URL, data);
                
                if (this.elements.offlinePage) this.elements.offlinePage.style.display = 'none';
                this.renderStore();
            }
        } catch (err) {
            if (err.name === 'AbortError') return;
            console.warn('[App Fetch] فشل جلب البيانات الحية:', err);
            if (!this.fullData) this.showOfflinePage();
        }
    }

    /**
     * رندرة البيانات وبناء أزرار الفرز داخل واجهة المستخدم
     */
    renderStore() {
        if (!this.fullData || !this.productsGrid) return;

        // ضخ البيانات داخل الشبكة
        this.productsGrid.setData(this.fullData);

        // تحديث أزرار الأقسام الرئيسية والفرعية
        const mainCats = this.productsGrid.getMainCategories();
        this.categoryManager.mainCategories = mainCats;
        
        const subCatsMap = new Map();
        mainCats.forEach(cat => {
            subCatsMap.set(cat, this.productsGrid.getSubCategoriesFor(cat));
        });
        this.categoryManager.setSubCategoriesMap(subCatsMap);
        this.categoryManager.renderMainChips();

        // تفعيل الرندرة الأساسية للكروت وتطبيق السلة المخزنة
        this.productsGrid.render();
        this.syncCartToCards();
    }

    syncCartToCards() {
        if (!this.productsGrid || !this.cartManager) return;
        const items = this.productsGrid.getAllCartItems();
        this.cartManager.updateCartState(items);
    }

    handleQuantityChange(productName, newQty, delta) {
        this.syncCartToCards();
    }

    handleMainCategorySelect(mainCat) {
        if (this.productsGrid) {
            const activeSub = this.categoryManager.getCurrentSub();
            const searchVal = this.elements.searchInput ? this.elements.searchInput.value : '';
            this.productsGrid.setFilters(mainCat, activeSub, searchVal);
            this.syncCartToCards();
        }
    }

    handleSubCategorySelect(subCat) {
        if (this.productsGrid) {
            const activeMain = this.categoryManager.getCurrentMain();
            const searchVal = this.elements.searchInput ? this.elements.searchInput.value : '';
            this.productsGrid.setFilters(activeMain, subCat, searchVal);
            this.syncCartToCards();
        }
    }

    showOfflinePage() {
        if (this.elements.offlinePage) {
            this.elements.offlinePage.style.display = 'flex';
        }
        if (this.productsGrid) this.productsGrid.hideSkeleton();
    }

    /**
     * تهيئة كافة الأحداث والمستمعين لعمليات البحث والتحديث والشبكة
     */
    initEventListeners() {
        // معالجة صندوق البحث الذكي ومسح المدخلات
        if (this.elements.searchInput) {
            this.elements.searchInput.addEventListener('input', (e) => {
                const val = e.target.value;
                if (this.elements.clearSearch) {
                    this.elements.clearSearch.style.display = val ? 'block' : 'none';
                }
                const activeMain = this.categoryManager.getCurrentMain();
                const activeSub = this.categoryManager.getCurrentSub();
                if (this.productsGrid) this.productsGrid.setFilters(activeMain, activeSub, val);
            });
        }

        if (this.elements.clearSearch) {
            this.elements.clearSearch.addEventListener('click', () => {
                if (this.elements.searchInput) {
                    this.elements.searchInput.value = '';
                    this.elements.searchInput.dispatchEvent(new Event('input'));
                }
            });
        }

        // زر تحديث المنتجات اليدوي لإجبار النظام على جلب أحدث البيانات
        if (this.elements.refreshBtn) {
            this.elements.refreshBtn.addEventListener('click', () => {
                this.fetchFreshData(false);
            });
        }

        // زر إعادة المحاولة في صفحة عدم الاتصال
        if (this.elements.retryBtn) {
            this.elements.retryBtn.addEventListener('click', () => {
                this.loadStoreData();
            });
        }

        // مراقبة حالة استقرار الإنترنت في المتصفح
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.fetchFreshData(true);
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
            if (!this.fullData) this.showOfflinePage();
        });
    }
    
    /**
     * تهيئة وإدارة نافذة الإعدادات لتنظيف الكاش والذاكرة المؤقتة للصور
     */
    setupSettingsModal() {
        const modal = this.elements.settingsModal;
        const closeBtn = this.elements.modalClose;
        const clearCacheBtn = this.elements.clearCacheBtn;
        
        if (!modal) return;
        
        const closeModal = () => modal.classList.remove('open');
        
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
        
        if (clearCacheBtn) {
            clearCacheBtn.addEventListener('click', async () => {
                if (confirm('سيتم مسح جميع الصور والبيانات المخزنة لمتجر حلب. هل أنت متأكد؟')) {
                    if (this.storage) await this.storage.clearAllCache();
                    alert('تم مسح الكاش بنجاح، سيتم إعادة تحميل المتجر.');
                    location.reload();
                }
            });
        }
    }
}

// تشغيل وضمان استدعاء الكلاس بعد اكتمال قراءة البنية البرمجية بالكامل
export { App };
new App();
