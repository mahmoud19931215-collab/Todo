import { escapeHtml } from './config.js';

export class ProductCard {
    constructor(product, storage, onQuantityChange, initialQty = 0) {
        this.product    = product;
        this.storage    = storage;
        this.onQuantityChange = onQuantityChange;
        this.quantity   = initialQty;
        this.element    = null;
        this.qtyInput   = null;
        this.subtotalSpan = null;
        this.subtotalRow  = null;
        this.debounceTimer = null;

        // slider state
        this.images      = [];
        this.cur         = 0;          // صفحة حالية
        this._blobs      = {};         // url → objectURL (كاش في الذاكرة)
        this._track      = null;       // .sl-track
        this._slides     = [];         // كل .sl-slide
        this._dots       = [];         // كل .sl-dot
        this._counter    = null;       // span العداد
        this._dragging   = false;
        this._startX     = 0;
        this._moved      = false;
    }

    // ─── جمع روابط الصور ───────────────────────────────────────────
    _collectImages() {
        if (Array.isArray(this.product.images))
            return this.product.images.filter(u => u?.startsWith('http'));
        return [
            this.product.imageUrl,
            this.product.imageUrl2 || this.product.image_right,
            this.product.imageUrl3 || this.product.image_left,
        ].filter(u => u?.startsWith('http'));
    }

    // ─── render ────────────────────────────────────────────────────
    render() {
        this.images = this._collectImages();
        const n   = this.images.length;
        const has = n > 1;

        const card = document.createElement('div');
        card.className = 'product-card';
        card.setAttribute('data-name',  this.product.name);
        card.setAttribute('data-price', this.product.price);
        card.setAttribute('data-stock', this.product.stock || 999);

        // ── صورة/slider ──
        const imgBox = document.createElement('div');
        imgBox.className = 'sl-wrap' + (has ? ' sl-multi' : '');

        if (!has) {
            // صورة وحيدة — أبسط ممكن
            const img = this._makeImg(0);
            imgBox.appendChild(img);
            this._slides = [img];
        } else {
            // track يحتوي كل الصور مرصوفة
            const track = document.createElement('div');
            track.className = 'sl-track';
            track.style.width = n * 100 + '%';
            this._track = track;

            for (let i = 0; i < n; i++) {
                const slide = document.createElement('div');
                slide.className = 'sl-slide';
                slide.style.width = (100 / n) + '%';
                const img = this._makeImg(i);
                slide.appendChild(img);
                track.appendChild(slide);
                this._slides.push(slide);
            }

            imgBox.appendChild(track);

            // zones اليمين/اليسار (بدون HTML معقد)
            const zr = document.createElement('div');
            zr.className = 'sl-zone sl-zr';
            const zl = document.createElement('div');
            zl.className = 'sl-zone sl-zl';
            imgBox.appendChild(zr);
            imgBox.appendChild(zl);

            // نقاط
            const dotsWrap = document.createElement('div');
            dotsWrap.className = 'sl-dots';
            for (let i = 0; i < n; i++) {
                const d = document.createElement('span');
                d.className = 'sl-dot' + (i === 0 ? ' on' : '');
                dotsWrap.appendChild(d);
                this._dots.push(d);
            }
            imgBox.appendChild(dotsWrap);

            // عداد
            const ctr = document.createElement('div');
            ctr.className = 'sl-ctr';
            ctr.innerHTML = `<b class="sl-cn">1</b>/${n}`;
            this._counter = ctr.querySelector('.sl-cn');
            imgBox.appendChild(ctr);

            // أحداث السحب/اللمس
            this._bindDrag(imgBox);

            // zones
            zr.addEventListener('click', e => { e.stopPropagation(); this._go(this.cur - 1); });
            zl.addEventListener('click', e => { e.stopPropagation(); this._go(this.cur + 1); });

            // نقاط
            this._dots.forEach((d, i) =>
                d.addEventListener('click', e => { e.stopPropagation(); this._go(i); })
            );
        }

        // ── معلومات المنتج ──
        const info = document.createElement('div');
        info.className = 'product-info';
        const subtotalHtml = this.quantity > 0
            ? `<div class="item-subtotal">المجموع: <span class="subtotal-val">${(this.quantity * this.product.price).toLocaleString()}</span> ل.س</div>`
            : `<div class="item-subtotal" style="display:none">المجموع: <span class="subtotal-val">0</span> ل.س</div>`;

        info.innerHTML = `
            <div class="product-name">${escapeHtml(this.product.name)}</div>
            <div class="product-price">${this.product.price.toLocaleString()} ل.س</div>
            ${subtotalHtml}
            <div class="qty-controls">
                <button class="qty-btn inc-qty">+</button>
                <input type="number" class="qty-input" value="${this.quantity}"
                       min="0" max="${this.product.stock || 999}" step="1">
                <button class="qty-btn dec-qty">-</button>
            </div>`;

        card.appendChild(imgBox);
        card.appendChild(info);

        this.element      = card;
        this.qtyInput     = info.querySelector('.qty-input');
        this.subtotalSpan = info.querySelector('.subtotal-val');
        this.subtotalRow  = info.querySelector('.item-subtotal');

        // أحداث الكمية
        info.querySelector('.inc-qty').addEventListener('click', e => { e.stopPropagation(); this.changeQuantity(1); });
        info.querySelector('.dec-qty').addEventListener('click', e => { e.stopPropagation(); this.changeQuantity(-1); });
        this.qtyInput.addEventListener('change', e => {
            let v = parseInt(e.target.value) || 0;
            v = Math.min(this.product.stock || 999, Math.max(0, v));
            const d = v - this.quantity;
            if (d) { this.quantity = v; this.updateUI(); if (this.onQuantityChange) this.onQuantityChange(this.product.name, v, d); }
            this.qtyInput.value = this.quantity;
        });

        // تحميل الصور
        this._loadAll();
        this.updateUI();
        return card;
    }

    // ─── صنع عنصر img (placeholder فوري) ─────────────────────────
    _makeImg(index) {
        const img = document.createElement('img');
        img.className = 'sl-img';
        img.alt = escapeHtml(this.product.name);
        img.loading = 'lazy';
        // placeholder SVG خفيف (بدون fetch)
        img.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3C/svg%3E";
        img.dataset.index = index;
        return img;
    }

    // ─── تحميل كل الصور ───────────────────────────────────────────
    async _loadAll() {
        if (!this.images.length) { this._setPlaceholder(0); return; }
        // الصورة الأولى = أولوية
        await this._loadOne(0, true);
        // باقي الصور في الخلفية بدون انتظار
        for (let i = 1; i < this.images.length; i++) {
            this._loadOne(i, false);
        }
    }

    async _loadOne(index, urgent) {
        const url = this.images[index];
        if (!url) return;

        // لو عندنا objectURL جاهز
        if (this._blobs[url]) { this._applyImg(index, this._blobs[url]); return; }

        // IndexedDB cache
        try {
            const blob = await this.storage.getImageBlob(url);
            if (blob) {
                const ou = URL.createObjectURL(blob);
                this._blobs[url] = ou;
                this._applyImg(index, ou);
                return;
            }
        } catch (_) {}

        // تحميل مباشر
        try {
            // للصورة الأولى: ضع الرابط مباشرة بدون انتظار fetch
            if (urgent) this._applyImg(index, url);

            const res = await fetch(url, { mode: 'cors', cache: 'force-cache' });
            if (!res.ok) throw 0;
            const blob = await res.blob();
            const ou   = URL.createObjectURL(blob);
            this._blobs[url] = ou;
            this.storage.saveImageBlob(url, blob).catch(() => {});
            this._applyImg(index, ou);  // يحدّث لو الصورة المباشرة كانت أبطأ
        } catch (_) {
            if (!urgent) return;
            // fallback placeholder
            this._setPlaceholder(index);
        }
    }

    _applyImg(index, src) {
        // الصورة الوحيدة
        if (!this._track && this._slides[0]) {
            this._slides[0].src = src; return;
        }
        // داخل track
        const slide = this._slides[index];
        if (!slide) return;
        const img = slide.querySelector('.sl-img');
        if (img) img.src = src;
    }

    _setPlaceholder(index) {
        this._applyImg(index, 'https://via.placeholder.com/300?text=No+Image');
    }

    // ─── التنقل ────────────────────────────────────────────────────
    _go(to) {
        const n = this.images.length;
        if (n <= 1) return;
        const next = ((to % n) + n) % n;
        if (next === this.cur) return;
        this.cur = next;
        this._syncTrack(true);
        this._syncDots();
        this._syncCounter();
    }

    // translateX بالنسبة المئوية على الـ track
    // في RTL: الصورة 0 على اليمين، الصورة 1 بجانبها على اليسار
    // نحرك الـ track يساراً بـ (index × 100/n)%
    _syncTrack(animated) {
        if (!this._track) return;
        const pct = this.cur * (100 / this.images.length);
        this._track.style.transition = animated
            ? 'transform .28s cubic-bezier(.4,0,.2,1)'
            : 'none';
        // RTL: flex-direction:row (الصورة 0 على اليسار في DOM)
        // لذلك نحرك بـ translateX سالب
        this._track.style.transform = `translateX(-${pct}%)`;
    }

    _syncDots() {
        this._dots.forEach((d, i) => d.classList.toggle('on', i === this.cur));
    }

    _syncCounter() {
        if (this._counter) this._counter.textContent = this.cur + 1;
    }

    // ─── drag / swipe ──────────────────────────────────────────────
    _bindDrag(el) {
        // Mouse
        el.addEventListener('mousedown',  e => this._dragStart(e.clientX));
        window.addEventListener('mousemove', e => { if (this._dragging) this._dragMove(e.clientX); });
        window.addEventListener('mouseup',   e => { if (this._dragging) this._dragEnd(e.clientX); });

        // Touch
        el.addEventListener('touchstart', e => this._dragStart(e.touches[0].clientX), { passive: true });
        el.addEventListener('touchmove',  e => {
            if (!this._dragging) return;
            const dx = Math.abs(e.touches[0].clientX - this._startX);
            const dy = Math.abs(e.touches[0].clientY - (this._startY || 0));
            // اسمح بالسحب الأفقي فقط
            if (dx > dy && dx > 6) this._moved = true;
        }, { passive: true });
        el.addEventListener('touchend', e => {
            if (this._dragging) this._dragEnd(e.changedTouches[0].clientX);
        }, { passive: true });

        el.addEventListener('touchstart', e => { this._startY = e.touches[0].clientY; }, { passive: true });
    }

    _dragStart(x) {
        this._dragging = true;
        this._moved    = false;
        this._startX   = x;
    }

    _dragMove(x) {
        const dx = Math.abs(x - this._startX);
        if (dx > 6) this._moved = true;
    }

    _dragEnd(x) {
        this._dragging = false;
        if (!this._moved) return;
        const diff = this._startX - x;  // موجب = سحب يساراً = الصورة التالية
        if (Math.abs(diff) > 30) {
            diff > 0 ? this._go(this.cur + 1) : this._go(this.cur - 1);
        }
        this._moved = false;
    }

    // ─── UI ────────────────────────────────────────────────────────
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
            const v = Math.min(this.product.stock || 999, Math.max(0, this.quantity + delta));
            const d = v - this.quantity;
            if (d) {
                this.quantity = v;
                this.updateUI();
                this.element.classList.add('added');
                setTimeout(() => this.element.classList.remove('added'), 300);
                if (this.onQuantityChange) this.onQuantityChange(this.product.name, v, d);
            }
            this.debounceTimer = null;
        }, 150);
    }

    getQuantity()  { return this.quantity; }
    getProduct()   { return this.product;  }

    setQuantity(qty) {
        const v = Math.min(this.product.stock || 999, Math.max(0, qty));
        const d = v - this.quantity;
        this.quantity = v;
        this.updateUI();
        if (d && this.onQuantityChange) this.onQuantityChange(this.product.name, v, d);
    }
}
