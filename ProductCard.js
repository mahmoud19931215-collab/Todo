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
        // --- Slider state ---
        this.currentSlide = 0;
        this.images = [];
    }

    /** جمع كل روابط الصور المتاحة للمنتج */
    _collectImages() {
        const imgs = [];
        // دعم أنواع مختلفة من هيكل البيانات
        if (Array.isArray(this.product.images)) {
            this.product.images.forEach(url => { if (url) imgs.push(url); });
        } else {
            // الصور الثلاث: imageUrl, imageUrl2, imageUrl3 أو image_left/image_right
            const candidates = [
                this.product.imageUrl,
                this.product.imageUrl2 || this.product.image_right,
                this.product.imageUrl3 || this.product.image_left,
            ];
            candidates.forEach(url => { if (url) imgs.push(url); });
        }
        // تصفية الروابط غير الصالحة
        return imgs.filter(url => url && url.startsWith('http'));
    }

    render() {
        this.images = this._collectImages();
        const hasMultiple = this.images.length > 1;

        const uniqueId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
        const card = document.createElement('div');
        card.className = 'product-card';
        card.setAttribute('data-name', this.product.name);
        card.setAttribute('data-price', this.product.price);
        card.setAttribute('data-stock', this.product.stock || 999);

        const subtotalDisplay = this.quantity > 0
            ? `<div class="item-subtotal">المجموع: <span class="subtotal-val">${(this.quantity * this.product.price).toLocaleString()}</span> ل.س</div>`
            : `<div class="item-subtotal" style="display: none;">المجموع: <span class="subtotal-val">0</span> ل.س</div>`;

        const sliderDotsHtml = hasMultiple
            ? `<div class="slider-dots">
                ${this.images.map((_, i) => `<span class="slider-dot${i === 0 ? ' active' : ''}" data-index="${i}"></span>`).join('')}
               </div>`
            : '';

        const sliderArrowsHtml = hasMultiple
            ? `<button class="slider-arrow slider-prev" aria-label="السابق">&#8250;</button>
               <button class="slider-arrow slider-next" aria-label="التالي">&#8249;</button>`
            : '';

        card.innerHTML = `
            <div class="product-img-wrapper${hasMultiple ? ' has-slider' : ''}">
                <img class="product-img" id="${uniqueId}" 
                     src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Crect width='200' height='200' fill='%23f0f0f0'/%3E%3Ctext x='100' y='110' text-anchor='middle' fill='%23999' font-size='14'%3Eتحميل...%3C/text%3E%3C/svg%3E" 
                     alt="${escapeHtml(this.product.name)}"
                     loading="lazy">
                ${sliderArrowsHtml}
                ${sliderDotsHtml}
            </div>
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

        // أحداث السلايدر
        if (hasMultiple) {
            // أزرار السهام
            const prevBtn = card.querySelector('.slider-prev');
            const nextBtn = card.querySelector('.slider-next');
            if (prevBtn) prevBtn.addEventListener('click', (e) => { e.stopPropagation(); this.prevSlide(); });
            if (nextBtn) nextBtn.addEventListener('click', (e) => { e.stopPropagation(); this.nextSlide(); });

            // النقاط
            card.querySelectorAll('.slider-dot').forEach(dot => {
                dot.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.goToSlide(parseInt(dot.getAttribute('data-index')));
                });
            });

            // السحب باللمس (swipe)
            this._initTouchSwipe(card.querySelector('.product-img-wrapper'));
        }

        this.loadImage();
        this.updateUI();
        return card;
    }

    /** تهيئة السحب باللمس */
    _initTouchSwipe(wrapper) {
        if (!wrapper) return;
        let startX = 0;
        let isDragging = false;
        wrapper.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            isDragging = true;
        }, { passive: true });
        wrapper.addEventListener('touchend', (e) => {
            if (!isDragging) return;
            isDragging = false;
            const diff = startX - e.changedTouches[0].clientX;
            if (Math.abs(diff) > 40) {
                // في RTL: السحب يميناً = الصورة التالية
                diff > 0 ? this.nextSlide() : this.prevSlide();
            }
        }, { passive: true });
    }

    goToSlide(index) {
        if (!this.element || this.images.length <= 1) return;
        this.currentSlide = (index + this.images.length) % this.images.length;
        this._updateSliderUI();
        this._loadSlideImage(this.currentSlide);
    }

    nextSlide() { this.goToSlide(this.currentSlide + 1); }
    prevSlide() { this.goToSlide(this.currentSlide - 1); }

    _updateSliderUI() {
        if (!this.element) return;
        // تحديث النقاط
        this.element.querySelectorAll('.slider-dot').forEach((dot, i) => {
            dot.classList.toggle('active', i === this.currentSlide);
        });
        // تأثير الانتقال على الصورة
        if (this.imageElement) {
            this.imageElement.classList.add('slide-fade');
            setTimeout(() => this.imageElement && this.imageElement.classList.remove('slide-fade'), 280);
        }
    }

    async _loadSlideImage(index) {
        if (!this.imageElement || !this.images[index]) return;
        const url = this.images[index];
        // تحقق من الكاش أولاً
        let blob = null;
        try { blob = await this.storage.getImageBlob(url); } catch (e) {}
        if (blob) {
            const objUrl = URL.createObjectURL(blob);
            this.imageElement.src = objUrl;
            this.imageElement.onload = () => URL.revokeObjectURL(objUrl);
            this.imageElement.onerror = () => { URL.revokeObjectURL(objUrl); this.imageElement.src = url; };
        } else {
            this.imageElement.src = url;
            this.imageElement.onerror = () => this.setPlaceholderImage();
            // تخزين في الخلفية
            fetch(url, { mode: 'cors' }).then(r => r.blob()).then(b => this.storage.saveImageBlob(url, b)).catch(() => {});
        }
    }

    async loadImage() {
        if (!this.imageElement) return;
        // تحميل الصورة الأولى (الرئيسية)
        if (this.images.length === 0) { this.setPlaceholderImage(); return; }
        await this._loadSlideImage(0);
        // تحميل باقي الصور مسبقاً في الخلفية
        for (let i = 1; i < this.images.length; i++) {
            this._preloadImage(this.images[i]);
        }
    }

    async _preloadImage(url) {
        if (!url) return;
        try {
            const cached = await this.storage.getImageBlob(url);
            if (!cached) {
                const res = await fetch(url, { mode: 'cors' });
                if (res.ok) {
                    const blob = await res.blob();
                    await this.storage.saveImageBlob(url, blob);
                }
            }
        } catch (e) {}
    }

    async loadImageDirect() {
        const imageUrl = this.images[0];
        if (!imageUrl) { this.setPlaceholderImage(); return; }
        try {
            const res = await fetch(imageUrl, { mode: 'cors' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            await this.storage.saveImageBlob(imageUrl, blob);
            const url = URL.createObjectURL(blob);
            this.imageElement.src = url;
            this.imageElement.onload = () => URL.revokeObjectURL(url);
            this.imageElement.onerror = () => { URL.revokeObjectURL(url); this.setPlaceholderImage(); };
        } catch (err) {
            this.imageElement.src = imageUrl;
            this.imageElement.onerror = () => this.setPlaceholderImage();
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

    getQuantity() { return this.quantity; }

    setQuantity(qty) {
        const newQty = Math.min(this.product.stock || 999, Math.max(0, qty));
        const delta = newQty - this.quantity;
        this.quantity = newQty;
        this.updateUI();
        if (delta !== 0 && this.onQuantityChange) {
            this.onQuantityChange(this.product.name, this.quantity, delta);
        }
    }

    getProduct() { return this.product; }
}
