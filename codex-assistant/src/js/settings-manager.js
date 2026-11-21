// settings-manager.js
(function() {
    'use strict';

    const SettingsManager = {
        initialized: false,
        settings: {
            theme: 'dark',
            opacity: 0,
            autoHide: true,
            soundEnabled: true,
            soundVolume: 70,
            autoUpdate: true,
            hotkey: 'Ctrl+Shift+K'
        },
        
        init() {
            if (this.initialized) return;
            
            console.log('[Settings] Initializing...');
            
            this.loadSettings();
            this.setupEventListeners();
            this.updateVersionInfo();
            this.updateCacheSize();
            this.setupSyncListeners();
            
            this.initialized = true;
            console.log('[Settings] Initialized');
        },
        
        loadSettings() {
            try {
                // Новый формат: один JSON-ключ
                const savedRaw = localStorage.getItem('app_settings');
                if (savedRaw) {
                    const saved = JSON.parse(savedRaw);
                    Object.assign(this.settings, saved);
                } else {
                    // Миграция со старого формата (россыпь ключей) → новый
                    const legacy = {
                        theme:        localStorage.getItem('theme'),
                        opacity:      localStorage.getItem('windowOpacity'),
                        autoHide:     localStorage.getItem('autoHideEnabled'),
                        autoUpdate:   localStorage.getItem('autoUpdate'),
                        hotkey:       localStorage.getItem('hotkey'),
                        sound:        localStorage.getItem('sound_settings'),
                    };
                    if (legacy.theme)      this.settings.theme       = legacy.theme;
                    if (legacy.opacity !== null && legacy.opacity !== undefined)
                                           this.settings.opacity     = parseInt(legacy.opacity);
                    if (legacy.autoHide !== null && legacy.autoHide !== undefined)
                                           this.settings.autoHide    = legacy.autoHide === 'true';
                    if (legacy.autoUpdate !== null && legacy.autoUpdate !== undefined)
                                           this.settings.autoUpdate  = legacy.autoUpdate === 'true';
                    if (legacy.hotkey)     this.settings.hotkey      = legacy.hotkey;
                    if (legacy.sound) {
                        try {
                            const s = JSON.parse(legacy.sound);
                            if (s.enabled !== undefined) this.settings.soundEnabled = s.enabled;
                            if (s.volume  !== undefined) this.settings.soundVolume  = s.volume;
                        } catch (_) {}
                    }
                    // Переносим в новый формат и чистим старые ключи
                    this.saveSettings();
                    ['theme','windowOpacity','autoHideEnabled','autoUpdate','hotkey','sound_settings']
                        .forEach(k => localStorage.removeItem(k));
                    console.log('[Settings] Migrated from legacy keys to app_settings');
                }
            } catch (e) {
                console.warn('[Settings] Failed to load settings:', e);
            }
            
            this.updateUI();
        },
        
        saveSettings() {
            try {
                localStorage.setItem('app_settings', JSON.stringify(this.settings));
                // Синхронизируем отдельные ключи которые читает search-window через storage-event
                localStorage.setItem('windowOpacity',   String(this.settings.opacity));
                localStorage.setItem('autoHideEnabled', String(this.settings.autoHide));
                localStorage.setItem('sound_settings',  JSON.stringify({
                    enabled: this.settings.soundEnabled,
                    volume:  this.settings.soundVolume
                }));
                console.log('[Settings] Saved');
            } catch (e) {
                console.warn('[Settings] Failed to save settings:', e);
            }
        },
        
        updateUI() {
            const themeText = document.getElementById('settings-theme-text');
            if (themeText) {
                themeText.textContent = this.settings.theme === 'dark' ? 'Тёмная' : 'Светлая';
            }
            
            const opacitySlider = document.getElementById('settings-opacity-slider');
            const opacityValue = document.getElementById('settings-opacity-value');
            if (opacitySlider && opacityValue) {
                opacitySlider.value = this.settings.opacity;
                opacityValue.textContent = this.settings.opacity + '%';
            }
            
            const autoHideCheckbox = document.getElementById('settings-auto-hide');
            if (autoHideCheckbox) {
                autoHideCheckbox.checked = this.settings.autoHide;
            }
            
            const soundEnabled = document.getElementById('settings-sound-enabled');
            const soundVolume = document.getElementById('settings-volume-slider');
            const soundVolumeValue = document.getElementById('settings-volume-value');
            
            if (soundEnabled) soundEnabled.checked = this.settings.soundEnabled;
            if (soundVolume && soundVolumeValue) {
                soundVolume.value = this.settings.soundVolume;
                soundVolumeValue.textContent = this.settings.soundVolume + '%';
            }
            
            const autoUpdate = document.getElementById('settings-auto-update');
            if (autoUpdate) autoUpdate.checked = this.settings.autoUpdate;
        },
        
        setupSyncListeners() {
            // Слушаем изменения в localStorage от окна поиска
            window.addEventListener('storage', (e) => {
                if (e.key === 'windowOpacity' && e.newValue !== null) {
                    const newOpacity = parseInt(e.newValue);
                    if (this.settings.opacity !== newOpacity) {
                        this.settings.opacity = newOpacity;
                        this.updateUI();
                    }
                }
                
                if (e.key === 'autoHideEnabled' && e.newValue !== null) {
                    const newAutoHide = e.newValue === 'true';
                    if (this.settings.autoHide !== newAutoHide) {
                        this.settings.autoHide = newAutoHide;
                        this.updateUI();
                    }
                }
                
                if (e.key === 'sound_settings' && e.newValue !== null) {
                    try {
                        const newSound = JSON.parse(e.newValue);
                        if (this.settings.soundEnabled !== newSound.enabled || 
                            this.settings.soundVolume !== newSound.volume) {
                            this.settings.soundEnabled = newSound.enabled;
                            this.settings.soundVolume = newSound.volume;
                            this.updateUI();
                        }
                    } catch (error) {
                        console.warn('[Settings] Failed to parse sound settings from storage:', error);
                    }
                }
            });
        },
        
        setupEventListeners() {
            const themeToggle = document.getElementById('settings-theme-toggle');
            if (themeToggle) {
                themeToggle.addEventListener('click', () => {
                    const newTheme = this.settings.theme === 'dark' ? 'light' : 'dark';
                    this.setTheme(newTheme);
                    if (window.SoundManager) SoundManager.play('settings');
                });
            }
            
            const opacitySlider = document.getElementById('settings-opacity-slider');
            const opacityValue = document.getElementById('settings-opacity-value');
            if (opacitySlider) {
                opacitySlider.addEventListener('input', (e) => {
                    const value = parseInt(e.target.value);
                    opacityValue.textContent = value + '%';
                    if (window.SoundManager) {
                        SoundManager.play('slider');
                    }
                });
                
                opacitySlider.addEventListener('change', (e) => {
                    const value = parseInt(e.target.value);
                    this.setOpacity(value);
                });
            }
            
            const autoHideCheckbox = document.getElementById('settings-auto-hide');
            if (autoHideCheckbox) {
                autoHideCheckbox.addEventListener('change', (e) => {
                    this.setAutoHide(e.target.checked);
                    if (window.SoundManager) SoundManager.play('toggle');
                });
            }
            
            const soundEnabled = document.getElementById('settings-sound-enabled');
            if (soundEnabled) {
                soundEnabled.addEventListener('change', (e) => {
                    this.setSoundEnabled(e.target.checked);
                    if (e.target.checked && window.SoundManager) {
                        SoundManager.play('notification');
                    }
                });
            }
            
            const soundVolume = document.getElementById('settings-volume-slider');
            const soundVolumeValue = document.getElementById('settings-volume-value');
            if (soundVolume) {
                soundVolume.addEventListener('input', (e) => {
                    const value = parseInt(e.target.value);
                    soundVolumeValue.textContent = value + '%';
                    if (window.SoundManager) {
                        SoundManager.play('slider');
                    }
                });
                
                soundVolume.addEventListener('change', (e) => {
                    const value = parseInt(e.target.value);
                    this.setSoundVolume(value);
                    if (window.SoundManager) {
                        setTimeout(() => SoundManager.play('notification'), 100);
                    }
                });
            }
            
            const autoUpdate = document.getElementById('settings-auto-update');
            if (autoUpdate) {
                autoUpdate.addEventListener('change', (e) => {
                    this.setAutoUpdate(e.target.checked);
                });
            }
            
            const checkUpdates = document.getElementById('settings-check-updates');
            if (checkUpdates) {
                checkUpdates.addEventListener('click', () => {
                    this.checkForUpdates();
                    if (window.SoundManager) SoundManager.play('settings');
                });
            }
            
            const clearCache = document.getElementById('settings-clear-cache');
            if (clearCache) {
                clearCache.addEventListener('click', () => {
                    this.showConfirmModal(
                        'Очистить кэш',
                        'Вы уверены, что хотите очистить весь кэш? Это может временно замедлить загрузку данных.',
                        () => this.clearCache()
                    );
                    if (window.SoundManager) SoundManager.play('modal');
                });
            }
            
            const resetAll = document.getElementById('settings-reset-all');
            if (resetAll) {
                resetAll.addEventListener('click', () => {
                    this.showConfirmModal(
                        'Сброс настроек',
                        'Вы уверены, что хотите сбросить все настройки? Это действие нельзя отменить.',
                        () => this.resetAllSettings()
                    );
                    if (window.SoundManager) SoundManager.play('modal');
                });
            }
            
            document.querySelectorAll('.sound-preview-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const soundType = e.currentTarget.dataset.sound;
                    if (window.SoundManager) {
                        SoundManager.preview(soundType);
                    }
                });
            });
        },
        
        setTheme(theme) {
            this.settings.theme = theme;
            
            if (window.ThemeManager) {
                window.ThemeManager.applyTheme(theme);
            } else {
                document.documentElement.setAttribute('data-theme', theme);
            }
            
            const themeText = document.getElementById('settings-theme-text');
            if (themeText) {
                themeText.textContent = theme === 'dark' ? 'Тёмная' : 'Светлая';
            }
            
            this.saveSettings();
        },
        
        setOpacity(value) {
            this.settings.opacity = value;
            
            // Применяем прозрачность к окну поиска если оно существует
            const searchWindow = document.querySelector('.search-window');
            if (searchWindow) {
                searchWindow.style.opacity = 1 - (value / 100);
            }
            
            // Обновляем слайдер в окне поиска, если он есть
            const searchSlider = document.getElementById('opacity-slider');
            const searchValue = document.getElementById('opacity-value');
            if (searchSlider && searchValue) {
                searchSlider.value = value;
                searchValue.textContent = value + '%';
            }
            
            this.saveSettings();
        },
        
        setAutoHide(enabled) {
            this.settings.autoHide = enabled;
            
            if (window.CodexAPI) {
                window.CodexAPI.config.setAutoHide(enabled);
            }
            
            // Обновляем чекбокс в окне поиска
            const searchCheckbox = document.getElementById('auto-hide-checkbox');
            if (searchCheckbox) {
                searchCheckbox.checked = enabled;
            }
            
            this.saveSettings();
        },
        
        setSoundEnabled(enabled) {
            this.settings.soundEnabled = enabled;
            if (window.SoundManager) {
                window.SoundManager.setEnabled(enabled);
            }
            this.saveSettings();
        },
        
        setSoundVolume(volume) {
            this.settings.soundVolume = volume;
            if (window.SoundManager) {
                window.SoundManager.setVolume(volume);
            }
            this.saveSettings();
        },
        
        setAutoUpdate(enabled) {
            this.settings.autoUpdate = enabled;
            this.saveSettings();
        },
        
        updateVersionInfo() {
            const versionSpan = document.getElementById('settings-current-version');
            const aboutVersion = document.getElementById('about-version');
            
            if (window.CodexAPI) {
                window.CodexAPI.app.getInfo().then(info => {
                    if (versionSpan) versionSpan.textContent = info.version;
                    if (aboutVersion) aboutVersion.textContent = info.version;
                }).catch(() => {
                    if (versionSpan) versionSpan.textContent = '1.0.3';
                    if (aboutVersion) aboutVersion.textContent = '1.0.3';
                });
            } else {
                if (versionSpan) versionSpan.textContent = '1.0.3';
                if (aboutVersion) aboutVersion.textContent = '1.0.3';
            }
        },
        
        updateCacheSize() {
            const cacheSizeEl = document.getElementById('settings-cache-size');
            if (!cacheSizeEl) return;
            
            try {
                let totalSize = 0;
                
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    const value = localStorage.getItem(key);
                    totalSize += (key.length + value.length) * 2;
                }
                
                const sizeMB = (totalSize / (1024 * 1024)).toFixed(2);
                cacheSizeEl.textContent = sizeMB + ' MB';
                
            } catch (e) {
                console.warn('[Settings] Failed to calculate cache size:', e);
                cacheSizeEl.textContent = '0 MB';
            }
        },
        
        clearCache() {
            try {
                if (window.Utils && window.Utils.clearAllCache) {
                    window.Utils.clearAllCache();
                }
                
                if (window.SearchState && window.SearchState.lawsCache) {
                    window.SearchState.lawsCache.clear();
                }
                
                this.updateCacheSize();
                
                if (window.SoundManager) SoundManager.play('success');
                
                if (window.Notification) {
                    Notification.show('Кэш успешно очищен');
                }
                
                console.log('[Settings] Cache cleared');
                
            } catch (e) {
                console.error('[Settings] Failed to clear cache:', e);
                if (window.SoundManager) SoundManager.play('error');
            }
        },
        
        resetAllSettings() {
            try {
                // Удаляем только ключи настроек — НЕ трогаем кэш данных (offline_laws, offline_rules, offline_servers)
                const SETTINGS_KEYS = [
                    'app_settings',
                    'windowOpacity', 'autoHideEnabled', 'sound_settings', // sync-ключи
                    'activeTab', 'searchQuery', 'selectedServer'
                ];
                SETTINGS_KEYS.forEach(key => localStorage.removeItem(key));
                
                // Сбрасываем settings в памяти к дефолтам
                this.settings = {
                    theme: 'dark',
                    opacity: 0,
                    autoHide: true,
                    soundEnabled: true,
                    soundVolume: 70,
                    autoUpdate: true,
                    hotkey: 'Ctrl+Shift+K'
                };
                
                if (window.ThemeManager) {
                    window.ThemeManager.loadTheme();
                }
                
                if (window.SoundManager) {
                    window.SoundManager.loadSettings();
                }
                
                this.updateUI();
                this.updateCacheSize();
                
                if (window.SoundManager) SoundManager.play('success');
                
                if (window.Notification) {
                    Notification.show('Настройки сброшены');
                }
                
                console.log('[Settings] All settings reset (cache preserved)');
                
                setTimeout(() => {
                    location.reload();
                }, 1500);
                
            } catch (e) {
                console.error('[Settings] Failed to reset settings:', e);
                if (window.SoundManager) SoundManager.play('error');
            }
        },
        
        checkForUpdates() {
            const updateInfo = document.getElementById('settings-update-info');
            if (!updateInfo) return;
            
            updateInfo.classList.remove('hidden');
            updateInfo.innerHTML = `
                <div class="update-checking">
                    <div class="loading-dots"><span></span><span></span><span></span></div>
                    <span>Проверка обновлений...</span>
                </div>
            `;
            
            setTimeout(() => {
                updateInfo.innerHTML = `
                    <div class="update-result success">
                        <svg width="16" height="16" viewBox="0 0 16 16">
                            <circle cx="8" cy="8" r="7" stroke="#4ade80" stroke-width="1.5" fill="none"/>
                            <path d="M5 8L7 10L11 6" stroke="#4ade80" stroke-width="1.5" stroke-linecap="round" fill="none"/>
                        </svg>
                        <span>У вас установлена последняя версия (${this.settings.version || '1.0.3'})</span>
                    </div>
                `;
                
                setTimeout(() => {
                    updateInfo.classList.add('hidden');
                }, 3000);
                
            }, 2000);
        },
        
        showConfirmModal(title, message, onConfirm) {
            const modal = document.getElementById('confirm-modal');
            const titleEl = document.getElementById('confirm-title');
            const messageEl = document.getElementById('confirm-message');
            const yesBtn = document.getElementById('confirm-yes');
            const noBtn = document.getElementById('confirm-no');
            
            if (!modal || !titleEl || !messageEl || !yesBtn || !noBtn) return;
            
            titleEl.textContent = title;
            messageEl.textContent = message;
            
            modal.classList.remove('hidden');
            modal.classList.add('show');
            
            const handleYes = () => {
                modal.classList.remove('show');
                modal.classList.add('hidden');
                yesBtn.removeEventListener('click', handleYes);
                noBtn.removeEventListener('click', handleNo);
                if (onConfirm) onConfirm();
            };
            
            const handleNo = () => {
                modal.classList.remove('show');
                modal.classList.add('hidden');
                yesBtn.removeEventListener('click', handleYes);
                noBtn.removeEventListener('click', handleNo);
            };
            
            yesBtn.addEventListener('click', handleYes);
            noBtn.addEventListener('click', handleNo);
            
            const overlay = modal.querySelector('.modal-overlay');
            if (overlay) {
                overlay.addEventListener('click', handleNo, { once: true });
            }
        }
    };

    window.SettingsManager = SettingsManager;

})();