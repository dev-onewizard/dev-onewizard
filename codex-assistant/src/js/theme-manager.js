// theme-manager.js
(function() {
    'use strict';

    const ThemeManager = {
        currentTheme: 'dark',
        initialized: false,
        clickLock: false,
        
        init() {
            if (this.initialized) return;
            
            console.log('[Theme] Initializing...');
            
            // Загружаем сохранённую тему
            this.loadTheme();
            
            // Добавляем обработчик для кнопки переключения темы
            const themeToggle = document.getElementById('theme-toggle');
            if (themeToggle) {
                console.log('[Theme] Theme toggle button found');
                
                // Удаляем все старые обработчики
                const newToggle = themeToggle.cloneNode(true);
                themeToggle.parentNode.replaceChild(newToggle, themeToggle);
                
                // Добавляем новый обработчик
                newToggle.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.toggleTheme();
                });
            } else {
                console.log('[Theme] Theme toggle button not found');
            }
            
            // Слушаем изменения темы в localStorage
            window.addEventListener('storage', (e) => {
                if (e.key === 'theme' && e.newValue && e.newValue !== this.currentTheme) {
                    console.log('[Theme] Syncing from storage:', e.newValue);
                    this.currentTheme = e.newValue;
                    this.applyTheme(e.newValue);
                }
            });
            
            this.initialized = true;
            console.log('[Theme] Initialized with theme:', this.currentTheme);
        },
        
        toggleTheme() {
            if (this.clickLock) {
                console.log('[Theme] Click locked - ignoring');
                return;
            }
            
            this.clickLock = true;
            
            console.log('[Theme] Toggle called, current:', this.currentTheme);
            const newTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
            console.log('[Theme] Switching to:', newTheme);
            
            this.currentTheme = newTheme;
            this.applyTheme(newTheme);
            this.saveTheme(newTheme);
            
            setTimeout(() => {
                this.clickLock = false;
            }, 300);
        },
        
        loadTheme() {
            try {
                const savedTheme = localStorage.getItem('theme');
                console.log('[Theme] Loaded from storage:', savedTheme);
                if (savedTheme && (savedTheme === 'dark' || savedTheme === 'light')) {
                    this.currentTheme = savedTheme;
                } else {
                    this.currentTheme = 'dark';
                    localStorage.setItem('theme', 'dark');
                }
                this.applyTheme(this.currentTheme);
            } catch (error) {
                console.error('[Theme] Failed to load theme:', error);
                this.applyTheme('dark');
            }
        },
        
        saveTheme(theme) {
            try {
                localStorage.setItem('theme', theme);
                console.log('[Theme] Saved to storage:', theme);
            } catch (error) {
                console.error('[Theme] Failed to save theme:', error);
            }
        },
        
        applyTheme(theme) {
            console.log('[Theme] Applying theme:', theme);
            
            document.documentElement.setAttribute('data-theme', theme);
            this.updateThemeIcons(theme);
            this.currentTheme = theme;
        },
        
        updateThemeIcons(theme) {
            const lightIcon = document.querySelector('.theme-icon-light');
            const darkIcon = document.querySelector('.theme-icon-dark');
            
            if (!lightIcon || !darkIcon) {
                console.log('[Theme] Icons not found');
                return;
            }
            
            console.log('[Theme] Updating icons for theme:', theme);
            
            if (theme === 'dark') {
                lightIcon.style.display = 'none';
                darkIcon.style.display = 'block';
            } else {
                lightIcon.style.display = 'block';
                darkIcon.style.display = 'none';
            }
        },
        
        getCurrentTheme() {
            return this.currentTheme;
        },
        
        isDark() {
            return this.currentTheme === 'dark';
        },
        
        isLight() {
            return this.currentTheme === 'light';
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            console.log('[Theme] DOM loading, initializing...');
            ThemeManager.init();
        });
    } else {
        console.log('[Theme] DOM already loaded, initializing...');
        setTimeout(() => ThemeManager.init(), 100);
    }

    window.ThemeManager = ThemeManager;
})();