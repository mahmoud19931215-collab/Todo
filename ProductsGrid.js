// ProductsGrid.js - كامل مع إصلاح شريط التحميل
import { CONFIG } from './config.js';
import { ProductCard } from './ProductCard.js';

export class ProductsGrid {
    constructor(containerId, storage, onGlobalQuantityChange) {
        this.container = document.getElementById(containerId);
        this.storage = storage;
        this.onGlobalQuantityChange = onGlobalQuantityChange;
        
        // البيانات الأساسية
        this.rawData = null;
        this.mainCategories = new Set();
        this.subCategoriesMap = new Map();   // mainCat -> Set of subCats
        this.productsMap = new Map();        // "main|sub" -> products array
        
        // الحالة
        this.activeMain = 'all';
        this.activeSub = null;
        this.searchQuery = '';
        this.currentPageMap = new Map();      // "main|sub" -> current page index
        this.loadMoreButtons = new Map();     // حفظ أزرار "عرض المزيد" لكل قسم
        
        // قائمة الأقسام المعروضة (main+sub)
        this.allSectionsList = [];
        this.visibleSectionsCount = 6;
        this.sectionsPerLoad = 6;
        this.sectionsLoadMoreBtn = null;
        
        // عناصر واجهة
        this.cards = [];              // { mainCat, subCat, card, element }
        this.imagesLoaded = 0;
        this.totalImages = 0;
        this.onImageProgress = null;
        this.skeleton = document.getElementById('skeletonLoader');
        this.productsGridDiv = document.getElementById('productsGrid');
        
        // تحسين الأداء: تخزين مؤقت لنتائج البحث لكل قسم (خريطة متداخلة)
        this.searchCache = new Map();  // key: `${mainCat}|${subCat}|${query}` -> products filtered
        
        // منع الرندر المتزامن الكبير
        this.isRendering = false;
        this.renderQueue = [];
        this.batchSize = 2;            // أقسام لكل دفعة
        
        // debounce للبحث
        this.searchDebounceTimer = null;
    }

    setImageProgressCallback(cb) {
        this.onImageProgress = cb;
    }

    imageLoaded() {
        this.imagesLoaded++;
        if (this.onImageProgress && this.totalImages > 0) {
            const percent = (this.imagesLoaded / this.totalImages) * 100;
            this.onImageProgress(percent);
        }
    }

    loadData(data) {
        this.rawData = data;
        this.clear();
        
        // بناء الخرائط بكفاءة - استخدام for...of مع إدخالات مباشرة
        for (const [mainCat, subCatsObj] of Object.entries(data)) {
            this.mainCategories.add(mainCat);
            const subSet = new Set();
            for (const [subCat, products] of Object.entries(subCatsObj)) {
                subSet.add(subCat);
                // معالجة المنتجات مرة واحدة وتخزينها
                const validProducts = products.map(p => ({
                    ...p,
                    imageUrl: (p.imageUrl && p.imageUrl.startsWith('http')) ? p.imageUrl : CONFIG.IMAGE_PLACEHOLDER,
                    stock: (p.stock !== undefined && p.stock !== null) ? p.stock : 999
                }));
                const key = `${mainCat}|${subCat}`;
                this.productsMap.set(key, validProducts);
                this.currentPageMap.set(key, 0);
            }
            this.subCategoriesMap.set(mainCat, subSet);
        }
        
        this.buildAllSectionsList();
        this.renderVisibleSections();
    }

    buildAllSectionsList() {
        // إعادة بناء القائمة بناءً على الفلاتر النشطة
        this.allSectionsList = [];
        if (this.activeMain === 'all') {
            for (let mainCat of this.mainCategories) {
                const subCats = this.subCategoriesMap.get(mainCat) || new Set();
                for (let subCat of subCats) {
                    this.allSectionsList.push({ mainCat, subCat });
                }
            }
        } else {
            if (this.activeSub && this.activeSub !== 'all') {
                this.allSectionsList.push({ mainCat: this.activeMain, subCat: this.activeSub });
            } else {
                const subCats = this.subCategoriesMap.get(this.activeMain) || new Set();
                for (let subCat of subCats) {
                    this.allSectionsList.push({ mainCat: this.activeMain, subCat });
                }
            }
        }
    }

    renderVisibleSections() {
        if (!this.productsGridDiv || this.isRendering) return;
        this.isRendering = true;
        
        // إعادة تعيين العدادات
        this.productsGridDiv.innerHTML = '';
        this.cards = [];
        this.totalImages = 0;
        this.imagesLoaded = 0;
        this.renderQueue = [];
        
        const sectionsToShow = this.allSectionsList.slice(0, this.visibleSectionsCount);
        for (const section of sectionsToShow) {
            this.renderQueue.push(section);
        }
        
        this.processRenderQueue();
        
        // إدارة زر "تحميل المزيد من التصنيفات"
        const hasMoreSections = this.allSectionsList.length > this.visibleSectionsCount;
        if (hasMoreSections && !this.searchQuery) {
            if (!this.sectionsLoadMoreBtn) {
                this.sectionsLoadMoreBtn = document.createElement('button');
                this.sectionsLoadMoreBtn.className = 'load-more-sections-btn';
                this.sectionsLoadMoreBtn.innerText = '📂 تحميل المزيد من التصنيفات';
                this.sectionsLoadMoreBtn.addEventListener('click', () => this.loadMoreSections());
                this.productsGridDiv.appendChild(this.sectionsLoadMoreBtn);
            } else {
                this.sectionsLoadMoreBtn.style.display = 'block';
            }
        } else if (this.sectionsLoadMoreBtn) {
            this.sectionsLoadMoreBtn.style.display = 'none';
        }
        
        if (this.searchQuery) {
            if (this.sectionsLoadMoreBtn) this.sectionsLoadMoreBtn.style.display = 'none';
            this.loadMoreButtons.forEach(btn => { if(btn) btn.style.display = 'none'; });
        }
        
        if (this.skeleton) this.skeleton.style.display = 'none';
        if (this.productsGridDiv) this.productsGridDiv.style.display = 'grid';
        this.isRendering = false;
    }

    processRenderQueue() {
        if (this.renderQueue.length === 0) return;
        const batch = this.renderQueue.splice(0, this.batchSize);
        for (const { mainCat, subCat } of batch) {
            const key = `${mainCat}|${subCat}`;
            let products = this.productsMap.get(key) || [];
            
            // تطبيق البحث إذا كان موجوداً
            if (this.searchQuery) {
                const cacheKey = `${key}|${this.searchQuery}`;
                let filtered = this.searchCache.get(cacheKey);
                if (!filtered) {
                    const lowerQuery = this.searchQuery.toLowerCase();
                    filtered = products.filter(p => p.name.toLowerCase().includes(lowerQuery));
                    this.searchCache.set(cacheKey, filtered);
                }
                if (filtered.length === 0) continue;
                this.renderSubCategoryFull(mainCat, subCat, filtered);
            } else {
                this.renderSubCategoryPaginated(mainCat, subCat, products);
            }
        }
        
        if (this.renderQueue.length > 0) {
            if (typeof requestIdleCallback !== 'undefined') {
                requestIdleCallback(() => this.processRenderQueue(), { timeout: 50 });
            } else {
                setTimeout(() => this.processRenderQueue(), 10);
            }
        }
    }

    renderSubCategoryFull(mainCat, subCat, products) {
        const sectionId = `sec-${mainCat}-${subCat}`;
        let sectionEl = document.getElementById(sectionId);
        if (!sectionEl) {
            const wrapper = document.createElement('div');
            wrapper.className = 'category-section';
            wrapper.id = sectionId;
            wrapper.innerHTML = `<div class="category-header" data-main="${mainCat}" data-sub="${subCat}">${this.escapeHtml(mainCat)} <span style="font-size:14px; color:var(--primary);"> / ${this.escapeHtml(subCat)}</span></div><div class="products-grid-inner" id="inner-${mainCat}-${subCat}"></div>`;
            this.productsGridDiv.appendChild(wrapper);
            sectionEl = wrapper;
        }
        const innerDiv = sectionEl.querySelector(`#inner-${mainCat}-${subCat}`);
        if (!innerDiv) return;
        
        innerDiv.innerHTML = '';
        const fragment = document.createDocumentFragment();
        for (const product of products) {
            const card = this.createCardInstance(product, mainCat, subCat);
            fragment.appendChild(card.element);
            this.cards.push({ mainCat, subCat, card, element: card.element });
            // totalImages يتم زيادتها داخل createCardInstance تلقائياً
        }
        innerDiv.appendChild(fragment);
        
        const key = `${mainCat}|${subCat}`;
        const btn = this.loadMoreButtons.get(key);
        if (btn) btn.style.display = 'none';
    }

    renderSubCategoryPaginated(mainCat, subCat, products) {
        const sectionId = `sec-${mainCat}-${subCat}`;
        let sectionEl = document.getElementById(sectionId);
        if (!sectionEl) {
            const wrapper = document.createElement('div');
            wrapper.className = 'category-section';
            wrapper.id = sectionId;
            wrapper.innerHTML = `<div class="category-header" data-main="${mainCat}" data-sub="${subCat}">${this.escapeHtml(mainCat)} <span style="font-size:14px; color:var(--primary);"> / ${this.escapeHtml(subCat)}</span></div><div class="products-grid-inner" id="inner-${mainCat}-${subCat}"></div>`;
            this.productsGridDiv.appendChild(wrapper);
            sectionEl = wrapper;
        }
        
        const key = `${mainCat}|${subCat}`;
        const currentPage = this.currentPageMap.get(key) || 0;
        const start = currentPage * CONFIG.ITEMS_PER_PAGE;
        const end = start + CONFIG.ITEMS_PER_PAGE;
        const pageProducts = products.slice(start, end);
        
        const innerDiv = sectionEl.querySelector(`#inner-${mainCat}-${subCat}`);
        if (!innerDiv) return;
        
        if (currentPage === 0) innerDiv.innerHTML = '';
        
        const fragment = document.createDocumentFragment();
        for (const product of pageProducts) {
            const card = this.createCardInstance(product, mainCat, subCat);
            fragment.appendChild(card.element);
            this.cards.push({ mainCat, subCat, card, element: card.element });
        }
        innerDiv.appendChild(fragment);
        
        this.currentPageMap.set(key, currentPage + 1);
        const hasMore = end < products.length;
        let loadBtn = this.loadMoreButtons.get(key);
        if (!loadBtn && hasMore) {
            loadBtn = document.createElement('button');
            loadBtn.className = 'load-more-btn';
            loadBtn.innerText = '➕ عرض المزيد';
            loadBtn.addEventListener('click', () => this.renderSubCategoryPaginated(mainCat, subCat, products));
            sectionEl.appendChild(loadBtn);
            this.loadMoreButtons.set(key, loadBtn);
        } else if (loadBtn) {
            loadBtn.style.display = hasMore ? 'block' : 'none';
        }
    }

    // إصلاح: دالة إنشاء البطاقة مع حساب جميع الصور لشريط التحميل
    createCardInstance(product, mainCat, subCat) {
        const savedCart = this.getCartMapFromStorage();
        const initialQty = savedCart[product.name] || 0;
        const card = new ProductCard(product, this.storage, (name, newQty, delta) => this.onCardQuantityChange(name, newQty, delta), initialQty);
        const cardElement = card.render();
        
        // حساب عدد الصور في البطاقة (للسلايدر أو الصورة الواحدة)
        const images = cardElement.querySelectorAll('.sl-img');
        const imageCount = images.length || 1; // على الأقل صورة واحدة
        
        // إضافة إجمالي الصور إلى العداد الكلي
        this.totalImages += imageCount;
        
        // إضافة مستمع لكل صورة لتحديث شريط التقدم
        images.forEach(img => {
            if (img.complete) {
                this.imageLoaded();
            } else {
                img.addEventListener('load', () => this.imageLoaded());
                img.addEventListener('error', () => this.imageLoaded());
            }
        });
        
        // إذا لم يتم العثور على صور (حالة نادرة) نعتبر الصورة محملة
        if (imageCount === 0) {
            this.imageLoaded();
        }
        
        return card;
    }

    onCardQuantityChange(productName, newQty, delta) {
        const cartMap = this.getCartMapFromStorage();
        if (newQty === 0) delete cartMap[productName];
        else cartMap[productName] = newQty;
        this.saveCartMap(cartMap);
        
        let totalQty = 0;
        let totalPrice = 0;
        for (const cardObj of this.cards) {
            const qty = cardObj.card.getQuantity();
            if (qty > 0) {
                totalQty += qty;
                totalPrice += qty * cardObj.card.getProduct().price;
            }
        }
        if (this.onGlobalQuantityChange) {
            this.onGlobalQuantityChange(totalQty, totalPrice);
        }
    }

    getCartMapFromStorage() {
        const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.CART);
        return saved ? JSON.parse(saved) : {};
    }

    saveCartMap(map) {
        localStorage.setItem(CONFIG.STORAGE_KEYS.CART, JSON.stringify(map));
    }

    setActiveMainCategory(cat) {
        if (this.activeMain === cat) return;
        this.activeMain = cat;
        this.activeSub = null;
        this.visibleSectionsCount = 6;
        this.searchCache.clear();
        this.buildAllSectionsList();
        this.resetAllPages();
        this.renderVisibleSections();
    }

    setActiveSubCategory(sub) {
        const newSub = (sub === 'all') ? null : sub;
        if (this.activeSub === newSub) return;
        this.activeSub = newSub;
        this.visibleSectionsCount = 6;
        this.searchCache.clear();
        this.buildAllSectionsList();
        this.resetAllPages();
        this.renderVisibleSections();
    }

    filterBySearch(query) {
        if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
        this.searchDebounceTimer = setTimeout(() => {
            const trimmedQuery = query.trim();
            this.searchQuery = trimmedQuery;
            if (trimmedQuery !== '') {
                this.visibleSectionsCount = this.allSectionsList.length;
            } else {
                this.visibleSectionsCount = 6;
            }
            this.searchCache.clear();
            this.resetAllPages();
            this.renderVisibleSections();
            
            if (!trimmedQuery) {
                if (window.searchStatsCallback) window.searchStatsCallback(0);
                return;
            }
            const lowerQuery = trimmedQuery.toLowerCase();
            let count = 0;
            for (const { mainCat, subCat } of this.allSectionsList) {
                const key = `${mainCat}|${subCat}`;
                const products = this.productsMap.get(key) || [];
                for (let i = 0; i < products.length; i++) {
                    if (products[i].name.toLowerCase().includes(lowerQuery)) count++;
                }
            }
            if (window.searchStatsCallback) window.searchStatsCallback(count);
            else {
                const statsSpan = document.getElementById('searchStats');
                if (statsSpan) statsSpan.innerText = count ? `${count} نتيجة` : '';
            }
        }, CONFIG.DEBOUNCE_DELAY);
        
        if (!query.trim()) return 0;
        const lowerQuery = query.toLowerCase();
        let count = 0;
        for (const { mainCat, subCat } of this.allSectionsList) {
            const key = `${mainCat}|${subCat}`;
            const products = this.productsMap.get(key) || [];
            for (let i = 0; i < products.length; i++) {
                if (products[i].name.toLowerCase().includes(lowerQuery)) count++;
            }
        }
        return count;
    }

    resetAllPages() {
        for (const key of this.currentPageMap.keys()) {
            this.currentPageMap.set(key, 0);
        }
        this.loadMoreButtons.forEach(btn => { if(btn && btn.remove) btn.remove(); });
        this.loadMoreButtons.clear();
    }

    clear() {
        if (this.productsGridDiv) this.productsGridDiv.innerHTML = '';
        this.cards = [];
        this.mainCategories.clear();
        this.subCategoriesMap.clear();
        this.productsMap.clear();
        this.currentPageMap.clear();
        this.loadMoreButtons.clear();
        this.totalImages = 0;
        this.imagesLoaded = 0;
        this.allSectionsList = [];
        this.searchCache.clear();
        if (this.sectionsLoadMoreBtn) {
            this.sectionsLoadMoreBtn.remove();
            this.sectionsLoadMoreBtn = null;
        }
        if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
    }

    getMainCategories() {
        return Array.from(this.mainCategories);
    }

    getSubCategoriesFor(mainCat) {
        const subs = this.subCategoriesMap.get(mainCat);
        return subs ? Array.from(subs) : [];
    }

    getAllCartItems() {
        const items = [];
        for (const cardObj of this.cards) {
            const qty = cardObj.card.getQuantity();
            if (qty > 0) {
                items.push({
                    name: cardObj.card.getProduct().name,
                    quantity: qty,
                    price: cardObj.card.getProduct().price
                });
            }
        }
        return items;
    }

    removeItemFromCart(productName) {
        const cardObj = this.cards.find(c => c.card.getProduct().name === productName);
        if (cardObj && cardObj.card.getQuantity() > 0) {
            cardObj.card.setQuantity(0);
            return true;
        }
        return false;
    }

    getTotalCartQuantity() {
        let total = 0;
        for (const cardObj of this.cards) total += cardObj.card.getQuantity();
        return total;
    }

    loadMoreSections() {
        this.visibleSectionsCount += this.sectionsPerLoad;
        this.renderVisibleSections();
    }

    escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }
}
