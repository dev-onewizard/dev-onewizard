// main-window.js
const MainState = {
    servers: [],
    selectedServer: '',
    currentHotkey: 'Ctrl+Shift+K',
    isEditing: false,
    lastUpdateDate: null,
    updatesHistory: [],
    activeMainTab: 'main'
};

async function initMainWindow() {
    console.log('[Main] Initializing...');
    
    setupWindowControls();
    setupMainTabs();
    await loadServers();
    await loadSelectedServer();
    loadHotkey();
    loadAutoHide();
    await loadUpdatesHistory();
    
    setupEventListeners();
    setupHotkeyEditor();
    setupThemeToggle();
    
    if (window.SoundManager) {
        window.SoundManager.init();
    }
    
    if (window.SettingsManager) {
        window.SettingsManager.init();
    }
    
    console.log('[Main] Ready');
}

function setupMainTabs() {
    const tabMain = document.getElementById('tab-main');
    const tabSettings = document.getElementById('tab-settings');
    const mainContent = document.getElementById('main-content');
    const settingsContent = document.getElementById('settings-content');
    
    if (!tabMain || !tabSettings || !mainContent || !settingsContent) {
        console.log('[Main] Tabs not found');
        return;
    }
    
    tabMain.addEventListener('click', () => {
        if (MainState.activeMainTab === 'main') return;
        
        MainState.activeMainTab = 'main';
        
        tabMain.classList.add('active');
        tabSettings.classList.remove('active');
        mainContent.classList.remove('hidden');
        settingsContent.classList.add('hidden');
        
        if (window.SoundManager) SoundManager.play('toggle');
    });
    
    tabSettings.addEventListener('click', () => {
        if (MainState.activeMainTab === 'settings') return;
        
        MainState.activeMainTab = 'settings';
        
        tabSettings.classList.add('active');
        tabMain.classList.remove('active');
        settingsContent.classList.remove('hidden');
        mainContent.classList.add('hidden');
        
        if (window.SettingsManager) {
            window.SettingsManager.updateCacheSize();
        }
        
        if (window.SoundManager) SoundManager.play('toggle');
    });
}

function setupWindowControls() {
    document.getElementById('minimize-button')?.addEventListener('click', () => {
        window.CodexAPI.window.minimize();
        if (window.SoundManager) SoundManager.play('toggle');
    });
    
    document.getElementById('close-button')?.addEventListener('click', () => {
        window.CodexAPI.window.close();
    });
}

function setupThemeToggle() {
    const themeToggle = document.getElementById('theme-toggle');
    if (!themeToggle) {
        console.log('[Main] Theme toggle button not found');
        return;
    }
    
    console.log('[Main] Setting up theme toggle');
    
    updateThemeIcons();
    
    const newToggle = themeToggle.cloneNode(true);
    themeToggle.parentNode.replaceChild(newToggle, themeToggle);
    
    newToggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('[Main] Theme toggle clicked');
        
        if (window.ThemeManager) {
            window.ThemeManager.toggleTheme();
            if (window.SoundManager) SoundManager.play('toggle');
        } else {
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateThemeIcons();
            
            if (window.ThemeManager) {
                window.ThemeManager.init();
            }
        }
    });
    
    window.addEventListener('storage', (e) => {
        if (e.key === 'theme') {
            console.log('[Main] Theme changed in storage:', e.newValue);
            updateThemeIcons();
        }
    });
}

function updateThemeIcons() {
    const lightIcon = document.querySelector('.theme-icon-light');
    const darkIcon = document.querySelector('.theme-icon-dark');
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    
    if (!lightIcon || !darkIcon) return;
    
    if (currentTheme === 'dark') {
        lightIcon.style.display = 'none';
        darkIcon.style.display = 'block';
    } else {
        lightIcon.style.display = 'block';
        darkIcon.style.display = 'none';
    }
}

async function loadServers() {
    const button = document.getElementById('server-selector-button');
    const serverText = document.getElementById('server-text');
    
    try {
        const cachedServers = Utils.loadFromOfflineCache('servers');
        if (cachedServers) {
            MainState.servers = cachedServers;
            button.disabled = false;
            renderServersList();
            serverText.textContent = 'Серверы загружены';
        }
        
        const servers = await window.CodexAPI.laws.listServers();
        if (servers && servers.length > 0) {
            MainState.servers = servers;
            Utils.saveToOfflineCache('servers', null, servers);
            renderServersList();
            button.disabled = false;
        }
    } catch (error) {
        console.error('[Main] Failed to load servers:', error);
        if (!MainState.servers.length) {
            serverText.textContent = 'Ошибка загрузки';
        }
    }
}

function renderServersList() {
    const list = document.getElementById('servers-list');
    if (!list) return;
    
    list.innerHTML = MainState.servers.map(server => {
        const icon = Utils.getServerIcon(server.id);
        const selected = server.id === MainState.selectedServer ? 'selected' : '';
        return `<div class="server-item ${selected}" data-server-id="${server.id}">
            <span class="server-icon">${icon}</span>
            <span>${Utils.escapeHtml(server.name)}</span>
        </div>`;
    }).join('');
    
    list.querySelectorAll('.server-item').forEach(item => {
        item.addEventListener('click', () => selectServer(item.dataset.serverId));
    });
}

async function loadSelectedServer() {
    try {
        const serverId = await window.CodexAPI.server.getCurrent();
        if (serverId) {
            MainState.selectedServer = serverId;
            localStorage.setItem('selectedServer', serverId);
        }
    } catch (error) {
        console.error('[Main] Failed to get current server:', error);
    }
    
    if (!MainState.selectedServer) {
        const saved = localStorage.getItem('selectedServer');
        const defaultServer = MainState.servers.find(s => s.id.includes('los-angeles-7')) || 
                              MainState.servers.find(s => s.id.includes('los-angeles')) ||
                              MainState.servers[0];
        
        if (saved && MainState.servers.some(s => s.id === saved)) {
            MainState.selectedServer = saved;
        } else if (defaultServer) {
            MainState.selectedServer = defaultServer.id;
            localStorage.setItem('selectedServer', defaultServer.id);
        }
    }
    
    updateServerButton();
    renderServersList();
    setupServerDropdown();
    
    if (MainState.selectedServer) {
        loadServerData(MainState.selectedServer);
    }
}

function updateServerButton() {
    const button = document.getElementById('server-selector-button');
    const iconSpan = document.getElementById('server-icon');
    const textSpan = document.getElementById('server-text');
    
    if (!button || !iconSpan || !textSpan) return;
    
    const server = MainState.servers.find(s => s.id === MainState.selectedServer);
    if (server) {
        iconSpan.innerHTML = Utils.getServerIcon(server.id);
        textSpan.textContent = server.name;
    }
}

function setupServerDropdown() {
    const button = document.getElementById('server-selector-button');
    const dropdown = document.getElementById('server-dropdown');
    
    button.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('hidden');
    });
    
    document.addEventListener('click', (e) => {
        if (!button.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    });
}

function selectServer(serverId) {
    if (serverId === MainState.selectedServer) return;
    
    MainState.selectedServer = serverId;
    localStorage.setItem('selectedServer', serverId);
    
    updateServerButton();
    renderServersList();
    document.getElementById('server-dropdown')?.classList.add('hidden');
    
    window.CodexAPI.server.select(serverId);
    
    loadServerData(serverId);
}

async function loadServerData(serverId) {
    try {
        const data = await window.CodexAPI.laws.getServerData(serverId);
        if (data?.updatedAt) {
            MainState.lastUpdateDate = data.updatedAt;
            updateLastUpdateDate(data.updatedAt);
            Utils.saveToOfflineCache('laws', serverId, data);
        }
    } catch (error) {
        console.error('[Main] Failed to load server data:', error);
        
        const cached = Utils.loadFromOfflineCache('laws', serverId);
        if (cached?.updatedAt) {
            MainState.lastUpdateDate = cached.updatedAt;
            updateLastUpdateDate(cached.updatedAt);
        }
    }
}

function updateLastUpdateDate(timestamp) {
    const indicator = document.getElementById('update-indicator');
    const lastUpdate = document.getElementById('last-update-text');
    
    if (!indicator || !lastUpdate) return;
    
    if (timestamp) {
        const date = new Date(timestamp);
        lastUpdate.textContent = `Последнее изменение: ${date.toLocaleDateString('ru-RU')}`;
        indicator.classList.remove('hidden');
        
        // Форсируем reflow → transition корректно воспроизведётся с opacity 0 → 1
        indicator.style.opacity = '0';
        indicator.style.transition = 'opacity 0.3s ease';
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                indicator.style.opacity = '1';
                indicator.addEventListener('transitionend', () => {
                    indicator.style.transition = '';
                }, { once: true });
            });
        });
    }
}

function loadHotkey() {
    const display = document.getElementById('hotkey-display');
    const saved = localStorage.getItem('hotkey');
    
    if (saved) {
        MainState.currentHotkey = saved;
        display.textContent = saved;
    }
    
    window.CodexAPI.config.getHotkey().then(result => {
        if (result?.toggleSearch) {
            MainState.currentHotkey = result.toggleSearch;
            display.textContent = result.toggleSearch;
            localStorage.setItem('hotkey', result.toggleSearch);
        }
    });
}

function setupHotkeyEditor() {
    const editor = document.getElementById('hotkey-editor');
    const display = document.getElementById('hotkey-display');
    
    if (!editor || !display) return;
    
    editor.addEventListener('click', startHotkeyEditing);
    editor.addEventListener('keydown', handleHotkeyInput);
    
    document.addEventListener('mousedown', (e) => {
        if (MainState.isEditing && !editor.contains(e.target)) {
            stopHotkeyEditing(false);
        }
    });
    
    document.addEventListener('keydown', (e) => {
        if (MainState.isEditing && e.key === 'Escape') {
            e.preventDefault();
            stopHotkeyEditing(false);
        }
    });
}

function startHotkeyEditing() {
    if (MainState.isEditing) return;
    
    MainState.isEditing = true;
    const editor = document.getElementById('hotkey-editor');
    const display = document.getElementById('hotkey-display');
    
    editor.classList.add('editing');
    display.textContent = 'Нажмите комбинацию';
    
    editor.style.transform = 'scale(1.02)';
    editor.style.transition = 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)';
    editor.addEventListener('transitionend', () => {
        editor.style.transform = 'scale(1)';
        editor.addEventListener('transitionend', () => {
            editor.style.transition = '';
        }, { once: true });
    }, { once: true });
    
    window.CodexAPI.hotkey.startEditing();
}

function stopHotkeyEditing(save = false) {
    if (!MainState.isEditing) return;
    
    MainState.isEditing = false;
    document.getElementById('hotkey-editor').classList.remove('editing');
    
    if (!save) {
        document.getElementById('hotkey-display').textContent = MainState.currentHotkey;
    }
    
    window.CodexAPI.hotkey.stopEditing();
}

function handleHotkeyInput(e) {
    if (!MainState.isEditing) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const modifiers = {
        ctrl: e.ctrlKey,
        shift: e.shiftKey,
        alt: e.altKey,
        meta: e.metaKey
    };
    
    const keyCode = e.code;
    
    // Если нажата только клавиша-модификатор, показываем ожидание
    if (keyCode.startsWith('Control') || keyCode.startsWith('Shift') || 
        keyCode.startsWith('Alt') || keyCode.startsWith('Meta')) {
        
        const parts = [];
        if (modifiers.ctrl) parts.push('Ctrl');
        if (modifiers.shift) parts.push('Shift');
        if (modifiers.alt) parts.push('Alt');
        if (modifiers.meta) parts.push('Cmd');
        
        if (parts.length > 0) {
            document.getElementById('hotkey-display').textContent = parts.join('+') + '+...';
        }
        return;
    }
    
    const hotkey = window.CodexAPI.utils.normalizeHotkeyFromKeyCode(keyCode, modifiers);
    
    if (!hotkey) {
        console.log('[Hotkey] Unsupported key:', keyCode);
        showHotkeyError('Неподдерживаемая клавиша');
        return;
    }
    
    // Проверяем валидность комбинации
    if (!window.CodexAPI.utils.validateHotkey(hotkey)) {
        showHotkeyError('Недопустимая комбинация');
        return;
    }
    
    // Проверяем зарезервированные комбинации
    const reservedCombos = [
        'F12', 'Ctrl+I', 'Ctrl+Shift+I', 'Cmd+I', 'Cmd+Shift+I',
        'Ctrl+Alt+Delete', 'Ctrl+Shift+Escape', 'Alt+Tab', 'Ctrl+Esc'
    ];
    
    if (reservedCombos.includes(hotkey)) {
        showHotkeyError('Зарезервировано системой');
        return;
    }
    
    // Предупреждение для потенциально опасных одиночных клавиш
    const dangerousKeys = ['Escape', 'Enter', 'Tab', 'Space', 'Backspace'];
    const parts = hotkey.split('+');
    
    if (parts.length === 1 && dangerousKeys.includes(hotkey)) {
        showHotkeyError('Эта клавиша может конфликтовать с системой');
        return;
    }
    
    MainState.currentHotkey = hotkey;
    document.getElementById('hotkey-display').textContent = hotkey;
    localStorage.setItem('hotkey', hotkey);
    
    window.CodexAPI.hotkey.change(hotkey);
    
    stopHotkeyEditing(true);
    Notification.show('Горячая клавиша сохранена');
    if (window.SoundManager) SoundManager.play('select');
}

function showHotkeyError(message) {
    const display = document.getElementById('hotkey-display');
    display.textContent = message;
    
    display.style.transition = 'color 0.2s ease';
    display.style.color = 'var(--error-color)';
    
    setTimeout(() => {
        display.style.color = '';
        display.addEventListener('transitionend', () => {
            display.style.transition = '';
            if (MainState.isEditing) display.textContent = 'Нажмите комбинацию';
        }, { once: true });
    }, 1000);
    
    if (window.SoundManager) SoundManager.play('error');
}

function loadAutoHide() {
    const saved = localStorage.getItem('autoHideEnabled');
    if (saved !== null) {
        window.CodexAPI.config.setAutoHide(saved === 'true');
    }
}

async function loadUpdatesHistory() {
    const container = document.getElementById('updates-list');
    if (!container) return;
    
    try {
        const response = await fetch('../releases.json');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        renderUpdates(data.updates || []);
    } catch (error) {
        console.error('[Main] Failed to load updates:', error);
        container.innerHTML = '<div class="empty-state"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6B7280"><circle cx="12" cy="12" r="10" stroke-width="1.5"/><line x1="12" y1="8" x2="12" y2="12" stroke-width="1.5"/><circle cx="12" cy="16" r="0.5" fill="#6B7280"/></svg><div class="empty-state-title">История обновлений временно недоступна</div></div>';
    }
}

function renderUpdates(updates) {
    const container = document.getElementById('updates-list');
    if (!container) return;
    
    if (!updates.length) {
        container.innerHTML = '<div class="empty-state">История пуста</div>';
        return;
    }
    
    container.innerHTML = '<div class="updates-timeline">' + 
        updates.map((update, i) => `
            <div class="update-item ${i === updates.length - 1 ? 'last' : ''}">
                <div class="update-timeline-dot"></div>
                <div class="update-content">
                    <div class="update-date">${Utils.escapeHtml(update.date)}</div>
                    <ul class="update-items">
                        ${update.items.map(item => `<li class="update-item-text">${Utils.escapeHtml(item)}</li>`).join('')}
                    </ul>
                </div>
            </div>
        `).join('') + '</div>';
    
    container.style.opacity = '0';
    container.style.transition = 'opacity 0.3s ease';
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            container.style.opacity = '1';
            container.addEventListener('transitionend', () => {
                container.style.transition = '';
            }, { once: true });
        });
    });
}

function setupUpdateHandlers() {
    const api = window.CodexAPI.updates;
    
    api.onAvailable((version) => {
        console.log('[Updates] Available:', version);
    });
    
    api.onProgress((progress) => {});
    
    api.onDownloaded((version) => {
        showUpdateModal(version);
        if (window.SoundManager) SoundManager.play('notification');
    });
}

function showUpdateModal(version) {
    const modal = document.getElementById('update-modal');
    const versionSpan = document.getElementById('update-version');
    
    if (!modal || !versionSpan) return;
    
    versionSpan.textContent = version;
    modal.classList.remove('hidden');
    modal.classList.add('show');
    
    modal.style.opacity = '0';
    modal.style.transition = 'opacity 0.3s ease';
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            modal.style.opacity = '1';
            modal.addEventListener('transitionend', () => {
                modal.style.transition = '';
            }, { once: true });
        });
    });
}

function setupEventListeners() {
    const unsubscribe = window.CodexAPI.server.onChange((serverId) => {
        console.log('[Main] Server changed to:', serverId);
        MainState.selectedServer = serverId;
        updateServerButton();
        renderServersList();
        loadServerData(serverId);
    });
    
    document.getElementById('update-install-now')?.addEventListener('click', () => {
        window.CodexAPI.updates.install();
        const modal = document.getElementById('update-modal');
        modal.style.transition = 'opacity 0.3s ease';
        modal.style.opacity = '0';
        modal.addEventListener('transitionend', () => {
            modal.classList.add('hidden');
            modal.style.opacity = '';
            modal.style.transition = '';
        }, { once: true });
        if (window.SoundManager) SoundManager.play('select');
    });
    
    document.getElementById('update-install-later')?.addEventListener('click', () => {
        const modal = document.getElementById('update-modal');
        modal.style.transition = 'opacity 0.3s ease';
        modal.style.opacity = '0';
        modal.addEventListener('transitionend', () => {
            modal.classList.add('hidden');
            modal.style.opacity = '';
            modal.style.transition = '';
        }, { once: true });
        if (window.SoundManager) SoundManager.play('toggle');
    });
    
    document.querySelectorAll('.link-icon').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            window.CodexAPI.utils.openExternal(link.href);
            
            link.style.transition = 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)';
            link.style.transform = 'scale(0.95)';
            link.addEventListener('transitionend', () => {
                link.style.transform = '';
                link.addEventListener('transitionend', () => {
                    link.style.transition = '';
                }, { once: true });
            }, { once: true });
            
            if (window.SoundManager) SoundManager.play('click');
        });
        
        link.addEventListener('mouseenter', () => {
            if (window.SoundManager && SoundManager.soundHover) SoundManager.play('hover');
        });
    });
    
    document.querySelectorAll('.server-selector-button, .hotkey-editor, .link-icon').forEach(el => {
        el.addEventListener('mouseenter', () => {
            el.style.transition = 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)';
            if (window.SoundManager && SoundManager.soundHover) {
                SoundManager.play('hover');
            }
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('.main-window')) {
        initMainWindow();
        setupUpdateHandlers();
    }
});
