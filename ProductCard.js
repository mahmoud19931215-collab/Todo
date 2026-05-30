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
        this.currentSlide = 0;
        this.images = [];
        this._blobUrls = {};   // كاش محلي للـ blob URLs لتجنب إعادة التحميل
    }

    _collectImages() {
        const imgs = [];
        if (Array.isArray(this.product.images)) {
            this.product.images.forEach(url => { if (url) imgs.push(url); });
        } else {
            [
                this.product.imageUrl,
                this.product.imageUrl2 || this.product.image_right,
                this.product.imageUrl3 || this.product.image_left,
            ].forEach(url => { if (url) imgs.push(url); });
        }
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
            : `<div class="item-subtotal" style="display:none;">المجموع: <span class="subtotal-val">0</span> ل.س</div>`;

        // النقاط فقط — بدون أزرار سهام
        const dotsHtml = hasMultiple
            ? `<div class="slider-dots">${this.images.map((_, i) =>
                `<span class="slider-dot${i === 0 ? ' active' : ''}" data-index="${i}"></span>`
              ).join('')}</div>`
            : '';

        // مؤشر الصورة الحالية (1/3)
        const counterHtml = hasMultiple
            ? `<div class="slider-counter"><span class="slider-current">1</span>/<span class="slider-total">${this.images.length}</span></div>`
            : '';

        card.innerHTML = `
            <div class="product-img-wrapper${hasMultiple ? ' has-slider' : ''}">
                <img class="product-img" id="${uniqueId}"
                     src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='200' height='200' fill='%23f0f0f0'/%3E%3C/svg%3E"
                     alt="${escapeHtml(this.product.name)}" loading="lazy">
                ${hasMultiple ? `<div class="slider-zone zone-prev" aria-label="السابق"></div><div class="slider-zone zone-next" aria-label="التالي"></div>` : ''}
                ${dotsHtml}
                ${counterHtml}
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

        // أزرار الكمية
        card.querySelector('.inc-qty').addEventListener('click', e => { e.stopPropagation(); this.changeQuantity(1); });
        card.querySelector('.dec-qty').addEventListener('click', e => { e.stopPropagation(); this.changeQuantity(-1); });
        this.qtyInput.addEventListener('change', e => {
            let v = parseInt(e.target.value);
            if (isNaN(v)) v = 0;
            const max = this.product.stock || 999;
            v = Math.min(max, Math.max(0, v));
            const delta = v - this.quantity;
            if (delta !== 0) { this.quantity = v; this.updateUI(); if (this.onQuantityChange) this.onQuantityChange(this.product.name, this.quantity, delta); }
            this.qtyInput.value = this.quantity;
        });

        if (hasMultiple) {
            // Zones اليمين واليسار
            card.querySelector('.zone-prev').addEventListener('click', e => { e.stopPropagation(); this.prevSlide(); });
            card.querySelector('.zone-next').addEventListener('click', e => { e.stopPropagation(); this.nextSlide(); });

            // النقاط
            card.querySelectorAll('.slider-dot').forEach(dot => {
                dot.addEventListener('click', e => { e.stopPropagation(); this.goToSlide(+dot.dataset.index); });
            });

            // Swipe
            this._initSwipe(card.querySelector('.product-img-wrapper'));
        }

        this.loadImage();
        this.updateUI();
        return card;
    }

    _initSwipe(el) {
        if (!el) return;
        let sx = 0, sy = 0, moving = false;
        el.addEventListener('touchstart', e => {
            sx = e.touches[0].clientX;
            sy = e.touches[0].clientY;
            moving = false;
        }, { passive: true });
        el.addEventListener('touchmove', e => {
            // منع scroll الصفحة لو كان السحب أفقي أكثر من عمودي
            const dx = Math.abs(e.touches[0].clientX - sx);
            const dy = Math.abs(e.touches[0].clientY - sy);
            if (dx > dy && dx > 8) { moving = true; }
        }, { passive: true });
        el.addEventListener('touchend', e => {
            const diff = sx - e.changedTouches[0].clientX;
            if (moving && Math.abs(diff) > 25) {
                diff > 0 ? this.nextSlide() : this.prevSlide();
            }
            moving = false;
        }, { passive: true });
    }

    goToSlide(index) {
        if (!this.element || this.images.length <= 1) return;
        const prev = this.currentSlide;
        this.currentSlide = ((index % this.images.length) + this.images.length) % this.images.length;
        if (prev === this.currentSlide) return;
        const dir = this.currentSlide > prev ? 'left' : 'right';
        this._animateSlide(dir);
        this._updateDots();
        this._updateCounter();
        this._showSlideImage(this.currentSlide);
    }

    nextSlide() { this.goToSlide(this.currentSlide + 1); }
    prevSlide() { this.goToSlide(this.currentSlide - 1); }

    _animateSlide(dir) {
        if (!this.imageElement) return;
        const img = this.imageElement;
        img.style.transition = 'none';
        img.style.transform = dir === 'left' ? 'translateX(-12%)' : 'translateX(12%)';
        img.style.opacity = '0.3';
        // force reflow
        img.offsetHeight;
        img.style.transition = 'transform 0.22s cubic-bezier(0.25,0.46,0.45,0.94), opacity 0.18s ease';
        img.style.transform = 'translateX(0)';
        img.style.opacity = '1';
    }

    _updateDots() {
        if (!this.element) return;
        this.element.querySelectorAll('.slider-dot').forEach((d, i) =>
            d.classList.toggle('active', i === this.currentSlide)
        );
    }

    _updateCounter() {
        const cur = this.element?.querySelector('.slider-current');
        if (cur) cur.textContent = this.currentSlide + 1;
    }

    async _showSlideImage(index) {
        if (!this.imageElement || !this.images[index]) return;
        const url = this.images[index];
        // لو عندنا blob URL جاهز في الكاش المحلي، استخدمه مباشرة
        if (this._blobUrls[url]) {
            this.imageElement.src = this._blobUrls[url];
            return;
        }
        // تحقق IndexedDB
        let blob = null;
        try { blob = await this.storage.getImageBlob(url); } catch (e) {}
        if (blob) {
            const objUrl = URL.createObjectURL(blob);
            this._blobUrls[url] = objUrl;
            this.imageElement.src = objUrl;
            return;
        }
        // تحميل مباشر
        this.imageElement.src = url;
        fetch(url, { mode: 'cors' }).then(r => r.blob()).then(b => {
            this.storage.saveImageBlob(url, b).catch(() => {});
            const objUrl = URL.createObjectURL(b);
            this._blobUrls[url] = objUrl;
        }).catch(() => {});
    }

    async loadImage() {
        if (!this.imageElement) return;
        if (this.images.length === 0) { this.setPlaceholderImage(); return; }
        await this._showSlideImage(0);
        // preload الباقي
        for (let i = 1; i < this.images.length; i++) this._preloadImage(this.images[i]);
    }

    async _preloadImage(url) {
        if (!url || this._blobUrls[url]) return;
        try {
            let blob = await this.storage.getImageBlob(url);
            if (!blob) {
                const res = await fetch(url, { mode: 'cors' });
                if (res.ok) { blob = await res.blob(); await this.storage.saveImageBlob(url, blob); }
            }
            if (blob) this._blobUrls[url] = URL.createObjectURL(blob);
        } catch (e) {}
    }

    setPlaceholderImage() {
        if (this.imageElement) this.imageElement.src = 'https://via.placeholder.com/300?text=No+Image';
    }

    updateUI() {
        this.qtyInput.value = this.quantity;
        if (this.quantity > 0) {
            this.subtotalSpan.innerText = (this.quantity * this.product.price).toLocaleString();
            this.subtotalRow.style.display = 'block';
        } else {
            this.subtotalRow.style.display = 'none';
        }
    }

    changeQuantity(delta) {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            const newVal = this.quantity + delta;
            const max = this.product.stock || 999;
            if (newVal >= 0 && newVal <= max) {
                this.quantity = newVal;
                this.updateUI();
                this.element.classList.add('added');
                setTimeout(() => this.element.classList.remove('added'), 300);
                if (this.onQuantityChange) this.onQuantityChange(this.product.name, this.quantity, delta);
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
        if (delta !== 0 && this.onQuantityChange) this.onQuantityChange(this.product.name, this.quantity, delta);
    }

    getProduct() { return this.product; }
}
