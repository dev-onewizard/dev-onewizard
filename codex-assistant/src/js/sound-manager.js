// sound-manager.js
(function() {
    'use strict';

    const SoundManager = {
        sounds: {},
        enabled: true,
        volume: 70,
        initialized: false,
        audioElements: {},
        
        init() {
            if (this.initialized) return;
            
            console.log('[Sound] Initializing...');
            
            this.loadSettings();
            this.loadSounds();
            this.setupHoverListeners();
            
            this.initialized = true;
            console.log('[Sound] Initialized');
        },
        
        loadSettings() {
            try {
                const saved = localStorage.getItem('sound_settings');
                if (saved) {
                    const settings = JSON.parse(saved);
                    this.enabled = settings.enabled !== undefined ? settings.enabled : true;
                    this.volume = settings.volume !== undefined ? settings.volume : 70;
                }
            } catch (e) {
                console.warn('[Sound] Failed to load settings:', e);
            }
        },
        
        saveSettings() {
            try {
                const settings = {
                    enabled: this.enabled,
                    volume: this.volume
                };
                localStorage.setItem('sound_settings', JSON.stringify(settings));
                console.log('[Sound] Settings saved');
            } catch (e) {
                console.warn('[Sound] Failed to save settings:', e);
            }
        },
        
        loadSounds() {
            const soundMap = {
                'copy': 'click.ogg',
                'click': 'click.ogg',
                'error': 'error.ogg',
                'hover': 'hover.ogg',
                'notification': 'modal.ogg',
                'modal': 'modal.ogg',
                'toggle': 'select.ogg',
                'select': 'select.ogg',
                'settings': 'settings.ogg',
                'slider': 'sliderTick.ogg',
                'tick': 'tick.ogg',
                'move': 'moveSoft.ogg',
                'moveBack': 'moveSoftBack.ogg',
                'success': 'modal.ogg' // используем modal.ogg для успеха
            };
            
            for (const [key, filename] of Object.entries(soundMap)) {
                try {
                    const audio = new Audio(`../assets/sounds/${filename}`);
                    audio.preload = 'auto';
                    this.audioElements[key] = audio;
                } catch (e) {
                    console.warn(`[Sound] Failed to load ${filename}:`, e);
                }
            }
            
            console.log('[Sound] Sounds loaded');
        },
        
        setupHoverListeners() {
            // Добавляем звук наведения для всех кликабельных элементов
            document.addEventListener('mouseover', (e) => {
                const target = e.target;
                const clickableElements = [
                    'button', 
                    '.server-item', 
                    '.link-icon', 
                    '.main-tab',
                    '.window-control',
                    '.filter-button',
                    '.tab',
                    '.code-badge',
                    '.subcategory-button',
                    '.settings-button',
                    '.sound-preview-btn',
                    '.modal-button'
                ];
                
                const isClickable = clickableElements.some(selector => 
                    target.matches && target.matches(selector)
                );
                
                if (isClickable) {
                    this.play('hover');
                }
            }, { passive: true });
        },
        
        play(type, options = {}) {
            if (!this.enabled) return;
            
            let soundType = type;
            const typeMap = {
                'copy': 'copy',
                'error': 'error',
                'hover': 'hover',
                'notification': 'modal',
                'modal': 'modal',
                'toggle': 'select',
                'select': 'select',
                'settings': 'settings',
                'slider': 'slider',
                'tick': 'tick',
                'move': 'move',
                'moveBack': 'moveBack',
                'success': 'modal'
            };
            
            soundType = typeMap[type] || type;
            
            const audio = this.audioElements[soundType];
            if (!audio) {
                console.warn(`[Sound] Sound not found: ${soundType}`);
                return;
            }
            
            try {
                const audioClone = audio.cloneNode();
                audioClone.volume = this.volume / 100;
                
                if (options.delay) {
                    setTimeout(() => {
                        audioClone.play().catch(e => console.warn('[Sound] Play failed:', e));
                    }, options.delay);
                } else {
                    audioClone.play().catch(e => console.warn('[Sound] Play failed:', e));
                }
                
                audioClone.addEventListener('ended', () => {
                    audioClone.remove();
                });
                
            } catch (e) {
                console.warn(`[Sound] Failed to play ${soundType}:`, e);
            }
        },
        
        playCopy() {
            this.play('copy');
        },
        
        playError() {
            this.play('error');
        },
        
        playHover() {
            this.play('hover');
        },
        
        playNotification() {
            this.play('notification');
        },
        
        playToggle() {
            this.play('toggle');
        },
        
        playSettings() {
            this.play('settings');
        },
        
        playSlider() {
            this.play('slider');
        },
        
        playMove() {
            this.play('move');
        },
        
        playMoveBack() {
            this.play('moveBack');
        },
        
        playSuccess() {
            this.play('success');
        },
        
        setEnabled(enabled) {
            this.enabled = enabled;
            this.saveSettings();
        },
        
        setVolume(volume) {
            this.volume = Math.max(0, Math.min(100, volume));
            this.saveSettings();
        },
        
        test() {
            this.play('notification');
            setTimeout(() => this.play('copy'), 300);
            setTimeout(() => this.play('toggle'), 600);
            setTimeout(() => this.play('slider'), 900);
        },
        
        preview(type) {
            this.play(type);
        }
    };

    window.SoundManager = SoundManager;

})();