// main-window.js
const MainState = {
    servers: [],
    selectedServer: '',
    currentHotkey: 'Ctrl+Shift+K',
    isEditing: false,
    activeMainTab: 'main'
};

const projects = {
    majestic: { name: 'Majestic RP', available: true },
    gta5rp: { name: 'GTA 5 RP', available: false },
    'russia-online': { name: 'Россия Онлайн', available: false }
};

async function initMainWindow() {
    console.log('[Main] Initializing...');
    
    setupWindowControls();
    setupMainTabs();
    setupProjectChooser();
    selectProject('majestic');
    setupServerDropdown();
    
    setupEventListeners();
    setupHotkeyEditor();
    
    if (window.SoundManager) {
        window.SoundManager.init();
    }
    
    if (window.SettingsManager) await window.SettingsManager.init();
    
    window.CodexAPI.preferences.onReset(() => {
        loadHotkey();
        MainState.selectedServer = 'new-york-1';
        updateServerButton();
        renderServersList();
    });
    loadHotkey();
    await Promise.all([loadUpdatesHistory(), loadServers().then(loadSelectedServer)]);
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
        tabMain.setAttribute('aria-pressed', 'true');
        tabSettings.classList.remove('active');
        tabSettings.setAttribute('aria-pressed', 'false');
        mainContent.classList.remove('hidden');
        settingsContent.classList.add('hidden');

        if (window.SoundManager) SoundManager.play('toggle');
    });
    
    tabSettings.addEventListener('click', () => {
        if (MainState.activeMainTab === 'settings') return;
        
        MainState.activeMainTab = 'settings';
        
        tabSettings.classList.add('active');
        tabSettings.setAttribute('aria-pressed', 'true');
        tabMain.classList.remove('active');
        tabMain.setAttribute('aria-pressed', 'false');
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

function setupProjectChooser() {
    const grid = document.getElementById('project-grid');
    for (const card of grid.querySelectorAll('.project-card')) {
        card.querySelector('.project-status').hidden = projects[card.dataset.project].available;
    }
    grid.addEventListener('click', event => {
        const card = event.target.closest('.project-card');
        if (card) selectProject(card.dataset.project);
    });
}

function selectProject(id) {
    if (!Object.hasOwn(projects, id)) return;
    const project = projects[id];
    if (!project.available) {
        AppToast.show(project.name + ' — справочник появится позже. Горячая клавиша пока открывает поиск Majestic RP.', 'info');
        return;
    }

    document.documentElement.dataset.project = id;

    for (const card of document.querySelectorAll('.project-card')) {
        card.setAttribute('aria-pressed', String(card.dataset.project === id));
    }

    document.getElementById('majestic-controls').classList.toggle('hidden', id !== 'majestic');
}

async function loadServers() {
    const button = document.getElementById('server-selector-button');
    const serverText = document.getElementById('server-text');
    
    try {
        const servers = await window.CodexAPI.laws.listServers();
        if (servers && servers.length > 0) {
            MainState.servers = servers;
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
    list.innerHTML = MainState.servers.map(server => Utils.serverOption(server, MainState.selectedServer)).join('');
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
    const list = document.getElementById('servers-list');

    Utils.bindDropdown(button, dropdown);
    list.addEventListener('click', event => {
        const option = event.target.closest('.server-item');
        if (!option) return;
        Utils.setDropdown(button, dropdown, false);
        button.focus();
        selectServer(option.dataset.serverId);
    });
}

function selectServer(serverId) {
    if (serverId === MainState.selectedServer) return;
    
    MainState.selectedServer = serverId;
    localStorage.setItem('selectedServer', serverId);
    
    updateServerButton();
    renderServersList();
    
    window.CodexAPI.server.select(serverId);

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

async function handleHotkeyInput(e) {
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
    
    try {
        if (!(await window.CodexAPI.config.setHotkey(hotkey)).ok) {
            showHotkeyError('Горячая клавиша уже занята');
            return;
        }
    } catch {
        showHotkeyError('Не удалось сохранить комбинацию');
        return;
    }
    MainState.currentHotkey = hotkey;
    document.getElementById('hotkey-display').textContent = hotkey;
    localStorage.setItem('hotkey', hotkey);
    
    stopHotkeyEditing(true);
    AppToast.show('Горячая клавиша сохранена');
    if (window.SoundManager) SoundManager.play('select');
}

function showHotkeyError(message) {
    const display = document.getElementById('hotkey-display');
    display.textContent = message;
    
display.style.color = 'var(--danger)';
    setTimeout(() => {
        display.style.color = '';
        if (MainState.isEditing && display.textContent === message) display.textContent = 'Нажмите комбинацию';
    }, 1000);

    if (window.SoundManager) SoundManager.play('error');
}

async function loadUpdatesHistory() {
    const container = document.getElementById('updates-list');
    if (!container) return;
    
    try {
        renderUpdates(await window.CodexAPI.updates.history());
    } catch (error) {
        console.error('[Main] Failed to load updates:', error);
        container.innerHTML = '<div class="empty-state"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6B7280"><circle cx="12" cy="12" r="10" stroke-width="1.5"/><line x1="12" y1="8" x2="12" y2="12" stroke-width="1.5"/><circle cx="12" cy="16" r="0.5" fill="#6B7280"/></svg><div class="empty-state-title">История обновлений временно недоступна</div></div>';
    }
}

function renderUpdates(updates) {
    const container = document.getElementById('updates-list');
    if (!updates.length) {
        container.textContent = 'История пока пуста';
        return;
    }
    container.innerHTML = updates.map((update, index) => {
        const version = Utils.escapeHtml(update.version);
        const date = Utils.escapeHtml(update.date);
        const items = update.items.map(item => '<p>' + Utils.escapeHtml(item) + '</p>').join('');
        return '<article class="release-card' + (index === 0 ? ' release-latest' : '') + '">' +
            '<header class="release-heading"><h3>' + (version ? 'Версия ' + version : date) + '</h3>' +
            (index === 0 ? '<span class="release-badge">Свежая</span>' : '') + '</header>' +
            (version ? '<p class="update-date">' + date + '</p>' : '') +
            '<div class="release-notes">' + items + '</div></article>';
    }).join('');
}

function setupUpdateHandlers() {
    const api = window.CodexAPI.updates;
    let notifiedVersion;
    api.onStatus(({ state, mode, latest }) => {
        if (latest === notifiedVersion) return;
        if (state === 'downloaded') {
            notifiedVersion = latest;
            showUpdateModal(latest);
            window.SoundManager?.play('notification');
        } else if (mode === 'portable' && state === 'available') {
            notifiedVersion = latest;
            AppToast.show(`Доступна версия ${latest}. Откройте «Настройки», чтобы перейти к релизу.`, 'info');
        }
    });
}

function showUpdateModal(version) {
    const confirmation = document.getElementById('confirm-modal');
    if (confirmation.open) {
        confirmation.addEventListener('close', () => showUpdateModal(version), { once: true });
        return;
    }
    const modal = document.getElementById('update-modal');
    document.getElementById('update-version').textContent = version;
    if (!modal.open) modal.showModal();
}

function setupEventListeners() {
    window.CodexAPI.server.onChange(serverId => {
        if (serverId === MainState.selectedServer) return;
        MainState.selectedServer = serverId;
        updateServerButton();
        renderServersList();
    });

    const modal = document.getElementById('update-modal');
    const close = () => modal.close();
    document.getElementById('update-install-now').onclick = () => {
        window.CodexAPI.updates.install();
        close();
        SoundManager.play('select');
    };
    document.getElementById('update-install-later').onclick = close;

    const linksButton = document.getElementById('links-button');
    const linksMenu = document.getElementById('links-dropdown');
    Utils.bindDropdown(linksButton, linksMenu);
    for (const link of document.querySelectorAll('.link-icon, .external-link')) {
        link.addEventListener('click', event => {
            event.preventDefault();
            if (linksMenu.contains(link)) {
                Utils.setDropdown(linksButton, linksMenu, false);
                linksButton.focus();
            }
            window.CodexAPI.utils.openExternal(link.href);
            SoundManager.play('click');
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    setupUpdateHandlers();
    initMainWindow();
});
