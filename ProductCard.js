import { escapeHtml } from './config.js';

export class ProductCard {
    constructor(product, storage, onQuantityChange, initialQty = 0) {
        this.product = product;
        this.storage = storage;
        this.onQuantityChange = onQuantityChange;
        this.quantity = initialQty;
        this.element = null;
        this.qtyInput = null;
        this.subtotalSpan = null;
        this.subtotalRow = null;
        this.debounceTimer = null;
        this.imageElement = null;
    }

    render() {
        const uniqueId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
        const card = document.createElement('div');
        card.className = 'product-card';
        card.setAttribute('data-name', this.product.name);
        card.setAttribute('data-price', this.product.price);
        card.setAttribute('data-stock', this.product.stock || 999);

        const subtotalDisplay = this.quantity > 0
            ? `<div class="item-subtotal">المجموع: <span class="subtotal-val">${(this.quantity * this.product.price).toLocaleString()}</span> ل.س</div>`
            : `<div class="item-subtotal" style="display: none;">المجموع: <span class="subtotal-val">0</span> ل.س</div>`;

        card.innerHTML = `
            <img class="product-img" id="${uniqueId}" 
                 src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Crect width='200' height='200' fill='%23f0f0f0'/%3E%3Ctext x='100' y='110' text-anchor='middle' fill='%23999' font-size='14'%3Eتحميل...%3C/text%3E%3C/svg%3E" 
                 alt="${escapeHtml(this.product.name)}"
                 loading="lazy">
            <div class="product-info">
                <div class="product-name">${escapeHtml(this.product.name)}</div>
                <div class="product-price">${this.product.price.toLocaleString()} ل.س</div>
                ${subtotalDisplay}
                <div class="qty-controls">
                    <button class="qty-btn inc-qty">+</button>
                    <input type="number" class="qty-input" value="${this.quantity}" min="0" max="${this.product.stock || 999}" step="1">
                    <button class="qty-btn dec-qty">-</button>
                </div>
            </div>
        `;

        this.element = card;
        this.qtyInput = card.querySelector('.qty-input');
        this.subtotalSpan = card.querySelector('.subtotal-val');
        this.subtotalRow = card.querySelector('.item-subtotal');
        this.imageElement = card.querySelector(`#${uniqueId}`);

        const incBtn = card.querySelector('.inc-qty');
        const decBtn = card.querySelector('.dec-qty');
        
        incBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.changeQuantity(1);
        });
        decBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.changeQuantity(-1);
        });

        this.qtyInput.addEventListener('change', (e) => {
            let newVal = parseInt(e.target.value);
            if (isNaN(newVal)) newVal = 0;
            const maxStock = this.product.stock || 999;
            newVal = Math.min(maxStock, Math.max(0, newVal));
            const delta = newVal - this.quantity;
            if (delta !== 0) {
                this.quantity = newVal;
                this.updateUI();
                if (this.onQuantityChange) {
                    this.onQuantityChange(this.product.name, this.quantity, delta);
                }
            }
            this.qtyInput.value = this.quantity;
        });

        this.loadImage();
        this.updateUI();
        return card;
    }

    async loadImage() {
        if (!this.imageElement) return;
        const imageUrl = this.product.imageUrl;
        if (!imageUrl) {
            this.setPlaceholderImage();
            return;
        }

        // محاولة الحصول من الكاش
        let cachedBlob = null;
        try {
            cachedBlob = await this.storage.getImageBlob(imageUrl);
        } catch (e) {
            console.warn("Error getting cached blob", e);
        }

        if (cachedBlob) {
            const url = URL.createObjectURL(cachedBlob);
            this.imageElement.src = url;
            this.imageElement.onload = () => URL.revokeObjectURL(url);
            this.imageElement.onerror = () => {
                URL.revokeObjectURL(url);
                this.loadImageDirect();
            };
            return;
        }

        // تحميل مباشر مع تخزين
        this.loadImageDirect();
    }

    async loadImageDirect() {
        const imageUrl = this.product.imageUrl;
        if (!imageUrl) {
            this.setPlaceholderImage();
            return;
        }

        try {
            const res = await fetch(imageUrl, { mode: 'cors' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            await this.storage.saveImageBlob(imageUrl, blob);
            const url = URL.createObjectURL(blob);
            this.imageElement.src = url;
            this.imageElement.onload = () => URL.revokeObjectURL(url);
            this.imageElement.onerror = () => {
                URL.revokeObjectURL(url);
                this.setPlaceholderImage();
            };
        } catch (err) {
            console.warn(`فشل تحميل الصورة: ${imageUrl}`, err);
            this.imageElement.src = imageUrl;
            this.imageElement.onerror = () => {
                this.setPlaceholderImage();
            };
        }
    }

    setPlaceholderImage() {
        if (this.imageElement) {
            this.imageElement.src = 'https://via.placeholder.com/300?text=No+Image';
        }
    }

    updateUI() {
        this.qtyInput.value = this.quantity;
        if (this.quantity > 0) {
            const subtotal = this.quantity * this.product.price;
            this.subtotalSpan.innerText = subtotal.toLocaleString();
            this.subtotalRow.style.display = 'block';
        } else {
            this.subtotalRow.style.display = 'none';
        }
    }

    changeQuantity(delta) {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            const newVal = this.quantity + delta;
            const maxStock = this.product.stock || 999;
            if (newVal >= 0 && newVal <= maxStock) {
                this.quantity = newVal;
                this.updateUI();
                this.element.classList.add('added');
                setTimeout(() => this.element.classList.remove('added'), 300);
                if (this.onQuantityChange) {
                    this.onQuantityChange(this.product.name, this.quantity, delta);
                }
            }
            this.debounceTimer = null;
        }, 150);
    }

    getQuantity() {
        return this.quantity;
    }

    setQuantity(qty) {
        const newQty = Math.min(this.product.stock || 999, Math.max(0, qty));
        const delta = newQty - this.quantity;
        this.quantity = newQty;
        this.updateUI();
        if (delta !== 0 && this.onQuantityChange) {
            this.onQuantityChange(this.product.name, this.quantity, delta);
        }
    }

    getProduct() {
        return this.product;
    }
}



