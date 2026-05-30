// CategoryManager.js
export class CategoryManager {
    constructor(mainContainerId, subContainerId, onMainSelect, onSubSelect) {
        // تخزين المراجع للعناصر
        this.mainContainer = document.getElementById(mainContainerId);
        this.subContainer = document.getElementById(subContainerId);
        this.onMainSelect = onMainSelect;
        this.onSubSelect = onSubSelect;
        
        // الحالة
        this.currentMain = 'all';
        this.currentSub = null;
        this.mainCategories = ['all'];
        this.subCategoriesMap = new Map();   // mainCat -> Set/Array of subCats
        
        // منع التحديثات المتكررة
        this.selectMainDebounceTimer = null;
        this.selectSubDebounceTimer = null;
        
        // ربط المستمعات الرئيسية (باستخدام delegation)
        this._bindMainContainerEvents();
    }

    // بناء التصنيفات الرئيسية مع الاحتفاظ بمراجع الـ chips
    buildMainChips(mainCatsArray) {
        if (!this.mainContainer) return;
        
        // تفريغ الحاوية
        this.mainContainer.innerHTML = '';
        this.mainCategories = ['all', ...mainCatsArray];
        
        const fragment = document.createDocumentFragment();
        const chips = [];
        
        this.mainCategories.forEach(cat => {
            const chip = document.createElement('div');
            chip.className = 'chip';
            if (cat === 'all') chip.classList.add('active');
            chip.setAttribute('data-main-cat', cat);
            chip.textContent = cat === 'all' ? 'الكل' : cat;
            // نضيف المستمع مباشرة (لا حاجة لـ delegation لأن عدد التصنيفات محدود)
            chip.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectMainCategory(cat);
            });
            fragment.appendChild(chip);
            chips.push(chip);
        });
        
        this.mainContainer.appendChild(fragment);
        this.mainChips = chips; // تخزين للإدارة المستقبلية
    }

    // تحديث التصنيفات الفرعية بناءً على التصنيف الرئيسي المختار
    updateSubChips(mainCat, subCatsArray) {
        if (!this.subContainer) return;
        
        // إذا كان التصنيف الرئيسي 'all' أو لا توجد تصنيفات فرعية
        if (mainCat === 'all' || !subCatsArray || subCatsArray.length === 0) {
            this.subContainer.style.display = 'none';
            this.subContainer.innerHTML = '';
            this.currentSub = null;
            this.onSubSelect('all');
            return;
        }
        
        this.subContainer.style.display = 'flex';
        this.subContainer.innerHTML = '';
        
        const fragment = document.createDocumentFragment();
        
        // إضافة chip "الكل"
        const allChip = document.createElement('div');
        allChip.className = 'chip sub-active';
        allChip.setAttribute('data-sub', 'all');
        allChip.textContent = 'الكل';
        allChip.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectSubCategory('all');
        });
        fragment.appendChild(allChip);
        
        // إضافة التصنيفات الفرعية
        subCatsArray.forEach(sub => {
            const chip = document.createElement('div');
            chip.className = 'chip';
            chip.setAttribute('data-sub', sub);
            chip.textContent = sub;
            chip.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectSubCategory(sub);
            });
            fragment.appendChild(chip);
        });
        
        this.subContainer.appendChild(fragment);
        
        // ضبط الحالة الافتراضية
        this.currentSub = 'all';
        this.onSubSelect('all');
    }

    // اختيار تصنيف رئيسي مع debounce
    selectMainCategory(cat) {
        if (this.currentMain === cat) return;
        
        if (this.selectMainDebounceTimer) clearTimeout(this.selectMainDebounceTimer);
        this.selectMainDebounceTimer = setTimeout(() => {
            this.currentMain = cat;
            
            // تحديث الفئة النشطة في الـ chips
            if (this.mainContainer) {
                const chips = this.mainContainer.querySelectorAll('.chip');
                chips.forEach(chip => {
                    const chipCat = chip.getAttribute('data-main-cat');
                    if (chipCat === cat) chip.classList.add('active');
                    else chip.classList.remove('active');
                });
            }
            
            // إعادة تعيين التصنيف الفرعي
            this.currentSub = null;
            
            // استدعاء المعاودة الخارجية
            this.onMainSelect(cat);
            
            // إدارة التصنيفات الفرعية
            if (cat === 'all') {
                if (this.subContainer) {
                    this.subContainer.style.display = 'none';
                    this.subContainer.innerHTML = '';
                }
                this.currentSub = null;
                this.onSubSelect('all');
            } else {
                const subs = this.subCategoriesMap.get(cat) || [];
                this.updateSubChips(cat, subs);
            }
            
            this.selectMainDebounceTimer = null;
        }, 10);
    }

    // اختيار تصنيف فرعي مع debounce
    selectSubCategory(sub) {
        if (this.currentSub === sub) return;
        
        if (this.selectSubDebounceTimer) clearTimeout(this.selectSubDebounceTimer);
        this.selectSubDebounceTimer = setTimeout(() => {
            this.currentSub = sub;
            
            // تحديث الفئة النشطة في الـ chips الفرعية
            if (this.subContainer) {
                const chips = this.subContainer.querySelectorAll('.chip');
                chips.forEach(chip => {
                    const chipSub = chip.getAttribute('data-sub');
                    if (chipSub === sub) chip.classList.add('sub-active');
                    else chip.classList.remove('sub-active');
                });
            }
            
            this.onSubSelect(sub);
            this.selectSubDebounceTimer = null;
        }, 10);
    }

    // تعيين خريطة التصنيفات الفرعية (من ProductsGrid)
    setSubCategoriesMap(map) {
        this.subCategoriesMap = map;
    }

    getCurrentMain() {
        return this.currentMain;
    }

    getCurrentSub() {
        return this.currentSub;
    }
    
    // إعادة تعيين الحالة إلى الوضع الافتراضي
    reset() {
        this.currentMain = 'all';
        this.currentSub = null;
        if (this.mainContainer) {
            const chips = this.mainContainer.querySelectorAll('.chip');
            chips.forEach(chip => {
                const chipCat = chip.getAttribute('data-main-cat');
                if (chipCat === 'all') chip.classList.add('active');
                else chip.classList.remove('active');
            });
        }
        if (this.subContainer) {
            this.subContainer.style.display = 'none';
            this.subContainer.innerHTML = '';
        }
        this.onMainSelect('all');
        this.onSubSelect('all');
    }
    
    // تنظيف (لتجنب تسرب الذاكرة)
    destroy() {
        if (this.selectMainDebounceTimer) clearTimeout(this.selectMainDebounceTimer);
        if (this.selectSubDebounceTimer) clearTimeout(this.selectSubDebounceTimer);
        // إزالة جميع المستمعات من الـ chips (إذا أردنا)
        if (this.mainContainer) {
            const chips = this.mainContainer.querySelectorAll('.chip');
            chips.forEach(chip => {
                const newChip = chip.cloneNode(true);
                chip.parentNode?.replaceChild(newChip, chip);
            });
        }
        if (this.subContainer) {
            const chips = this.subContainer.querySelectorAll('.chip');
            chips.forEach(chip => {
                const newChip = chip.cloneNode(true);
                chip.parentNode?.replaceChild(newChip, chip);
            });
        }
        this.mainChips = null;
    }
    
    // ربط أحداث الحاويات (يمكن إضافة مستمعات عامة إذا احتجنا)
    _bindMainContainerEvents() {
        // أي مستمعات إضافية على مستوى الحاوية يمكن وضعها هنا
        // لكننا بالفعل استخدمنا مستمعات فردية على كل chip لتحسين الأداء
    }
}
