// ProductCard.js
import { CONFIG, escapeHtml, formatCurrency } from './config.js';

export class ProductCard {
    constructor(product, storageService, onCartUpdate) {
        this.product = product;
        this.storageService = storageService;
        this.onCartUpdate = onCartUpdate; // Callback للتواصل مع مدير السلة
        this.element = null;
        this.imageURL = null;
    }

    render(currentQuantity = 0) {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.dataset.id = this.product.id || '';
        card.dataset.name = this.product.name;
        card.dataset.category = this.product.category;

        const isAvailable = this.product.available !== false;
        const discountBadge = this.product.discount ? `<div class="discount-badge">${this.product.discount}</div>` : '';

        card.innerHTML = `
            <div class="image-container">
                ${discountBadge}
                <img src="${CONFIG.IMAGE_PLACEHOLDER}" class="product-image loading" alt="${escapeHtml(this.product.name)}" loading="lazy">
                ${!isAvailable ? '<div class="out-of-stock-overlay">غير متوفر حالياً</div>' : ''}
            </div>
            <div class="product-details">
                <span class="product-category">${escapeHtml(this.product.category)}</span>
                <h3 class="product-title">${escapeHtml(this.product.name)}</h3>
                <p class="product-description">${escapeHtml(this.product.description || '')}</p>
                <div class="product-footer">
                    <span class="product-price">${formatCurrency(this.product.price)}</span>
                    <div class="action-container">
                        ${isAvailable ? this._getActionBarHtml(currentQuantity) : '<span class="status-unavailable">منتهي</span>'}
                    </div>
                </div>
            </div>
        `;

        this.element = card;
        this._loadImage(card.querySelector('.product-image'));
        this._initEvents();

        return card;
    }

    _getActionBarHtml(quantity) {
        if (quantity > 0) {
            return `
                <div class="quantity-controls active">
                    <button class="btn-minus" aria-label="تقليل الكمية"><i class="fas fa-minus"></i></button>
                    <span class="quantity-value">${quantity}</span>
                    <button class="btn-plus" aria-label="زيادة الكمية"><i class="fas fa-plus"></i></button>
                </div>
            `;
        }
        return `
            <button class="btn-add-to-cart" aria-label="إضافة للسلة">
                <i class="fas fa-shopping-cart"></i> إضافة
            </button>
        `;
    }

    async _loadImage(imgElement) {
        if (!this.product.image || !this.product.image.startsWith('http')) {
            imgElement.src = CONFIG.IMAGE_PLACEHOLDER;
            imgElement.classList.remove('loading');
            return;
        }

        try {
            // محاولة جلب الصورة من التخزين المحلي الآمن
            let blob = await this.storageService.getImageBlob(this.product.image);
            
            if (!blob) {
                // إذا لم تكن مخزنة، يتم جلبها من الشبكة مع مهلة زمنية
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), CONFIG.IMAGE_LOADING_TIMEOUT);

                const response = await fetch(this.product.image, { signal: controller.signal });
                clearTimeout(timeoutId);

                if (response.ok) {
                    blob = await response.blob();
                    await this.storageService.saveImageBlob(this.product.image, blob);
                }
            }

            if (blob) {
                this.imageURL = URL.createObjectURL(blob);
                this.storageService.registerObjectURL(this.imageURL);
                imgElement.src = this.imageURL;
            } else {
                imgElement.src = CONFIG.IMAGE_PLACEHOLDER;
            }
        } catch (error) {
            console.warn(`[ProductCard] Failed to load image for ${this.product.name}`, error);
            imgElement.src = CONFIG.IMAGE_PLACEHOLDER;
        } finally {
            imgElement.classList.remove('loading');
        }
    }

    _initEvents() {
        if (!this.element) return;

        this.element.addEventListener('click', (e) => {
            const addToCartBtn = e.target.closest('.btn-add-to-cart');
            const plusBtn = e.target.closest('.btn-plus');
            const minusBtn = e.target.closest('.btn-minus');

            if (addToCartBtn) {
                this._updateQuantity(1);
            } else if (plusBtn) {
                this._updateQuantity(1);
            } else if (minusBtn) {
                this._updateQuantity(-1);
            }
        });
    }

    _updateQuantity(change) {
        if (this.onCartUpdate) {
            this.onCartUpdate(this.product, change);
        }
    }

    // تدمير آمن للمكون لفك الارتباطات ومنع تسريب الذاكرة
    destroy() {
        if (this.imageURL) {
            this.storageService.revokeObjectURL(this.imageURL);
        }
        if (this.element) {
            this.element.remove();
        }
    }
}
