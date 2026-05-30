// ProductCard.js
import { CONFIG, escapeHtml } from './config.js';

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

        // حالة السلايدر
        this.images = [];
        this.currentIndex = 0;
        this.blobs = new Map();
        this.track = null;
        this.slides = [];
        this.dots = [];
        this.counterSpan = null;
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragMoved = false;

        this.loadingPromises = new Map();
        this.loadedUrls = new Set();
    }

    _collectImages() {
        if (Array.isArray(this.product.images)) {
            return this.product.images.filter(u => u && u.startsWith('http'));
        }
        return [
            this.product.imageUrl,
            this.product.imageUrl2 || this.product.image_right,
            this.product.imageUrl3 || this.product.image_left,
        ].filter(u => u && u.startsWith('http'));
    }

    render() {
        this.images = this._collectImages();
        const hasMultiple = this.images.length > 1;

        const card = document.createElement('div');
        card.className = 'product-card';
        card.setAttribute('data-name', this.product.name);
        card.setAttribute('data-price', this.product.price);
        card.setAttribute('data-stock', this.product.stock || 999);

        const imgBox = document.createElement('div');
        imgBox.className = `sl-wrap${hasMultiple ? ' sl-multi' : ''}`;

        if (!hasMultiple) {
            const img = this._createImageElement(0);
            imgBox.appendChild(img);
            this.slides = [img];
        } else {
            this.track = document.createElement('div');
            this.track.className = 'sl-track';
            const slideWidthPercent = 100 / this.images.length;
            this.track.style.width = `${this.images.length * 100}%`;

            for (let i = 0; i < this.images.length; i++) {
                const slide = document.createElement('div');
                slide.className = 'sl-slide';
                slide.style.width = `${slideWidthPercent}%`;
                const img = this._createImageElement(i);
                slide.appendChild(img);
                this.track.appendChild(slide);
                this.slides.push(slide);
            }
            imgBox.appendChild(this.track);

            const rightZone = this._createZone('sl-zr');
            const leftZone = this._createZone('sl-zl');
            imgBox.appendChild(rightZone);
            imgBox.appendChild(leftZone);

            rightZone.addEventListener('click', (e) => {
                e.stopPropagation();
                this.goTo(this.currentIndex + 1);
            });
            leftZone.addEventListener('click', (e) => {
                e.stopPropagation();
                this.goTo(this.currentIndex - 1);
            });

            const dotsContainer = document.createElement('div');
            dotsContainer.className = 'sl-dots';
            for (let i = 0; i < this.images.length; i++) {
                const dot = document.createElement('span');
                dot.className = i === 0 ? 'sl-dot on' : 'sl-dot';
                dot.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.goTo(i);
                });
                dotsContainer.appendChild(dot);
                this.dots.push(dot);
            }
            imgBox.appendChild(dotsContainer);

            const counterDiv = document.createElement('div');
            counterDiv.className = 'sl-ctr';
            const counterBold = document.createElement('b');
            counterBold.className = 'sl-cn';
            counterBold.textContent = '1';
            counterDiv.appendChild(counterBold);
            counterDiv.appendChild(document.createTextNode(`/${this.images.length}`));
            this.counterSpan = counterBold;
            imgBox.appendChild(counterDiv);

            this._bindDrag(imgBox);
        }

        const info = document.createElement('div');
        info.className = 'product-info';
        const subtotalDisplay = this.quantity > 0
            ? `<div class="item-subtotal">المجموع: <span class="subtotal-val">${(this.quantity * this.product.price).toLocaleString()}</span> ل.س</div>`
            : `<div class="item-subtotal" style="display:none">المجموع: <span class="subtotal-val">0</span> ل.س</div>`;

        info.innerHTML = `
            <div class="product-name">${escapeHtml(this.product.name)}</div>
            <div class="product-price">${this.product.price.toLocaleString()} ل.س</div>
            ${subtotalDisplay}
            <div class="qty-controls">
                <button class="qty-btn inc-qty">+</button>
                <input type="number" class="qty-input" value="${this.quantity}" min="0" max="${this.product.stock || 999}" step="1">
                <button class="qty-btn dec-qty">-</button>
            </div>
        `;

        card.appendChild(imgBox);
        card.appendChild(info);

        this.element = card;
        this.qtyInput = info.querySelector('.qty-input');
        this.subtotalSpan = info.querySelector('.subtotal-val');
        this.subtotalRow = info.querySelector('.item-subtotal');

        const incBtn = info.querySelector('.inc-qty');
        const decBtn = info.querySelector('.dec-qty');
        incBtn.addEventListener('click', (e) => { e.stopPropagation(); this.changeQuantity(1); });
        decBtn.addEventListener('click', (e) => { e.stopPropagation(); this.changeQuantity(-1); });
        this.qtyInput.addEventListener('change', (e) => {
            let val = parseInt(e.target.value, 10);
            if (isNaN(val)) val = 0;
            val = Math.min(this.product.stock || 999, Math.max(0, val));
            const diff = val - this.quantity;
            if (diff !== 0) {
                this.quantity = val;
                this.updateUI();
                if (this.onQuantityChange) this.onQuantityChange(this.product.name, val, diff);
            }
            this.qtyInput.value = this.quantity;
        });

        this._loadAllImages();
        this.updateUI();
        return card;
    }

    _createImageElement(index) {
        const img = document.createElement('img');
        img.className = 'sl-img';
        img.alt = escapeHtml(this.product.name);
        img.loading = 'lazy';
        // إصلاح: استخدام placeholder من CONFIG بدلاً من SVG فارغ
        img.src = CONFIG.IMAGE_PLACEHOLDER;
        img.dataset.index = index;
        return img;
    }

    _createZone(className) {
        const zone = document.createElement('div');
        zone.className = `sl-zone ${className}`;
        return zone;
    }

    async _loadAllImages() {
        if (this.images.length === 0) {
            this._setPlaceholder(0);
            return;
        }
        await this._loadOneImage(0, true);
        for (let i = 1; i < this.images.length; i++) {
            this._loadOneImage(i, false);
        }
    }

    async _loadOneImage(index, urgent) {
        const url = this.images[index];
        if (!url || this.loadedUrls.has(url)) return;

        if (this.loadingPromises.has(url)) {
            const blobUrl = await this.loadingPromises.get(url);
            if (blobUrl) this._applyImage(index, blobUrl);
            return;
        }

        const loadPromise = (async () => {
            try {
                const blob = await this.storage.getImageBlob(url);
                if (blob) {
                    const objUrl = URL.createObjectURL(blob);
                    this.blobs.set(url, objUrl);
                    return objUrl;
                }
            } catch (e) {}

            try {
                const response = await fetch(url, { mode: 'cors', cache: 'force-cache' });
                if (!response.ok) throw new Error('HTTP error');
                const blob = await response.blob();
                const objUrl = URL.createObjectURL(blob);
                this.blobs.set(url, objUrl);
                this.storage.saveImageBlob(url, blob).catch(() => {});
                return objUrl;
            } catch (err) {
                return null;
            }
        })();

        this.loadingPromises.set(url, loadPromise);
        const finalUrl = await loadPromise;
        if (finalUrl) {
            this.loadedUrls.add(url);
            this._applyImage(index, finalUrl);
        } else if (urgent) {
            this._setPlaceholder(index);
        }
        this.loadingPromises.delete(url);
    }

    _applyImage(index, src) {
        const slide = this.slides[index];
        if (!slide) return;
        const img = slide.querySelector('.sl-img') || slide;
        if (img && img.src !== src) {
            img.src = src;
        }
    }

    _setPlaceholder(index) {
        this._applyImage(index, CONFIG.IMAGE_PLACEHOLDER);
    }

    goTo(nextIndex) {
        const n = this.images.length;
        if (n <= 1) return;
        let newIndex = nextIndex % n;
        if (newIndex < 0) newIndex += n;
        if (newIndex === this.currentIndex) return;
        this.currentIndex = newIndex;
        this._syncTrack(true);
        this._syncDots();
        this._syncCounter();
    }

    _syncTrack(animated) {
        if (!this.track) return;
        const percent = this.currentIndex * (100 / this.images.length);
        this.track.style.transition = animated
            ? 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)'
            : 'none';
        this.track.style.transform = `translateX(-${percent}%)`;
    }

    _syncDots() {
        for (let i = 0; i < this.dots.length; i++) {
            if (i === this.currentIndex) this.dots[i].classList.add('on');
            else this.dots[i].classList.remove('on');
        }
    }

    _syncCounter() {
        if (this.counterSpan) this.counterSpan.textContent = this.currentIndex + 1;
    }

    _bindDrag(el) {
        const handleStart = (clientX) => {
            this.isDragging = true;
            this.dragMoved = false;
            this.dragStartX = clientX;
            if (this.track) this.track.style.transition = 'none';
        };
        const handleMove = (clientX) => {
            if (!this.isDragging) return;
            const dx = Math.abs(clientX - this.dragStartX);
            if (dx > 6) this.dragMoved = true;
        };
        const handleEnd = (clientX) => {
            if (!this.isDragging) return;
            this.isDragging = false;
            if (this.dragMoved) {
                const diff = this.dragStartX - clientX;
                if (Math.abs(diff) > 30) {
                    if (diff > 0) this.goTo(this.currentIndex + 1);
                    else this.goTo(this.currentIndex - 1);
                }
                this.dragMoved = false;
            }
            if (this.track) this._syncTrack(true);
        };

        el.addEventListener('mousedown', (e) => handleStart(e.clientX));
        window.addEventListener('mousemove', (e) => { if (this.isDragging) handleMove(e.clientX); });
        window.addEventListener('mouseup', (e) => { if (this.isDragging) handleEnd(e.clientX); });

        el.addEventListener('touchstart', (e) => handleStart(e.touches[0].clientX), { passive: true });
        el.addEventListener('touchmove', (e) => {
            if (!this.isDragging) return;
            handleMove(e.touches[0].clientX);
        }, { passive: true });
        el.addEventListener('touchend', (e) => {
            if (this.isDragging) handleEnd(e.changedTouches[0].clientX);
        });
    }

    updateUI() {
        if (this.qtyInput) this.qtyInput.value = this.quantity;
        if (this.subtotalSpan) {
            if (this.quantity > 0) {
                this.subtotalSpan.innerText = (this.quantity * this.product.price).toLocaleString();
                if (this.subtotalRow) this.subtotalRow.style.display = 'block';
            } else {
                if (this.subtotalRow) this.subtotalRow.style.display = 'none';
            }
        }
    }

    changeQuantity(delta) {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            const newQty = Math.min(this.product.stock || 999, Math.max(0, this.quantity + delta));
            const diff = newQty - this.quantity;
            if (diff !== 0) {
                this.quantity = newQty;
                this.updateUI();
                if (this.element) {
                    this.element.classList.add('added');
                    setTimeout(() => this.element.classList.remove('added'), 300);
                }
                if (this.onQuantityChange) {
                    this.onQuantityChange(this.product.name, newQty, diff);
                }
            }
            this.debounceTimer = null;
        }, 150);
    }

    getQuantity() { return this.quantity; }
    getProduct() { return this.product; }

    setQuantity(qty) {
        const newQty = Math.min(this.product.stock || 999, Math.max(0, qty));
        const diff = newQty - this.quantity;
        this.quantity = newQty;
        this.updateUI();
        if (diff !== 0 && this.onQuantityChange) {
            this.onQuantityChange(this.product.name, newQty, diff);
        }
    }

    destroy() {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        for (const [_, objUrl] of this.blobs.entries()) {
            URL.revokeObjectURL(objUrl);
        }
        this.blobs.clear();
        this.loadingPromises.clear();
        this.loadedUrls.clear();
        if (this.element) this.element.remove();
    }
}
