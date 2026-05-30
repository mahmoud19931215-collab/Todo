// CartManager.js
import { escapeHtml } from './config.js';

export class CartManager {
    constructor(targetNumber, onCartUpdate) {
        this.targetNumber = targetNumber;
        this.onCartUpdate = onCartUpdate;
        
        // العناصر الأساسية - تخزين المراجع
        this.cartDrawer = document.getElementById('cartDrawer');
        this.drawerOverlay = document.getElementById('cartOverlay');
        this.cartBadge = document.getElementById('cartBadge');
        this.cartFooter = document.getElementById('cartFooter');
        this.grandTotalSpan = document.getElementById('grandTotal');
        this.cartItemsList = document.getElementById('cartItemsList');
        this.drawerTotalSpan = document.getElementById('drawerTotal');
        this.openDrawerBtn = document.getElementById('cartDrawerBtn');
        this.whatsappFooterBtn = document.getElementById('whatsappFooterBtn');
        this.drawerWhatsappBtn = document.getElementById('drawerWhatsappBtn');
        
        // حالة السلة
        this.items = [];           // { name, quantity, price }
        this.totalQuantity = 0;
        this.totalPrice = 0;
        
        // معاودة الاتصال لإزالة عنصر
        this.onRemoveItemCallback = null;
        
        // منع التحديث المتكرر للـ drawer أثناء فتحه
        this.drawerUpdateQueued = false;
        
        // ربط الأحداث (مع إمكانية إلغاء الربط لاحقاً)
        this.boundEvents = new Map();
        this.init();
    }

    init() {
        // دالة مساعدة لربط الأحداث مع تخزينها
        const addEvent = (element, event, handler) => {
            if (!element) return;
            element.addEventListener(event, handler);
            if (!this.boundEvents.has(element)) this.boundEvents.set(element, []);
            this.boundEvents.get(element).push({ event, handler });
        };
        
        addEvent(this.openDrawerBtn, 'click', () => this.openDrawer());
        
        if (this.closeDrawerBtns) {
            document.querySelectorAll('.drawer-close').forEach(btn => {
                addEvent(btn, 'click', () => this.closeDrawer());
            });
        }
        
        addEvent(this.drawerOverlay, 'click', () => this.closeDrawer());
        addEvent(this.whatsappFooterBtn, 'click', () => this.sendToWhatsApp());
        addEvent(this.drawerWhatsappBtn, 'click', () => {
            this.sendToWhatsApp();
            this.closeDrawer();
        });
        
        // استخدام delegation لإزالة العناصر (كفاءة أعلى)
        if (this.cartItemsList) {
            addEvent(this.cartItemsList, 'click', (e) => {
                const btn = e.target.closest('.remove-item');
                if (btn && this.onRemoveItemCallback) {
                    const name = btn.getAttribute('data-name');
                    if (name) this.onRemoveItemCallback(name);
                }
            });
        }
    }

    openDrawer() {
        if (this.cartDrawer) this.cartDrawer.classList.add('open');
        if (this.drawerOverlay) this.drawerOverlay.classList.add('open');
        this.updateDrawerContent();  // تحديث المحتوى عند الفتح فقط
    }

    closeDrawer() {
        if (this.cartDrawer) this.cartDrawer.classList.remove('open');
        if (this.drawerOverlay) this.drawerOverlay.classList.remove('open');
    }

    updateFromCartItems(cartItems) {
        // تحديث المصفوفة وحساب الإجماليات بتمريرة واحدة
        this.items = cartItems;
        let newTotalQuantity = 0;
        let newTotalPrice = 0;
        const len = this.items.length;
        for (let i = 0; i < len; i++) {
            const item = this.items[i];
            newTotalQuantity += item.quantity;
            newTotalPrice += item.quantity * item.price;
        }
        this.totalQuantity = newTotalQuantity;
        this.totalPrice = newTotalPrice;
        
        // تحديث الشارة والفوتر العائم
        if (this.cartBadge) {
            this.cartBadge.innerText = this.totalQuantity;
            this.cartBadge.style.display = this.totalQuantity > 0 ? 'flex' : 'none';
        }
        
        if (this.cartFooter) {
            if (this.totalQuantity > 0) this.cartFooter.classList.add('show');
            else this.cartFooter.classList.remove('show');
        }
        
        if (this.grandTotalSpan) {
            this.grandTotalSpan.innerText = this.totalPrice.toLocaleString();
        }
        
        // تحديث محتوى الدراور إذا كان مفتوحاً (باستخدام طابور لتجنب التكرار)
        if (this.cartDrawer && this.cartDrawer.classList.contains('open') && !this.drawerUpdateQueued) {
            this.drawerUpdateQueued = true;
            requestAnimationFrame(() => {
                this.updateDrawerContent();
                this.drawerUpdateQueued = false;
            });
        }
        
        if (this.onCartUpdate) {
            this.onCartUpdate(this.totalQuantity, this.totalPrice);
        }
    }

    updateDrawerContent() {
        if (!this.cartItemsList) return;
        
        if (this.items.length === 0) {
            this.cartItemsList.innerHTML = '<div class="empty-cart">🛒 السلة فارغة</div>';
            if (this.drawerTotalSpan) this.drawerTotalSpan.innerText = '0';
            return;
        }
        
        // استخدام DocumentFragment لبناء القائمة دفعة واحدة
        const fragment = document.createDocumentFragment();
        const len = this.items.length;
        for (let i = 0; i < len; i++) {
            const item = this.items[i];
            const div = document.createElement('div');
            div.className = 'cart-item';
            div.setAttribute('data-name', item.name);
            
            const infoDiv = document.createElement('div');
            infoDiv.className = 'cart-item-info';
            
            const nameDiv = document.createElement('div');
            nameDiv.className = 'cart-item-name';
            nameDiv.textContent = item.name;
            
            const priceDiv = document.createElement('div');
            priceDiv.className = 'cart-item-price';
            priceDiv.textContent = `${item.price.toLocaleString()} ل.س`;
            
            const qtyDiv = document.createElement('div');
            qtyDiv.className = 'cart-item-qty';
            qtyDiv.textContent = `الكمية: ${item.quantity}`;
            
            infoDiv.appendChild(nameDiv);
            infoDiv.appendChild(priceDiv);
            infoDiv.appendChild(qtyDiv);
            
            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-item';
            removeBtn.setAttribute('data-name', item.name);
            removeBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
            
            div.appendChild(infoDiv);
            div.appendChild(removeBtn);
            fragment.appendChild(div);
        }
        
        // تنظيف وإضافة المحتوى الجديد
        this.cartItemsList.innerHTML = '';
        this.cartItemsList.appendChild(fragment);
        
        if (this.drawerTotalSpan) {
            this.drawerTotalSpan.innerText = this.totalPrice.toLocaleString();
        }
    }

    setRemoveItemCallback(callback) {
        this.onRemoveItemCallback = callback;
    }

    sendToWhatsApp() {
        if (this.items.length === 0) {
            alert('السلة فارغة، أضف منتجات أولاً.');
            return;
        }
        
        // بناء الرسالة بفعالية باستخدام مصفوفة ثم join
        const lines = [];
        const len = this.items.length;
        for (let i = 0; i < len; i++) {
            const item = this.items[i];
            const subtotal = item.quantity * item.price;
            lines.push(`🛒 *${item.name}*\n   ${item.quantity} قطعة × ${item.price.toLocaleString()} = ${subtotal.toLocaleString()} ل.س`);
        }
        lines.push('--------------------------');
        lines.push(`💰 *الإجمالي النهائي: ${this.totalPrice.toLocaleString()} ل.س*`);
        const message = lines.join('\n');
        
        window.open(`https://wa.me/${this.targetNumber}?text=${encodeURIComponent(message)}`, '_blank');
    }
    
    // دالة اختيارية لتنظيف الأحداث (إذا أردت تدمير المدير)
    destroy() {
        for (const [element, events] of this.boundEvents.entries()) {
            for (const { event, handler } of events) {
                element.removeEventListener(event, handler);
            }
        }
        this.boundEvents.clear();
        this.onRemoveItemCallback = null;
        this.items = [];
    }
}
