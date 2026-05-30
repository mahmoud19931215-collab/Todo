import { escapeHtml } from './config.js';

// ─── IntersectionObserver مشترك لكل البطاقات ───────────────────
// بدل إنشاء observer لكل بطاقة، observer واحد يراقب الجميع
const _imgObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
        if (entry.isIntersecting) {
            const card = entry.target._cardInstance;
            if (card) {
                card._loadAll();
                _imgObserver.unobserve(entry.target);
            }
        }
    }
}, {
    rootMargin: '150px',   // يبدأ التحميل قبل ظهور البطاقة بـ 150px
    threshold: 0
});

export class ProductCard {
    constructor(product, storage, onQuantityChange, initialQty = 0) {
        this.product          = product;
        this.storage          = storage;
        this.onQuantityChange = onQuantityChange;
        this.quantity         = initialQty;

        // عناصر DOM
        this.element      = null;
        this.qtyInput     = null;
        this.subtotalSpan = null;
        this.subtotalRow  = null;

        // slider
        this.images   = [];
        this.cur      = 0;
        this._blobs   = {};      // url → objectURL
        this._track   = null;
        this._slides  = [];
        this._dots    = [];
        this._counter = null;

        // drag
        this._dragActive = false;
        this._startX     = 0;
        this._startY     = 0;
        this._moved      = false;

        // debounce للكمية
        this._qtyTimer = null;

        // مرجع لـ handler الـ mouse على window (لإزالته لاحقاً)
        this._onMouseMove = null;
        this._onMouseUp   = null;
    }

    // ─── جمع روابط الصور ───────────────────────────────────────
    _collectImages() {
        if (Array.isArray(this.product.images))
            return this.product.images.filter(u => u?.startsWith('http'));
        return [
            this.product.imageUrl,
            this.product.imageUrl2 || this.product.image_right,
            this.product.imageUrl3 || this.product.image_left,
        ].filter(u => u?.startsWith('http'));
    }

    // ─── render ─────────────────────────────────────────────────
    render() {
        this.images = this._collectImages();
        const n   = this.images.length;
        const has = n > 1;

        const card = document.createElement('div');
        card.className = 'product-card';
        card.setAttribute('data-name',  this.product.name);
        card.setAttribute('data-price', this.product.price);
        card.setAttribute('data-stock', this.product.stock || 999);

        // ── منطقة الصورة ──
        const imgBox = document.createElement('div');
        imgBox.className = 'sl-wrap' + (has ? ' sl-multi' : '');

        if (!has) {
            // ─ صورة وحيدة ─
            const img = this._makeImg(0);
            img.className = 'sl-img sl-single';
            imgBox.appendChild(img);
            this._slides = [img];
        } else {
            // ─ track متعدد ─
            const track = document.createElement('div');
            track.className = 'sl-track';
            // العرض = n × 100% من الـ wrapper
            track.style.cssText = `width:${n * 100}%; transform:translateX(0); transition:transform .26s cubic-bezier(.4,0,.2,1); will-change:transform;`;
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

            // ── zones اليمين/اليسار ──
            const zr = document.createElement('div');
            zr.className = 'sl-zone sl-zr';
            zr.setAttribute('role', 'button');
            zr.setAttribute('aria-label', 'الصورة السابقة');

            const zl = document.createElement('div');
            zl.className = 'sl-zone sl-zl';
            zl.setAttribute('role', 'button');
            zl.setAttribute('aria-label', 'الصورة التالية');

            imgBox.appendChild(zr);
            imgBox.appendChild(zl);

            // ── نقاط ──
            const dotsWrap = document.createElement('div');
            dotsWrap.className = 'sl-dots';
            dotsWrap.setAttribute('aria-hidden', 'true');
            for (let i = 0; i < n; i++) {
                const d = document.createElement('span');
                d.className = 'sl-dot' + (i === 0 ? ' on' : '');
                dotsWrap.appendChild(d);
                this._dots.push(d);
            }
            imgBox.appendChild(dotsWrap);

            // ── عداد ──
            const ctr = document.createElement('div');
            ctr.className = 'sl-ctr';
            ctr.setAttribute('aria-live', 'polite');
            ctr.innerHTML = `<b class="sl-cn">1</b>/${n}`;
            this._counter = ctr.querySelector('.sl-cn');
            imgBox.appendChild(ctr);

            // ── أحداث ──
            zr.addEventListener('click', e => { e.stopPropagation(); this._go(this.cur - 1); });
            zl.addEventListener('click', e => { e.stopPropagation(); this._go(this.cur + 1); });
            this._dots.forEach((d, i) =>
                d.addEventListener('click', e => { e.stopPropagation(); this._go(i); })
            );
            this._bindDrag(imgBox);
        }

        // ── معلومات المنتج ──
        const info = document.createElement('div');
        info.className = 'product-info';
        info.innerHTML = `
            <div class="product-name">${escapeHtml(this.product.name)}</div>
            <div class="product-price">${this.product.price.toLocaleString()} ل.س</div>
            <div class="item-subtotal" style="display:none">
                المجموع: <span class="subtotal-val">0</span> ل.س
            </div>
            <div class="qty-controls">
                <button class="qty-btn inc-qty" aria-label="زيادة الكمية">+</button>
                <input type="number" class="qty-input" value="${this.quantity}"
                       min="0" max="${this.product.stock || 999}" step="1"
                       inputmode="numeric" aria-label="الكمية">
                <button class="qty-btn dec-qty" aria-label="تقليل الكمية">-</button>
            </div>`;

        card.appendChild(imgBox);
        card.appendChild(info);

        this.element      = card;
        this.qtyInput     = info.querySelector('.qty-input');
        this.subtotalSpan = info.querySelector('.subtotal-val');
        this.subtotalRow  = info.querySelector('.item-subtotal');

        // أحداث الكمية
        info.querySelector('.inc-qty').addEventListener('click', e => {
            e.stopPropagation();
            this._changeQty(1);
        });
        info.querySelector('.dec-qty').addEventListener('click', e => {
            e.stopPropagation();
            this._changeQty(-1);
        });
        this.qtyInput.addEventListener('change', e => {
            let v = parseInt(e.target.value) || 0;
            v = Math.min(this.product.stock || 999, Math.max(0, v));
            const d = v - this.quantity;
            if (d) {
                this.quantity = v;
                this._updateUI();
                if (this.onQuantityChange) this.onQuantityChange(this.product.name, v, d);
            }
            this.qtyInput.value = this.quantity;
        });

        // ── Lazy load عبر IntersectionObserver ──
        // نربط instance البطاقة بالعنصر ثم نراقبه
        imgBox._cardInstance = this;
        _imgObserver.observe(imgBox);

        this._updateUI();
        return card;
    }

    // ─── صنع عنصر img بـ placeholder خفيف ──────────────────────
    _makeImg(index) {
        const img = document.createElement('img');
        img.className = 'sl-img';
        img.alt       = escapeHtml(this.product.name);
        img.decoding  = 'async';
        // SVG placeholder 1×1 بدون شبكة
        img.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3C/svg%3E";
        img.dataset.index = index;
        return img;
    }

    // ─── تحميل الصور (يُستدعى من IntersectionObserver) ─────────
    async _loadAll() {
        if (!this.images.length) { this._setPlaceholder(0); return; }
        // الصورة الأولى بأولوية — نحمّلها أولاً وننتظرها
        await this._loadOne(0, true);
        // باقي الصور في الخلفية بدون انتظار
        for (let i = 1; i < this.images.length; i++) {
            this._loadOne(i, false);
        }
    }

    async _loadOne(index, urgent) {
        const url = this.images[index];
        if (!url) return;

        // 1. كاش الذاكرة (objectURL جاهز)
        if (this._blobs[url]) {
            this._applyImg(index, this._blobs[url]);
            return;
        }

        // 2. IndexedDB
        try {
            const blob = await this.storage.getImageBlob(url);
            if (blob) {
                const ou = URL.createObjectURL(blob);
                this._blobs[url] = ou;
                this._applyImg(index, ou);
                return;
            }
        } catch (_) {}

        // 3. شبكة
        // للصورة الأولى: اعرضها مباشرة من الرابط لتظهر فوراً
        if (urgent) this._applyImg(index, url);

        try {
            // بدون cache: 'force-cache' — نترك Service Worker يتحكم
            const res = await fetch(url, { mode: 'cors' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            const ou   = URL.createObjectURL(blob);
            this._blobs[url] = ou;
            // حفظ في IndexedDB بدون انتظار
            this.storage.saveImageBlob(url, blob).catch(() => {});
            // تحديث العنصر بالـ objectURL الأفضل جودة
            this._applyImg(index, ou);
        } catch (_) {
            if (urgent) this._setPlaceholder(index);
        }
    }

    _applyImg(index, src) {
        if (!this._track) {
            // صورة وحيدة
            if (this._slides[0]) this._slides[0].src = src;
            return;
        }
        const slide = this._slides[index];
        if (!slide) return;
        const img = slide.querySelector('.sl-img');
        if (img) img.src = src;
    }

    _setPlaceholder(index) {
        this._applyImg(index, 'https://via.placeholder.com/300?text=No+Image');
    }

    // ─── التنقل ─────────────────────────────────────────────────
    _go(to) {
        const n = this.images.length;
        if (n <= 1) return;
        const next = ((to % n) + n) % n;
        if (next === this.cur) return;
        this.cur = next;
        this._syncTrack();
        this._syncDots();
        this._syncCounter();
    }

    _syncTrack() {
        if (!this._track) return;
        // كل slide عرضه (100/n)% من الـ track
        // الـ track عرضه n×100% من الـ wrapper
        // إذن الصورة cur تبدأ عند: cur × (100/n)% من الـ track
        // = cur × wrapper_width
        // نحرك الـ track بـ translateX(-cur × wrapper_width)
        // = translateX(-(cur * 100/n)% of track width)
        // بما أن track width = n × wrapper_width
        // translateX as % of track = -(cur / n) × 100%
        const pct = (this.cur / this.images.length) * 100;
        this._track.style.transform = `translateX(-${pct}%)`;
    }

    _syncDots() {
        for (let i = 0; i < this._dots.length; i++) {
            this._dots[i].classList.toggle('on', i === this.cur);
        }
    }

    _syncCounter() {
        if (this._counter) this._counter.textContent = this.cur + 1;
    }

    // ─── drag / swipe ────────────────────────────────────────────
    _bindDrag(el) {
        // ── Touch ──
        el.addEventListener('touchstart', e => {
            this._startX     = e.touches[0].clientX;
            this._startY     = e.touches[0].clientY;
            this._dragActive = true;
            this._moved      = false;
            // إيقاف transition أثناء السحب للاستجابة الفورية
            if (this._track) this._track.style.transition = 'none';
        }, { passive: true });

        el.addEventListener('touchmove', e => {
            if (!this._dragActive) return;
            const dx = e.touches[0].clientX - this._startX;
            const dy = e.touches[0].clientY - this._startY;
            // لو السحب عمودي أكثر من أفقي → scroll طبيعي
            if (Math.abs(dy) > Math.abs(dx) && !this._moved) {
                this._dragActive = false;
                this._restoreTrack();
                return;
            }
            if (Math.abs(dx) > 5) this._moved = true;
        }, { passive: true });

        el.addEventListener('touchend', e => {
            if (!this._dragActive) return;
            this._dragActive = false;
            if (this._track) this._track.style.transition = 'transform .26s cubic-bezier(.4,0,.2,1)';
            if (!this._moved) return;
            const diff = this._startX - e.changedTouches[0].clientX;
            if (Math.abs(diff) > 30) {
                diff > 0 ? this._go(this.cur + 1) : this._go(this.cur - 1);
            } else {
                this._restoreTrack();
            }
            this._moved = false;
        }, { passive: true });

        // ── Mouse (للديسكتوب) ──
        el.addEventListener('mousedown', e => {
            this._startX     = e.clientX;
            this._dragActive = true;
            this._moved      = false;
            if (this._track) this._track.style.transition = 'none';
            e.preventDefault();
        });

        // نضع الـ handlers على الـ element نفسه بدل window لتجنب الـ leak
        this._onMouseMove = e => {
            if (!this._dragActive) return;
            if (Math.abs(e.clientX - this._startX) > 5) this._moved = true;
        };
        this._onMouseUp = e => {
            if (!this._dragActive) return;
            this._dragActive = false;
            if (this._track) this._track.style.transition = 'transform .26s cubic-bezier(.4,0,.2,1)';
            if (!this._moved) return;
            const diff = this._startX - e.clientX;
            if (Math.abs(diff) > 30) {
                diff > 0 ? this._go(this.cur + 1) : this._go(this.cur - 1);
            } else {
                this._restoreTrack();
            }
            this._moved = false;
        };

        // نضيفها على el لا على window
        el.addEventListener('mousemove', this._onMouseMove);
        el.addEventListener('mouseleave', this._onMouseUp);
        el.addEventListener('mouseup', this._onMouseUp);
    }

    // إعادة الـ track لموضعه الصحيح بدون تغيير cur
    _restoreTrack() {
        if (this._track) {
            this._track.style.transition = 'transform .26s cubic-bezier(.4,0,.2,1)';
            this._syncTrack();
        }
    }

    // ─── UI ──────────────────────────────────────────────────────
    _updateUI() {
        this.qtyInput.value = this.quantity;
        if (this.quantity > 0) {
            this.subtotalSpan.textContent = (this.quantity * this.product.price).toLocaleString();
            this.subtotalRow.style.display = 'block';
        } else {
            this.subtotalRow.style.display = 'none';
        }
    }

    // debounce مخفّف: 80ms بدل 150ms — أسرع استجابة
    _changeQty(delta) {
        if (this._qtyTimer) clearTimeout(this._qtyTimer);
        this._qtyTimer = setTimeout(() => {
            const v = Math.min(this.product.stock || 999, Math.max(0, this.quantity + delta));
            const d = v - this.quantity;
            if (d) {
                this.quantity = v;
                this._updateUI();
                this.element.classList.add('added');
                setTimeout(() => this.element?.classList.remove('added'), 280);
                if (this.onQuantityChange) this.onQuantityChange(this.product.name, v, d);
            }
            this._qtyTimer = null;
        }, 80);
    }

    // ─── Public API ──────────────────────────────────────────────
    getQuantity() { return this.quantity; }
    getProduct()  { return this.product;  }

    setQuantity(qty) {
        const v = Math.min(this.product.stock || 999, Math.max(0, qty));
        const d = v - this.quantity;
        this.quantity = v;
        this._updateUI();
        if (d && this.onQuantityChange) this.onQuantityChange(this.product.name, v, d);
    }

    // ─── Cleanup — يُستدعى عند إزالة البطاقة من DOM ─────────────
    destroy() {
        // تحرير objectURLs
        for (const ou of Object.values(this._blobs)) {
            try { URL.revokeObjectURL(ou); } catch (_) {}
        }
        this._blobs = {};
        // إلغاء مراقبة IntersectionObserver
        if (this.element) {
            const imgBox = this.element.querySelector('.sl-wrap');
            if (imgBox) _imgObserver.unobserve(imgBox);
        }
        // إلغاء أي timer معلّق
        if (this._qtyTimer) clearTimeout(this._qtyTimer);
    }
}
