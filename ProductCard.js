// ProductsGrid.js
import { CONFIG } from './config.js';
import { ProductCard } from './ProductCard.js';

export class ProductsGrid {
    constructor(containerId, storageService, onCartUpdate) {
        this.container = document.getElementById(containerId);
        this.storageService = storageService;
        this.onCartUpdate = onCartUpdate;
        
        this.allProducts = [];
        this.filteredProducts = [];
        this.activeCards = [];
        
        this.currentCategory = 'all';
        this.searchQuery = '';
        this.currentPage = 1;
    }

    setProducts(products) {
        this.allProducts = Array.isArray(products) ? products : [];
        this.applyFilterAndSearch();
    }

    setCategory(category) {
        this.currentCategory = category || 'all';
        this.currentPage = 1;
        this.applyFilterAndSearch();
    }

    setSearch(query) {
        this.searchQuery = (query || '').toLowerCase().trim();
        this.currentPage = 1;
        this.applyFilterAndSearch();
    }

    applyFilterAndSearch() {
        this.filteredProducts = this.allProducts.filter(product => {
            const matchesCategory = this.currentCategory === 'all' || product.category === this.currentCategory;
            const matchesSearch = !this.searchQuery || 
                product.name.toLowerCase().includes(this.searchQuery) || 
                (product.description && product.description.toLowerCase().includes(this.searchQuery));
            return matchesCategory && matchesSearch;
        });

        this.render();
    }

    render(cartMap = {}) {
        if (!this.container) return;

        // تدمير الكروت السابقة لتنظيف الذاكرة بشكل سليم
        this.activeCards.forEach(card => card.destroy());
        this.activeCards = [];

        if (this.filteredProducts.length === 0) {
            this.container.innerHTML = `
                <div class="empty-grid-state">
                    <i class="fas fa-box-open"></i>
                    <p>لم يتم العثور على منتجات مطابقة لمواصفات البحث.</p>
                </div>
            `;
            this._renderPagination(0);
            return;
        }

        this.container.innerHTML = '';
        
        // حسابات الترقيم (Pagination) هندسياً
        const startIndex = (this.currentPage - 1) * CONFIG.ITEMS_PER_PAGE;
        const endIndex = Math.min(startIndex + CONFIG.ITEMS_PER_PAGE, this.filteredProducts.length);
        const pageItems = this.filteredProducts.slice(startIndex, endIndex);

        const fragment = document.createDocumentFragment();

        pageItems.forEach(product => {
            const currentQty = cartMap[product.name] ? cartMap[product.name].quantity : 0;
            const cardComponent = new ProductCard(product, this.storageService, this.onCartUpdate);
            this.activeCards.push(cardComponent);
            fragment.appendChild(cardComponent.render(currentQty));
        });

        this.container.appendChild(fragment);
        this._renderPagination(this.filteredProducts.length);
    }

    _renderPagination(totalItems) {
        let paginationContainer = document.getElementById('paginationControls');
        
        if (totalItems <= CONFIG.ITEMS_PER_PAGE) {
            if (paginationContainer) paginationContainer.innerHTML = '';
            return;
        }

        if (!paginationContainer) {
            paginationContainer = document.createElement('div');
            paginationContainer.id = 'paginationControls';
            paginationContainer.className = 'pagination-container';
            this.container.after(paginationContainer);
        }

        const totalPages = Math.ceil(totalItems / CONFIG.ITEMS_PER_PAGE);
        let html = '';

        html += `
            <button class="pagination-btn" ${this.currentPage === 1 ? 'disabled' : ''} data-page="${this.currentPage - 1}">
                <i class="fas fa-chevron-right"></i> السابق
            </button>
        `;

        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= this.currentPage - 1 && i <= this.currentPage + 1)) {
                html += `
                    <button class="pagination-btn num-btn ${this.currentPage === i ? 'active' : ''}" data-page="${i}">
                        ${i}
                    </button>
                `;
            } else if (i === 2 || i === totalPages - 1) {
                html += `<span class="pagination-dots">...</span>`;
            }
        }

        html += `
            <button class="pagination-btn" ${this.currentPage === totalPages ? 'disabled' : ''} data-page="${this.currentPage + 1}">
                التالي <i class="fas fa-chevron-left"></i>
            </button>
        `;

        paginationContainer.innerHTML = html;

        // ميكانيكية التنقل الآمنة لمنع تعليق المتصفح
        paginationContainer.onclick = (e) => {
            const btn = e.target.closest('.pagination-btn');
            if (btn && !btn.hasAttribute('disabled')) {
                const targetPage = parseInt(btn.dataset.page, 10);
                if (targetPage && targetPage !== this.currentPage) {
                    this.currentPage = targetPage;
                    const savedCart = this.storageService.loadCart();
                    this.render(savedCart);
                    window.scrollTo({ top: this.container.offsetTop - 100, behavior: 'smooth' });
                }
            }
        };
    }

    renderSkeletons() {
        if (!this.container) return;
        this.container.innerHTML = '';
        const fragment = document.createDocumentFragment();
        
        for (let i = 0; i < CONFIG.ITEMS_PER_PAGE; i++) {
            const skeleton = document.createElement('div');
            skeleton.className = 'product-card skeleton-card';
            skeleton.innerHTML = `
                <div class="image-container skeleton"></div>
                <div class="product-details">
                    <div class="skeleton skeleton-text line-sm"></div>
                    <div class="skeleton skeleton-text line-md"></div>
                    <div class="skeleton skeleton-text line-lg"></div>
                    <div class="product-footer">
                        <div class="skeleton skeleton-text line-price"></div>
                        <div class="skeleton skeleton-btn"></div>
                    </div>
                </div>
            `;
            fragment.appendChild(skeleton);
        }
        this.container.appendChild(fragment);
    }
}
