// ProductsGrid.js - المكون المركزي لإدارة وتوزيع شبكة المنتجات والأقسام
import { CONFIG } from './config.js';
import { ProductCard } from './ProductCard.js';

export class ProductsGrid {
    constructor(containerId, storage, onGlobalQuantityChange) {
        this.container = document.getElementById(containerId);
        this.storage = storage;
        this.onGlobalQuantityChange = onGlobalQuantityChange;
        
        // البيانات الهيكلية للمتجر
        this.rawData = null;
        this.mainCategories = new Set();
        this.subCategoriesMap = new Map();   // mainCat -> Set of subCats
        this.productsMap = new Map();        // "main|sub" -> products array
        
        // الحالة التشغيلية للفرز والتمرير
        this.activeMain = 'all';
        this.activeSub = null;
        this.searchQuery = '';
        this.currentPageMap = new Map();      // "main|sub" -> current page index
        this.loadMoreButtons = new Map();     // حفظ مراجع أزرار "عرض المزيد"
        
        // قائمة الأقسام الكلية المعروضة
        this.allSectionsList = [];
        this.visibleSectionsCount = 6;
        this.sectionsPerLoad = 6;
        this.sectionsLoadMoreBtn = null;
        
        // إدارة الكروت والكائنات الحية داخل الـ DOM
        this.cards = [];              // { mainCat, subCat, card, element }
        this.imagesLoaded = 0;
        this.totalImages = 0;
        this.onImageProgress = null;
        
        // موازنة المعرفات البرمجية مع الهيكل المحدث لـ index.html
        this.productsGridDiv = document.getElementById('productsGrid');
    }

    /**
     * إظهار الهيكل الحركي (Skeleton) أثناء جلب البيانات أو التحديث
     */
    showSkeleton() {
        if (!this.productsGridDiv) return;
        this.productsGridDiv.innerHTML = '';
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < 6; i++) {
            const skel = document.createElement('div');
            skel.className = 'skeleton-card';
            skel.innerHTML = `
                <div class="skeleton-thumb"></div>
                <div class="skeleton-line w-70"></div>
                <div class="skeleton-line w-40"></div>
            `;
            fragment.appendChild(skel);
        }
        this.productsGridDiv.appendChild(fragment);
    }

    /**
     * إخفاء الهيكل الحركي وتنظيف الشبكة استقبالاً للبيانات الحقيقية
     */
    hideSkeleton() {
        if (!this.productsGridDiv) return;
        const skeletons = this.productsGridDiv.querySelectorAll('.skeleton-card');
        skeletons.forEach(el => el.remove());
    }

    /**
     * ضخ وتحليل البيانات الخام القادمة من السيرفر أو التخزين المحلي
     */
    setData(data) {
        if (!Array.isArray(data)) return;
        this.rawData = data;
        
        this.mainCategories.clear();
        this.subCategoriesMap.clear();
        this.productsMap.clear();
        this.mainCategories.add('all');

        const len = data.length;
        for (let i = 0; i < len; i++) {
            const item = data[i];
            const mainCat = item.category || 'عام';
            const subCat = item.subCategory || 'أخرى';

            this.mainCategories.add(mainCat);

            if (!this.subCategoriesMap.has(mainCat)) {
                this.subCategoriesMap.set(mainCat, new Set());
            }
            this.subCategoriesMap.get(mainCat).add(subCat);

            const key = `${mainCat}|${subCat}`;
            if (!this.productsMap.has(key)) {
                this.productsMap.set(key, []);
            }
            this.productsMap.get(key).push(item);
        }
        
        this.buildSectionsList();
    }

    buildSectionsList() {
        this.allSectionsList = [];
        this.currentPageMap.clear();
        
        for (const [key, products] of this.productsMap.entries()) {
            const [main, sub] = key.split('|');
            this.allSectionsList.push({ mainCat: main, subCat: sub, products });
            this.currentPageMap.set(key, 0);
        }
    }

    setFilters(mainCat, subCat, searchQuery = '') {
        this.activeMain = mainCat || 'all';
        this.activeSub = subCat || null;
        this.searchQuery = searchQuery.trim().toLowerCase();
        this.visibleSectionsCount = this.sectionsPerLoad; // إعادة تعيين التمرير
        this.render();
    }

    /**
     * الرندرة المركزية للشبكة بناءً على الفلاتر النشطة
     */
    render() {
        if (!this.productsGridDiv) return;
        this.hideSkeleton();
        
        // تدمير الكروت القديمة لتحرير الذاكرة و كائنات الـ Blob
        this.cards.forEach(c => { if(c.card.destroy) c.card.destroy(); });
        this.cards = [];
        this.productsGridDiv.innerHTML = '';

        let filteredSections = this.allSectionsList;

        // تطبيق فلتر التصنيف الرئيسي
        if (this.activeMain !== 'all') {
            filteredSections = filteredSections.filter(s => s.mainCat === this.activeMain);
        }

        // تطبيق فلتر التصنيف الفرعي
        if (this.activeSub && this.activeSub !== 'all') {
            filteredSections = filteredSections.filter(s => s.subCat === this.activeSub);
        }

        // تطبيق فلتر البحث المتقدم
        if (this.searchQuery) {
            filteredSections = filteredSections.map(s => {
                const matchedProducts = s.products.filter(p => 
                    (p.name && p.name.toLowerCase().includes(this.searchQuery)) ||
                    (s.mainCat.toLowerCase().includes(this.searchQuery)) ||
                    (s.subCat.toLowerCase().includes(this.searchQuery))
                );
                return { ...s, products: matchedProducts };
            }).filter(s => s.products.length > 0);
        }

        if (filteredSections.length === 0) {
            this.productsGridDiv.innerHTML = `
                <div class="empty-grid-state">
                    <i class="fas fa-box-open"></i>
                    <p>لم نجد أي منتجات تطابق بحثك حالياً.</p>
                </div>`;
            return;
        }

        // رندرة الأقسام المؤهلة بناءً على تفعيل خاصية التمرير اللانهائي المجزأ
        const sliceLimit = this.searchQuery ? filteredSections.length : this.visibleSectionsCount;
        const sectionsToRender = filteredSections.slice(0, sliceLimit);

        const fragment = document.createDocumentFragment();
        
        sectionsToRender.forEach(sec => {
            const secKey = `${sec.mainCat}|${sec.subCat}`;
            const sectionWrapper = document.createElement('section');
            sectionWrapper.className = 'grid-section-container';
            sectionWrapper.setAttribute('data-section-key', secKey);

            // بناء هيدر القسم بصرياً هيدر مرن ومتجاوب
            const header = document.createElement('h3');
            header.className = 'section-title-banner';
            header.innerHTML = `<span class="main-tag">${this.escapeHtml(sec.mainCat)}</span> 💻 <span class="sub-tag">${this.escapeHtml(sec.subCat)}</span>`;
            sectionWrapper.appendChild(header);

            // شبكة رندرة كروت المنتجات الداخلية للقسم
            const innerGrid = document.createElement('div');
            innerGrid.className = 'products-grid-inner';
            
            // جلب جزء من المنتجات بناءً على الصفحة الحالية للقسم
            const currentPage = this.currentPageMap.get(secKey) || 0;
            const limitIndex = (currentPage + 1) * CONFIG.ITEMS_PER_PAGE;
            const productsToDisplay = sec.products.slice(0, limitIndex);

            productsToDisplay.forEach(prod => {
                const savedCart = this.storage ? this.storage.loadCart() : {};
                const initialQty = savedCart[prod.name] || 0;

                const cardInstance = new ProductCard(prod, this.storage, this.onGlobalQuantityChange, initialQty);
                const cardElement = cardInstance.render();
                
                innerGrid.appendChild(cardElement);
                this.cards.push({
                    mainCat: sec.mainCat,
                    subCat: sec.subCat,
                    card: cardInstance,
                    element: cardElement
                });
            });

            sectionWrapper.appendChild(innerGrid);

            // إدارة زر "عرض المزيد" الخاص بالمنتجات داخل القسم الواحد
            if (sec.products.length > limitIndex) {
                const moreBtn = document.createElement('button');
                moreBtn.className = 'load-more-btn';
                moreBtn.innerText = `عرض المزيد من (${this.escapeHtml(sec.subCat)})`;
                moreBtn.addEventListener('click', () => this.loadMoreProductsForSection(secKey));
                sectionWrapper.appendChild(moreBtn);
            }

            fragment.appendChild(sectionWrapper);
        });

        this.productsGridDiv.appendChild(fragment);

        // إدارة زر "تحميل أقسام إضافية" الكلي للأسفل لضمان سرعة التصفح
        if (!this.searchQuery && filteredSections.length > this.visibleSectionsCount) {
            if (!this.sectionsLoadMoreBtn) {
                this.sectionsLoadMoreBtn = document.createElement('button');
                this.sectionsLoadMoreBtn.className = 'load-more-sections-btn';
                this.sectionsLoadMoreBtn.innerText = 'عرض المزيد من الأقسام 📦';
                this.sectionsLoadMoreBtn.addEventListener('click', () => this.loadMoreSections());
            }
            this.productsGridDiv.appendChild(this.sectionsLoadMoreBtn);
        } else if (this.sectionsLoadMoreBtn) {
            this.sectionsLoadMoreBtn.remove();
            this.sectionsLoadMoreBtn = null;
        }
    }

    loadMoreProductsForSection(secKey) {
        const currentPage = this.currentPageMap.get(secKey) || 0;
        this.currentPageMap.set(secKey, currentPage + 1);
        this.render();
    }

    loadMoreSections() {
        this.visibleSectionsCount += this.sectionsPerLoad;
        this.render();
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
        this.cards.forEach(c => {
            const qty = c.card.getQuantity();
            if (qty > 0) {
                items.push({
                    name: c.card.getProduct().name,
                    quantity: qty,
                    price: c.card.getProduct().price
                });
            }
        });
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
        this.cards.forEach(c => { total += c.card.getQuantity(); });
        return total;
    }

    escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>"']/g, function(m) {
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
}
