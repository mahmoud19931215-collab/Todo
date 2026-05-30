// CategoryManager.js
export class CategoryManager {
    constructor(mainContainerId, subContainerId, onMainSelect, onSubSelect) {
        // تخزين المراجع
        this.mainContainer = document.getElementById(mainContainerId);
        this.subContainer = document.getElementById(subContainerId);
        this.onMainSelect = onMainSelect;
        this.onSubSelect = onSubSelect;
        
        // الحالة
        this.currentMain = 'all';
        this.currentSub = null;
        this.mainCategories = ['all'];
        this.subCategoriesMap = new Map();   // mainCat -> array of subCats
        
        // لتجنب التحديثات المتكررة (على سبيل المثال عند النقر السريع)
        this.updateDebounceTimer = null;
        
        // ربط الأحداث باستخدام delegation
        this._bindEvents();
    }

    _bindEvents() {
        // Delegation للحاوية الرئيسية (تجنب إضافة مستمع لكل زر)
        if (this.mainContainer) {
            this.mainContainer.addEventListener('click', (e) => {
                const chip = e.target.closest('.chip');
                if (!chip) return;
                const mainCat = chip.getAttribute('data-main-cat');
                if (mainCat && mainCat !== this.currentMain) {
                    this.selectMainCategory(mainCat);
                }
            });
        }
        
        // Delegation للحاوية الفرعية
        if (this.subContainer) {
            this.subContainer.addEventListener('click', (e) => {
                const chip = e.target.closest('.chip');
                if (!chip) return;
                const subCat = chip.getAttribute('data-sub');
                if (subCat && subCat !== this.currentSub) {
                    this.selectSubCategory(subCat);
                }
            });
        }
    }

    buildMainChips(mainCatsArray) {
        if (!this.mainContainer) return;
        
        // تحديث قائمة التصنيفات الرئيسية
        this.mainCategories = ['all', ...mainCatsArray];
        
        // استخدام DocumentFragment لبناء الأزرار دفعة واحدة
        const fragment = document.createDocumentFragment();
        for (const cat of this.mainCategories) {
            const chip = document.createElement('div');
            chip.className = 'chip';
            if (cat === 'all') chip.classList.add('active');
            chip.setAttribute('data-main-cat', cat);
            chip.textContent = cat === 'all' ? 'الكل' : cat;
            fragment.appendChild(chip);
        }
        
        // تنظيف الحاوية وإضافة الأزرار الجديدة
        this.mainContainer.replaceChildren(fragment);
    }

    updateSubChips(mainCat, subCatsArray) {
        if (!this.subContainer) return;
        
        // إذا كان التصنيف الرئيسي "الكل" أو لا يوجد تصنيفات فرعية
        if (mainCat === 'all' || !subCatsArray || subCatsArray.length === 0) {
            this.subContainer.style.display = 'none';
            this.currentSub = null;
            this.onSubSelect('all');
            return;
        }
        
        this.subContainer.style.display = 'flex';
        
        // بناء الأزرار (بما في ذلك زر "الكل")
        const fragment = document.createDocumentFragment();
        
        // زر "الكل" للتصنيفات الفرعية
        const allChip = document.createElement('div');
        allChip.className = 'chip sub-active';  // active افتراضياً
        allChip.setAttribute('data-sub', 'all');
        allChip.textContent = 'الكل';
        fragment.appendChild(allChip);
        
        // أزرار التصنيفات الفرعية
        for (const sub of subCatsArray) {
            const chip = document.createElement('div');
            chip.className = 'chip';
            chip.setAttribute('data-sub', sub);
            chip.textContent = sub;
            fragment.appendChild(chip);
        }
        
        this.subContainer.replaceChildren(fragment);
        
        // إعادة ضبط الحالة
        this.currentSub = 'all';
        this.onSubSelect('all');
    }

    selectMainCategory(cat) {
        if (this.currentMain === cat) return;
        
        // منع التحديث المتكرر (إذا كان هناك تأخير)
        if (this.updateDebounceTimer) clearTimeout(this.updateDebounceTimer);
        
        this.updateDebounceTimer = setTimeout(() => {
            this.currentMain = cat;
            
            // تحديث حالة الأزرار الرئيسية
            const chips = this.mainContainer.querySelectorAll('.chip');
            for (const chip of chips) {
                const chipCat = chip.getAttribute('data-main-cat');
                if (chipCat === cat) chip.classList.add('active');
                else chip.classList.remove('active');
            }
            
            this.currentSub = null;
            this.onMainSelect(cat);
            
            if (cat === 'all') {
                this.subContainer.style.display = 'none';
                this.currentSub = null;
                this.onSubSelect('all');
            } else {
                const subs = this.subCategoriesMap.get(cat) || [];
                this.updateSubChips(cat, subs);
            }
            
            this.updateDebounceTimer = null;
        }, 10);  // تأخير بسيط لتجنب التحديثات المتزامنة
    }

    selectSubCategory(sub) {
        if (this.currentSub === sub) return;
        this.currentSub = sub;
        
        // تحديث حالة الأزرار الفرعية
        const chips = this.subContainer.querySelectorAll('.chip');
        for (const chip of chips) {
            const chipSub = chip.getAttribute('data-sub');
            if (chipSub === sub) chip.classList.add('sub-active');
            else chip.classList.remove('sub-active');
        }
        
        this.onSubSelect(sub);
    }

    setSubCategoriesMap(map) {
        this.subCategoriesMap = map;
    }

    getCurrentMain() {
        return this.currentMain;
    }

    getCurrentSub() {
        return this.currentSub;
    }
    
    // تنظيف (اختياري)
    destroy() {
        if (this.mainContainer) {
            this.mainContainer.replaceChildren();  // إزالة جميع الأزرار
        }
        if (this.subContainer) {
            this.subContainer.replaceChildren();
        }
        if (this.updateDebounceTimer) clearTimeout(this.updateDebounceTimer);
    }
}
