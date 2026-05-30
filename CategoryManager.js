export class CategoryManager {
    constructor(mainContainerId, subContainerId, onMainSelect, onSubSelect) {
        this.mainContainer = document.getElementById(mainContainerId);
        this.subContainer = document.getElementById(subContainerId);
        this.onMainSelect = onMainSelect;
        this.onSubSelect = onSubSelect;
        this.currentMain = 'all';
        this.currentSub = null;
        this.mainCategories = ['all'];
        this.subCategoriesMap = new Map();
    }

    buildMainChips(mainCatsArray) {
        if (!this.mainContainer) return;
        this.mainContainer.innerHTML = '';
        this.mainCategories = ['all', ...mainCatsArray];
        this.mainCategories.forEach(cat => {
            const chip = document.createElement('div');
            chip.className = 'chip';
            if (cat === 'all') chip.classList.add('active');
            chip.setAttribute('data-main-cat', cat);
            chip.innerText = cat === 'all' ? 'الكل' : cat;
            chip.addEventListener('click', () => this.selectMainCategory(cat));
            this.mainContainer.appendChild(chip);
        });
    }

    updateSubChips(mainCat, subCatsArray) {
        if (!this.subContainer) return;
        if (mainCat === 'all' || !subCatsArray || subCatsArray.length === 0) {
            this.subContainer.style.display = 'none';
            this.currentSub = null;
            this.onSubSelect('all');
            return;
        }
        this.subContainer.style.display = 'flex';
        this.subContainer.innerHTML = '';
        const allChip = document.createElement('div');
        allChip.className = 'chip sub-active';
        allChip.setAttribute('data-sub', 'all');
        allChip.innerText = 'الكل';
        allChip.addEventListener('click', () => this.selectSubCategory('all'));
        this.subContainer.appendChild(allChip);
        subCatsArray.forEach(sub => {
            const chip = document.createElement('div');
            chip.className = 'chip';
            chip.setAttribute('data-sub', sub);
            chip.innerText = sub;
            chip.addEventListener('click', () => this.selectSubCategory(sub));
            this.subContainer.appendChild(chip);
        });
        this.currentSub = 'all';
        this.onSubSelect('all');
    }

    selectMainCategory(cat) {
        if (this.currentMain === cat) return;
        this.currentMain = cat;
        const chips = this.mainContainer.querySelectorAll('.chip');
        chips.forEach(chip => {
            const chipCat = chip.getAttribute('data-main-cat');
            if (chipCat === cat) chip.classList.add('active');
            else chip.classList.remove('active');
        });
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
    }

    selectSubCategory(sub) {
        if (this.currentSub === sub) return;
        this.currentSub = sub;
        const chips = this.subContainer.querySelectorAll('.chip');
        chips.forEach(chip => {
            const chipSub = chip.getAttribute('data-sub');
            if (chipSub === sub) chip.classList.add('sub-active');
            else chip.classList.remove('sub-active');
        });
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
}

