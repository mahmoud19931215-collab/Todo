// CartManager.js
import { escapeHtml, formatCurrency } from './config.js';

export class CartManager {
    constructor(targetNumber, storageService, onCartChangeCallback) {
        this.targetNumber = targetNumber;
        this.storageService = storageService;
        this.onCartChangeCallback = onCartChangeCallback; // تحديث واجهة الـ Grid تلقائياً عند تغيير الكميات داخل السلة

        // ربط عناصر DOM
        this.cartDrawer = document.getElementById('cartDrawer');
        this.cartOverlay = document.getElementById('cartOverlay');
        this.cartBadge = document.getElementById('cartBadge');
        this.cartItemsList = document.getElementById('cartItemsList');
        this.drawerTotalSpan = document.getElementById('drawerTotal');
        this.openDrawerBtn = document.getElementById('cartDrawerBtn');
        this.closeDrawerBtn = document.getElementById('cartCloseBtn');
        this.whatsappBtn = document.getElementById('cartWhatsappBtn');

        // مخزن البيانات الداخلي الموحد (تمثيل السلة)
        this.cartMap = this.storageService.loadCart();

        this.init();
    }

    init() {
        this._bindEvents();
        this.updateUI();
    }

    _bindEvents() {
        if (this.openDrawerBtn) {
            this.openDrawerBtn.addEventListener('click', () => this.openDrawer());
        }
        if (this.closeDrawerBtn) {
            this.closeDrawerBtn.addEventListener('click', () => this.closeDrawer());
        }
        if (this.cartOverlay) {
            this.cartOverlay.addEventListener('click', () => this.closeDrawer());
        }
        if (this.whatsappBtn) {
            this.whatsappBtn.addEventListener('click', () => this.sendToWhatsApp());
        }

        // تفويض الأحداث (Event Delegation) لأزرار الزيادة والنقصان والحذف داخل الـ Drawer نفسه
        if (this.cartItemsList) {
            this.cartItemsList.addEventListener('click', (e) => {
                const row = e.target.closest('.cart-item-row');
                if (!row) return;
                const name = row.dataset.name;

                if (e.target.closest('.btn-drawer-plus')) {
                    this.updateItemQuantity(name, 1);
                } else if (e.target.closest('.btn-drawer-minus')) {
                    this.updateItemQuantity(name, -1);
                } else if (e.target.closest('.btn-drawer-remove')) {
                    this.removeItem(name);
                }
            });
        }
    }

    openDrawer() {
        if (this.cartDrawer) this.cartDrawer.classList.add('open');
        if (this.cartOverlay) this.cartOverlay.classList.add('active');
        this.renderDrawerItems();
    }

    closeDrawer() {
        if (this.cartDrawer) this.cartDrawer.classList.remove('open');
        if (this.cartOverlay) this.cartOverlay.classList.remove('active');
    }

    // الدالة المركزية للتحكم بالكميات من أي مكان داخل التطبيق
    updateItemQuantity(product, change) {
        const name = typeof product === 'string' ? product : product.name;
        
        if (!this.cartMap[name]) {
            if (change <= 0 || typeof product === 'string') return;
            this.cartMap[name] = {
                name: product.name,
                price: product.price,
                quantity: 0,
                category: product.category
            };
        }

        this.cartMap[name].quantity += change;

        if (this.cartMap[name].quantity <= 0) {
            delete this.cartMap[name];
        }

        this._syncAndRefresh();
    }

    removeItem(name) {
        if (this.cartMap[name]) {
            delete this.cartMap[name];
            this._syncAndRefresh();
        }
    }

    _syncAndRefresh() {
        this.storageService.saveCart(this.cartMap);
        this.updateUI();
        this.renderDrawerItems();
        
        // إشعار التطبيق الرئيسي بوجود تحديث لتحديث كروت العرض في الخلفية فوراً
        if (this.onCartChangeCallback) {
            this.onCartChangeCallback(this.cartMap);
        }
    }

    getCartMap() {
        return this.cartMap;
    }

    getTotals() {
        let count = 0;
        let totalMoney = 0;
        
        Object.values(this.cartMap).forEach(item => {
            count += item.quantity;
            totalMoney += item.quantity * item.price;
        });

        return { count, totalMoney };
    }

    updateUI() {
        const { count } = this.getTotals();
        if (this.cartBadge) {
            this.cartBadge.innerText = count;
            this.cartBadge.style.display = count > 0 ? 'flex' : 'none';
        }
    }

    renderDrawerItems() {
        if (!this.cartItemsList) return;

        const itemsArray = Object.values(this.cartMap);
        const { totalMoney } = this.getTotals();

        if (itemsArray.length === 0) {
            this.cartItemsList.innerHTML = `
                <div class="empty-cart-state">
                    <i class="fas fa-shopping-basket"></i>
                    <p>سلة المشتريات فارغة حالياً</p>
                </div>
            `;
            if (this.drawerTotalSpan) this.drawerTotalSpan.innerText = formatCurrency(0);
            if (this.whatsappBtn) this.whatsappBtn.setAttribute('disabled', 'true');
            return;
        }

        if (this.whatsappBtn) this.whatsappBtn.removeAttribute('disabled');
        this.cartItemsList.innerHTML = '';
        const fragment = document.createDocumentFragment();

        itemsArray.forEach(item => {
            const row = document.createElement('div');
            row.className = 'cart-item-row';
            row.dataset.name = item.name;
            
            row.innerHTML = `
                <div class="cart-item-info">
                    <span class="cart-item-title">${escapeHtml(item.name)}</span>
                    <span class="cart-item-price">${formatCurrency(item.price)}</span>
                </div>
                <div class="cart-item-actions">
                    <div class="drawer-quantity-controls">
                        <button class="btn-drawer-minus"><i class="fas fa-minus"></i></button>
                        <span class="drawer-qty-value">${item.quantity}</span>
                        <button class="btn-drawer-plus"><i class="fas fa-plus"></i></button>
                    </div>
                    <button class="btn-drawer-remove" aria-label="حذف العنصر"><i class="fas fa-trash-alt"></i></button>
                </div>
            `;
            fragment.appendChild(row);
        });

        this.cartItemsList.appendChild(fragment);
        if (this.drawerTotalSpan) {
            this.drawerTotalSpan.innerText = formatCurrency(totalMoney);
        }
    }

    sendToWhatsApp() {
        const itemsArray = Object.values(this.cartMap);
        if (itemsArray.length === 0) return;

        const lines = ['📋 *طلب جديد من متجر حلب للتوصيل*\\n'];
        let grandTotal = 0;

        itemsArray.forEach((item, index) => {
            const subtotal = item.quantity * item.price;
            grandTotal += subtotal;
            lines.push(`${index + 1}. 🛒 *${item.name}*`);
            lines.push(`   الكمية: ${item.quantity} × السعر: ${item.price.toLocaleString('ar-EG')} ل.س`);
            lines.push(`   المجموع: ${subtotal.toLocaleString('ar-EG')} ل.س\\n`);
        });

        lines.push('-------------------------------------');
        lines.push(`💰 *الإجمالي النهائي للطلب: ${grandTotal.toLocaleString('ar-EG')} ل.س*`);
        
        const messageText = lines.join('\\n');
        // استخدام الرابط العالمي للواتساب لضمان التوافق المطلق مع الهواتف والمتصفحات
        const url = `https://api.whatsapp.com/send?phone=${this.targetNumber}&text=${encodeURIComponent(messageText.replace(/\\n/g, '\n'))}`;
        window.open(url, '_blank');
    }
}
