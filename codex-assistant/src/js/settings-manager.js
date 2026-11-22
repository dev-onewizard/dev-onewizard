(() => {
    const api = window.CodexAPI;
    const el = id => document.getElementById(id);

    function readLegacySettings() {
        try {
            const stored = JSON.parse(localStorage.getItem('app_settings') || '{}');
            const sound = JSON.parse(localStorage.getItem('sound_settings') || '{}');
            const opacity = localStorage.getItem('windowOpacity');
            return {
                ...stored,
                theme: localStorage.getItem('theme') || stored.theme,
                opacity: opacity === null ? stored.opacity : Number(opacity),
                soundEnabled: sound.enabled ?? stored.soundEnabled,
                soundVolume: sound.volume ?? stored.soundVolume
            };
        } catch {
            return {};
        }
    }

    function confirmAction(title, message, action) {
        const modal = el('confirm-modal');
        const yes = el('confirm-yes');
        const no = el('confirm-no');
        const previousFocus = document.activeElement;
        el('confirm-title').textContent = title;
        el('confirm-message').textContent = message;
        modal.classList.remove('hidden');
        modal.classList.add('show');
        no.focus();

        function close() {
            modal.classList.remove('show');
            modal.classList.add('hidden');
            document.removeEventListener('keydown', escape);
            previousFocus?.focus();
        }
        function escape(event) {
            if (event.key === 'Escape') close();
        }
        document.addEventListener('keydown', escape);
        no.onclick = close;
        modal.querySelector('.modal-overlay').onclick = close;
        yes.onclick = () => {
            close();
            action();
        };
    }

    const manager = {
        async init() {
            if (this.initialized) return;
            this.initialized = true;
            api.preferences.onChange(settings => this.render(settings));
            api.preferences.onReset(settings => this.render(settings));
            api.cache.onClear(() => this.updateCacheSize());
            api.updates.onStatus(status => this.renderUpdateStatus(status));
            el('settings-install-update').onclick = () => api.updates.install();

            el('settings-theme-toggle').onclick = () => {
                const theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
                this.save({ theme });
            };
            this.bindSlider('settings-opacity', 'opacity');
            this.bindSlider('settings-volume', 'soundVolume');
            el('settings-auto-hide').onchange = async event => {
                try {
                    if (!await api.config.setAutoHide(event.target.checked)) throw Error('Save failed');
                } catch {
                    AppToast.show('Не удалось изменить автоскрытие', 'error');
                }
            };
            el('settings-sound-enabled').onchange = event => this.save({ soundEnabled: event.target.checked });
            el('settings-auto-update').onchange = event => this.save({ autoUpdate: event.target.checked });
            el('settings-check-updates').onclick = () => this.checkForUpdates();
            el('settings-clear-cache').onclick = () => confirmAction(
                'Очистить кэш?', 'Сохранённые копии законов и правил будут удалены.',
                () => this.clearCache()
            );
            el('settings-reset-all').onclick = () => confirmAction(
                'Сбросить настройки?', 'Вернутся исходные значения темы, звука, прозрачности, сервера и горячей клавиши.',
                () => this.resetAllSettings()
            );
            document.querySelectorAll('.sound-preview-btn').forEach(button => {
                button.onclick = () => window.SoundManager?.preview(button.dataset.sound);
            });
            try {
                this.render(await api.preferences.save(readLegacySettings(), true));
            } catch {
                AppToast.show('Не удалось загрузить настройки', 'error');
            }
            this.updateVersionInfo();
            this.updateCacheSize();
            this.renderUpdateStatus(await api.updates.getStatus());
        },

        bindSlider(id, key) {
            const slider = el(id + '-slider');
            const value = el(id + '-value');
            slider.oninput = () => {
                Utils.renderRange(slider, value, slider.value);
            };
            slider.onchange = () => this.save({ [key]: Number(slider.value) });
        },

        async save(changes) {
            try { await api.preferences.save(changes); }
            catch { AppToast.show('Не удалось сохранить настройку', 'error'); }
        },

        render(settings) {
            Utils.applyTheme(settings.theme);
            window.SoundManager?.setEnabled(settings.soundEnabled);
            window.SoundManager?.setVolume(settings.soundVolume);
            el('settings-theme-text').textContent = settings.theme === 'light' ? 'Светлая' : 'Тёмная';
            Utils.renderRange(el('settings-opacity-slider'), el('settings-opacity-value'), settings.opacity);
            Utils.renderRange(el('settings-volume-slider'), el('settings-volume-value'), settings.soundVolume);
            el('settings-auto-hide').checked = settings.autoHide;
            el('settings-sound-enabled').checked = settings.soundEnabled;
            el('settings-auto-update').checked = settings.autoUpdate;
        },

        async updateVersionInfo() {
            try {
                const { version } = await api.app.getInfo();
                el('settings-current-version').textContent = version;
            } catch {
                el('settings-current-version').textContent = 'Недоступно';
            }
        },

        async updateCacheSize() {
            try {
                const size = await api.cache.size();
                el('settings-cache-size').textContent = size ? (size / 1048576).toFixed(2) + ' МБ' : '0 Б';
            } catch {
                el('settings-cache-size').textContent = 'Недоступно';
            }
        },

        async clearCache() {
            try {
                await api.cache.clear();
                Utils.clearAllCache();
                await this.updateCacheSize();
                AppToast.show('Кэш очищен');
            } catch {
                AppToast.show('Не удалось очистить кэш', 'error');
            }
        },

        async resetAllSettings() {
            try {
                const { hotkeySet } = await api.preferences.reset();
                for (const key of ['app_settings', 'theme', 'windowOpacity', 'autoHideEnabled', 'hotkey', 'sound_settings', 'autoUpdate', 'activeTab', 'searchQuery', 'selectedServer']) {
                    localStorage.removeItem(key);
                }
                this.render(await api.preferences.get());
                AppToast.show(hotkeySet ? 'Настройки сброшены' : 'Настройки сброшены. Ctrl+Shift+K занята.', hotkeySet ? 'success' : 'error');
            } catch {
                AppToast.show('Не удалось сбросить настройки', 'error');
            }
        },

        async checkForUpdates() {
            try {
                await api.updates.check();
                this.renderUpdateStatus(await api.updates.getStatus());
            } catch {
                AppToast.show('Не удалось проверить обновления', 'error');
            }
        },

        renderUpdateStatus({ state, mode, current, latest, percent }) {
            const installed = mode === 'installed';
            const portable = mode === 'portable';
            el('settings-auto-update-row').classList.toggle('hidden', !installed && !portable);
            el('settings-auto-update-label').textContent = installed
                ? 'Автоматическое обновление' : 'Проверять обновления автоматически';
            const help = {
                installed: 'Новые версии устанавливаются при выходе из приложения.',
                portable: 'Обновление переносной версии можно скачать вручную.',
                development: 'Новую версию можно скачать вручную.',
                manual: 'Новую версию можно скачать вручную.'
            };
            el('settings-update-mode').textContent = help[mode];

            const messages = {
                checking: 'Проверяем наличие обновлений…',
                current: `Обновлений нет. Текущая версия ${current}.`,
                available: `Доступна версия ${latest}.`,
                downloading: `Загружается версия ${latest}${percent === undefined ? '…' : ` — ${percent}%`}`,
                downloaded: `Версия ${latest} готова к установке.`,
                installing: `Запускается установка версии ${latest}…`,
                'check-error': 'Не удалось проверить обновления. Попробуйте ещё раз.',
                'download-error': 'Не удалось скачать обновление. Попробуйте ещё раз.',
                'install-error': 'Не удалось запустить установку. Попробуйте ещё раз.'
            };
            el('settings-update-info').classList.toggle('hidden', state === 'idle');
            el('settings-update-message').textContent = messages[state] || '';
            el('settings-check-updates').disabled = ['checking', 'downloading', 'installing'].includes(state);
            el('settings-install-update').classList.toggle('hidden', !['downloaded', 'install-error'].includes(state));
            el('settings-update-release').classList.toggle('hidden', !['available', 'check-error', 'download-error', 'install-error'].includes(state));
            const progress = el('settings-update-progress');
            progress.classList.toggle('hidden', state !== 'downloading');
            if (percent === undefined) progress.removeAttribute('value');
            else progress.value = percent;
        }
    };
    window.SettingsManager = manager;
})();
