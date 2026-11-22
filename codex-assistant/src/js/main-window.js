// main-window.js
const MainState = {
    servers: [],
    selectedServer: '',
    currentHotkey: 'Ctrl+Shift+K',
    isEditing: false,
    lastUpdateDate: null,
    activeMainTab: 'main',
    activeProject: null,
    majesticLoad: null
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
        if (MainState.activeProject === 'majestic') loadServerData(MainState.selectedServer);
    });
    await loadUpdatesHistory();
    loadHotkey();
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
        showProjectOverview();
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
    document.getElementById('open-search').onclick = () => window.CodexAPI.window.openSearch('laws');
    document.getElementById('open-rules').onclick = () => window.CodexAPI.window.openSearch('rules');
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
    grid.addEventListener('click', event => {
        const card = event.target.closest('.project-card');
        if (card) openProject(card.dataset.project);
    });
    document.getElementById('back-projects').onclick = () => {
        const previous = MainState.activeProject;
        showProjectOverview();
        grid.querySelector('[data-project="' + previous + '"]')?.focus();
    };
}

function showProjectOverview() {
    MainState.activeProject = null;
    delete document.documentElement.dataset.project;
    document.getElementById('project-detail').classList.add('hidden');
    document.getElementById('project-overview').classList.remove('hidden');
}

function openProject(id) {
    if (!Object.hasOwn(projects, id)) return;
    const project = projects[id];
    MainState.activeProject = id;
    document.documentElement.dataset.project = id;
    document.getElementById('project-overview').classList.add('hidden');
    document.getElementById('project-detail').classList.remove('hidden');
    document.getElementById('majestic-controls').classList.toggle('hidden', !project.available);

    const heading = document.getElementById('project-title');
    heading.textContent = project.name;
    document.getElementById('project-logo').src = '../assets/projects/' + id + '.png';
    document.getElementById('project-description').textContent = project.available
        ? 'Законы и правила проекта'
        : 'Скоро здесь появятся законы и правила проекта.';
    heading.focus();
    if (!project.available) return;

    if (!MainState.majesticLoad) {
        MainState.majesticLoad = loadServers().then(() => {
            if (!MainState.servers.length) {
                MainState.majesticLoad = null;
                return;
            }
            return loadSelectedServer();
        });
    }
    window.CodexAPI.window.openSearch('laws');
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
    
    loadServerData(serverId);
}

async function loadServerData(serverId) {
    try {
        const data = await window.CodexAPI.laws.getServerData(serverId);
        if (serverId !== MainState.selectedServer) return;
        MainState.lastUpdateDate = data?.updatedAt || null;
        updateLastUpdateDate(MainState.lastUpdateDate);
    } catch (error) {
        console.warn('[Main] Data unavailable:', error);
    }
}

function updateLastUpdateDate(timestamp) {
    const indicator = document.getElementById('update-indicator');
    const lastUpdate = document.getElementById('last-update-text');
    
    if (!indicator || !lastUpdate) return;
    
    indicator.classList.toggle('hidden', !timestamp);
    if (timestamp) {
        const date = new Date(timestamp);
        lastUpdate.textContent = `Последнее изменение: ${date.toLocaleDateString('ru-RU')}`;
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
    if (!container) return;
    
    if (!updates.length) {
        container.innerHTML = '<div class="empty-state">История пуста</div>';
        return;
    }
    
    container.innerHTML = '<div class="updates-timeline">' + 
        updates.map(update => `
            <div class="update-item">
                <div class="update-content">
                    <div class="update-date">${Utils.escapeHtml(update.date)}</div>
                    <ul class="update-items">
                        ${update.items.map(item => `<li class="update-item-text">${Utils.escapeHtml(item)}</li>`).join('')}
                    </ul>
                </div>
            </div>
        `).join('') + '</div>';
    
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
            AppToast.show(`Доступна версия ${latest}. Откройте «Настройки», чтобы перейти к релизу.`);
        }
    });
}

function showUpdateModal(version) {
    const modal = document.getElementById('update-modal');
    document.getElementById('update-version').textContent = version;
    modal.classList.remove('hidden');
    document.getElementById('update-install-later').focus();
}

function setupEventListeners() {
    window.CodexAPI.server.onChange(serverId => {
        if (serverId === MainState.selectedServer) return;
        MainState.selectedServer = serverId;
        updateServerButton();
        renderServersList();
        loadServerData(serverId);
    });

    const modal = document.getElementById('update-modal');
    const close = () => modal.classList.add('hidden');
    document.getElementById('update-install-now').onclick = () => {
        window.CodexAPI.updates.install();
        close();
        SoundManager.play('select');
    };
    document.getElementById('update-install-later').onclick = close;
    modal.addEventListener('keydown', event => {
        if (event.key === 'Escape') close();
    });

    for (const link of document.querySelectorAll('.link-icon, .external-link')) {
        link.addEventListener('click', event => {
            event.preventDefault();
            window.CodexAPI.utils.openExternal(link.href);
            SoundManager.play('click');
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    setupUpdateHandlers();
    initMainWindow();
});
