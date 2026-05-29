import { CONFIG } from './config.js';

export class ThemeManager {
    constructor() {
        this.body = document.body;
        this.currentTheme = this.loadTheme();
        this.dayElements = document.querySelector('.day-scene');
        this.nightElements = document.querySelector('.night-scene');
        this.themeToggleBtn = document.getElementById('themeToggle');
        this.themeIcon = this.themeToggleBtn?.querySelector('i');
        this.applyTheme(this.currentTheme);
        this.initEventListeners();
    }

    loadTheme() {
        const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.THEME);
        if (saved === 'dark' || saved === 'light') return saved;
        // التحقق من تفضيل النظام فقط إذا كان المتصفح يدعمه
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        return prefersDark ? 'dark' : CONFIG.DEFAULT_THEME;
    }

    saveTheme(theme) {
        try {
            localStorage.setItem(CONFIG.STORAGE_KEYS.THEME, theme);
        } catch (e) {}
    }

    applyTheme(theme) {
        this.currentTheme = theme;
        if (theme === 'dark') {
            this.body.setAttribute('data-theme', 'dark');
            if (this.dayElements) this.dayElements.style.display = 'none';
            if (this.nightElements) this.nightElements.style.display = 'block';
            if (this.themeIcon) {
                this.themeIcon.classList.remove('fa-moon');
                this.themeIcon.classList.add('fa-sun');
            }
        } else {
            this.body.setAttribute('data-theme', 'light');
            if (this.dayElements) this.dayElements.style.display = 'block';
            if (this.nightElements) this.nightElements.style.display = 'none';
            if (this.themeIcon) {
                this.themeIcon.classList.remove('fa-sun');
                this.themeIcon.classList.add('fa-moon');
            }
        }
        this.saveTheme(theme);
    }

    toggleTheme() {
        this.applyTheme(this.currentTheme === 'dark' ? 'light' : 'dark');
    }

    initEventListeners() {
        if (this.themeToggleBtn) {
            this.themeToggleBtn.addEventListener('click', () => this.toggleTheme());
        }
    }
}
