// CategoryManager.js
export class CategoryManager {
    constructor(mainContainerId, subContainerId, onMainSelect, onSubSelect) {
        this.mainContainer = document.getElementById(mainContainerId);
        this.subContainer = document.getElementById(subContainerId);
        this.onMainSelect = onMainSelect;
        this.onSubSelect = onSubSelect;
        
        this.currentMain = 'all';
        this.currentSub = null;
        this.subCategoriesMap = new Map(); // mainCat -> Set/Array of subCats
        
        this._bindEvents();
    }

    _bindEvents() {
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

    renderMainCategories(categories) {
        if (!this.mainContainer) return;
        
        const list = Array.isArray(categories) ? categories : [];
        let html = `<button class="chip ${this.currentMain === 'all' ? 'active' : ''}" data-main-cat="all">الكل</button>`;
        
        list.forEach(cat => {
            if (cat && cat !== 'all') {
                html += `<button class="chip ${this.currentMain === cat ? 'active' : ''}" data-main-cat="${cat}">${cat}</button>`;
            }
        });
        
        this.mainContainer.innerHTML = html;
    }

    selectMainCategory(cat) {
        this.currentMain = cat;
        this.currentSub = null;

        // تحديث المظهر البصري للأزرار الرئيسية
        if (this.mainContainer) {
            const chips = this.mainContainer.querySelectorAll('.chip');
            chips.forEach(chip => {
                if (chip.getAttribute('data-main-cat') === cat) chip.classList.add('active');
                else chip.classList.remove('active');
            });
        }

        if (this.onMainSelect) {
            this.onMainSelect(cat);
        }

        // معالجة الأقسام الفرعية بناءً على القسم الرئيسي المختار
        if (cat === 'all' || !this.subCategoriesMap.has(cat)) {
            if (this.subContainer) {
                this.subContainer.innerHTML = '';
                this.subContainer.style.display = 'none';
            }
            if (this.onSubSelect) this.onSubSelect('all');
        } else {
            const subs = this.subCategoriesMap.get(cat) || [];
            this._renderSubChips(subs);
        }
    }

    _renderSubChips(subs) {
        if (!this.subContainer) return;
        
        const subList = Array.from(subs);
        if (subList.length === 0) {
            this.subContainer.innerHTML = '';
            this.subContainer.style.display = 'none';
            return;
        }

        let html = `<button class="chip ${!this.currentSub ? 'sub-active' : ''}" data-sub="all">الكل</button>`;
        subList.forEach(sub => {
            html += `<button class="chip ${this.currentSub === sub ? 'sub-active' : ''}" data-sub="${sub}">${sub}</button>`;
        });

        this.subContainer.innerHTML = html;
        this.subContainer.style.display = 'flex';
    }

    selectSubCategory(sub) {
        this.currentSub = sub === 'all' ? null : sub;

        if (this.subContainer) {
            const chips = this.subContainer.querySelectorAll('.chip');
            chips.forEach(chip => {
                const target = chip.getAttribute('data-sub');
                if ((sub === 'all' && target === 'all') || (this.currentSub === target)) {
                    chip.classList.add('sub-active');
                } else {
                    chip.classList.remove('sub-active');
                }
            });
        }

        if (this.onSubSelect) {
            this.onSubSelect(sub);
        }
    }

    setSubCategoriesMap(map) {
        this.subCategoriesMap = map;
    }

    destroy() {
        if (this.mainContainer) this.mainContainer.innerHTML = '';
        if (this.subContainer) this.subContainer.innerHTML = '';
    }
}
