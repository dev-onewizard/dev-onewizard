// search-window.js
const SearchState = {
    lawsData: [],
    rulesData: { general: {}, events: {}, organizations: {} },
    lawsCache: new (window.LRUCache || Map)(3), // LRU: макс. 3 сервера в памяти
    
    activeTab: 'laws',
    lawCategory: 'all',
    ruleCategory: 'all',
    subcategory: null,
    
    searchQuery: '',
    filteredLaws: [],
    filteredRules: [],
    lawsLimit: 20,
    rulesLimit: 20,
    
    isLoading: false,
    currentServer: null,
    
    availableSubcategories: { general: {}, events: {}, organizations: {} },
    
    lawsLoaded: false,
    rulesLoaded: false,
    
    servers: [],
    
    initializing: true,
    
    showServerSelector: true,
    
    scrollPositions: {
        laws: {},
        rules: {}
    },
    
    currentCategory: null,
    
    loadError: null,
    
    lastActivityTime: Date.now(),
    activityCheckInterval: null,
    isUserActive: true
};

let activitySetupDone = false;
let opacityListenersSetup = false;

async function initSearchWindow() {
    console.log('[Search] Initializing...');
    
    // Инициализируем SoundManager если он есть
    if (window.SoundManager && !window.SoundManager.initialized) {
        window.SoundManager.init();
        console.log('[Search] SoundManager initialized');
    }
    
    showLoading();
    
    try {
        await loadServersList();
        
        await loadRules();
        SearchState.rulesLoaded = true;
        
        const serverId = await getCurrentServer();
        console.log('[Search] Current server:', serverId);
        SearchState.currentServer = serverId;
        
        await loadLaws(serverId);
        
        setupTabs();
        setupSearch();
        setupFilters();
        setupAutoHide();
        setupOpacitySlider();
        setupInfiniteScroll();
        setupCopyHandlers();
        setupServerSelector();
        setupSettingsSync();
        
        setupActivityTracking();
        
        window.CodexAPI.server.onChange(async (newServerId) => {
            console.log('[Search] Server changed to:', newServerId);
            
            SearchState.currentServer = newServerId;
            updateSearchServerButton(newServerId);
            updateServersListSelection(newServerId);
            
            if (SearchState.activeTab === 'laws') {
                await loadLaws(newServerId);
                renderResults();
            }
        });
        
        const savedTab = localStorage.getItem('activeTab');
        if (savedTab === 'laws' || savedTab === 'rules') {
            SearchState.activeTab = savedTab;
        }
        
        if (SearchState.activeTab === 'laws') {
            activateLawsTab();
            if (SearchState.lawsLoaded) {
                filterLaws();
                renderResults();
            }
        } else {
            activateRulesTab();
            if (SearchState.rulesLoaded) {
                filterRules();
                renderResults();
            }
        }
        
        SearchState.initializing = false;
        console.log('[Search] Ready');
        
    } catch (error) {
        console.error('[Search] Init error:', error);
        SearchState.loadError = error.message;
        showError('Ошибка загрузки. Проверьте подключение к интернету.');
        if (window.SoundManager) SoundManager.play('error');
    }
}

function setupSettingsSync() {
    const storageHandler = (e) => {
        if (e.key === 'windowOpacity' && e.newValue !== null) {
            const value = parseInt(e.newValue);
            const slider = document.getElementById('opacity-slider');
            const valueDisplay = document.getElementById('opacity-value');
            if (slider && valueDisplay) {
                slider.value = value;
                valueDisplay.textContent = value + '%';
                applyOpacity(value);
            }
        }
        
        if (e.key === 'autoHideEnabled' && e.newValue !== null) {
            const checkbox = document.getElementById('auto-hide-checkbox');
            if (checkbox) {
                checkbox.checked = e.newValue === 'true';
            }
        }
        
        if (e.key === 'sound_settings' && e.newValue !== null) {
            try {
                const settings = JSON.parse(e.newValue);
                if (window.SoundManager) {
                    window.SoundManager.setEnabled(settings.enabled);
                    window.SoundManager.setVolume(settings.volume);
                }
            } catch (error) {
                console.warn('[Search] Failed to parse sound settings:', error);
            }
        }
    };
    
    window.removeEventListener('storage', storageHandler);
    window.addEventListener('storage', storageHandler);
}

function setupActivityTracking() {
    if (activitySetupDone) {
        console.log('[Activity] Tracking already set up');
        return;
    }
    
    console.log('[Activity] Setting up activity tracking');
    
    const activityEvents = [
        'mousemove', 'mousedown', 'click', 'keydown', 
        'scroll', 'wheel', 'touchstart', 'touchmove'
    ];
    
    const activityHandler = () => {
        SearchState.lastActivityTime = Date.now();
        SearchState.isUserActive = true;
        
        if (window.CodexAPI && window.CodexAPI.activity) {
            window.CodexAPI.activity.userAction();
        }
    };
    
    activityEvents.forEach(event => {
        document.removeEventListener(event, activityHandler);
        document.addEventListener(event, activityHandler, { passive: true });
    });
    
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.removeEventListener('input', activityHandler);
        searchInput.removeEventListener('focus', activityHandler);
        searchInput.addEventListener('input', activityHandler);
        searchInput.addEventListener('focus', activityHandler);
    }
    
    if (SearchState.activityCheckInterval) {
        clearInterval(SearchState.activityCheckInterval);
    }
    
    SearchState.activityCheckInterval = setInterval(() => {
        const now = Date.now();
        const inactiveTime = now - SearchState.lastActivityTime;
        
        if (inactiveTime > 5000) {
            SearchState.isUserActive = false;
        }
    }, 1000);
    
    activitySetupDone = true;
    console.log('[Activity] Tracking setup complete');
}

async function getCurrentServer() {
    try {
        const localServer = localStorage.getItem('selectedServer');
        if (localServer) {
            return localServer;
        }
        
        const serverId = await window.CodexAPI.server.getCurrent();
        if (serverId) {
            localStorage.setItem('selectedServer', serverId);
            return serverId;
        }
    } catch (error) {
        console.error('[Search] Failed to get current server:', error);
    }
    
    return 'new-york-1';
}

async function loadServersList() {
    try {
        const cachedServers = Utils.loadFromOfflineCache('servers');
        if (cachedServers) {
            SearchState.servers = cachedServers;
            renderServersDropdown();
        }
        
        const servers = await window.CodexAPI.laws.listServers();
        if (servers && servers.length > 0) {
            SearchState.servers = servers;
            Utils.saveToOfflineCache('servers', null, servers);
            renderServersDropdown();
        }
        
        const currentServer = await getCurrentServer();
        SearchState.currentServer = currentServer;
        updateSearchServerButton(currentServer);
        updateServersListSelection(currentServer);
    } catch (error) {
        console.error('[Search] Failed to load servers:', error);
        if (!SearchState.servers.length) {
            document.getElementById('search-server-text').textContent = 'Ошибка загрузки';
        }
    }
}

function renderServersDropdown() {
    const list = document.getElementById('search-servers-list');
    const button = document.getElementById('search-server-button');
    
    if (!list || !button) return;
    
    button.disabled = false;
    
    const currentServer = SearchState.currentServer || localStorage.getItem('selectedServer') || 'new-york-1';
    
    list.innerHTML = SearchState.servers.map(server => {
        const icon = Utils.getServerIcon(server.id);
        const selected = server.id === currentServer ? 'selected' : '';
        return `<div class="server-item ${selected}" data-server-id="${server.id}">
            <span class="server-icon">${icon}</span>
            <span>${Utils.escapeHtml(server.name)}</span>
        </div>`;
    }).join('');
    
    list.querySelectorAll('.server-item').forEach(item => {
        item.addEventListener('click', () => {
            const serverId = item.dataset.serverId;
            selectSearchServer(serverId);
        });
        
        item.addEventListener('mouseenter', () => {
            if (window.SoundManager) {
                SoundManager.play('hover');
            }
        });
    });
}

function updateServersListSelection(serverId) {
    const list = document.getElementById('search-servers-list');
    if (!list) return;
    
    list.querySelectorAll('.server-item').forEach(item => {
        item.classList.remove('selected');
    });
    
    const selectedItem = list.querySelector(`.server-item[data-server-id="${serverId}"]`);
    if (selectedItem) {
        selectedItem.classList.add('selected');
    }
}

function selectSearchServer(serverId) {
    getCurrentServer().then(currentServer => {
        if (serverId === currentServer) return;
        
        localStorage.setItem('selectedServer', serverId);
        SearchState.currentServer = serverId;
        
        updateSearchServerButton(serverId);
        updateServersListSelection(serverId);
        
        const dropdown = document.getElementById('search-server-dropdown');
        if (dropdown) dropdown.classList.add('hidden');
        
        window.CodexAPI.server.select(serverId);
        
        if (window.SoundManager) SoundManager.play('select');
        
        if (SearchState.activeTab === 'laws') {
            SearchState.lawsData = [];
            SearchState.filteredLaws = [];
            SearchState.lawsLoaded = false;
            
            loadLaws(serverId).then(() => {
                filterLaws();
                renderResults();
            });
        }
    });
}

function updateSearchServerButton(serverId) {
    const iconSpan = document.getElementById('search-server-icon');
    const textSpan = document.getElementById('search-server-text');
    
    if (!iconSpan || !textSpan) return;
    
    const server = SearchState.servers.find(s => s.id === serverId);
    if (server) {
        iconSpan.innerHTML = Utils.getServerIcon(server.id);
        textSpan.textContent = server.name;
    }
}

function setupServerSelector() {
    const button = document.getElementById('search-server-button');
    const dropdown = document.getElementById('search-server-dropdown');
    const selector = document.getElementById('search-server-selector');
    
    if (!button || !dropdown || !selector) return;
    
    button.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('hidden');
        if (window.SoundManager) SoundManager.play('click');
    });
    
    document.addEventListener('click', (e) => {
        if (!button.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    });
}

async function loadLaws(serverId) {
    console.log(`[Search] Loading laws for ${serverId}`);
    SearchState.isLoading = true;
    SearchState.loadError = null;
    
    if (SearchState.activeTab === 'laws' && !SearchState.initializing) {
        showLoading();
    }
    
    SearchState.lawsData = [];
    SearchState.filteredLaws = [];
    
    if (SearchState.lawsCache.has(serverId)) {
        console.log(`[Search] Using memory cache for ${serverId}`);
        const cachedData = SearchState.lawsCache.get(serverId);
        if (cachedData && cachedData.length > 0) {
            SearchState.lawsData = [...cachedData];
            SearchState.filteredLaws = [...cachedData];
            SearchState.lawsLimit = 20;
            
            updateLawFilters();
            SearchState.isLoading = false;
            SearchState.lawsLoaded = true;
            
            if (SearchState.activeTab === 'laws' && !SearchState.initializing) {
                filterLaws();
                renderResults();
            }
            return;
        }
    }
    
    const cachedLaws = Utils.loadFromOfflineCache('laws', serverId);
    if (cachedLaws && cachedLaws.items && cachedLaws.items.length > 0) {
        console.log(`[Search] Using offline cache for ${serverId} (${cachedLaws.items.length} laws)`);
        SearchState.lawsCache.set(serverId, cachedLaws.items);
        SearchState.lawsData = [...cachedLaws.items];
        SearchState.filteredLaws = [...cachedLaws.items];
        SearchState.lawsLimit = 20;
        
        updateLawFilters();
        SearchState.lawsLoaded = true;
    }
    
    try {
        console.log(`[Search] Fetching laws from server for ${serverId}`);
        const data = await window.CodexAPI.laws.getServerData(serverId);
        
        if (data && data.items && Array.isArray(data.items)) {
            if (data.items.length > 0) {
                console.log(`[Search] Loaded ${data.items.length} laws from server for ${serverId}`);
                SearchState.lawsCache.set(serverId, data.items);
                SearchState.lawsData = [...data.items];
                SearchState.filteredLaws = [...data.items];
                SearchState.lawsLimit = 20;
                
                Utils.saveToOfflineCache('laws', serverId, data);
                
                updateLawFilters();
                SearchState.lawsLoaded = true;
            } else {
                console.warn(`[Search] No laws items in data for ${serverId}`);
                if (!SearchState.lawsData.length) {
                    SearchState.lawsData = [];
                    SearchState.filteredLaws = [];
                }
                SearchState.lawsLoaded = true;
            }
        } else {
            console.warn(`[Search] Invalid data format for ${serverId}:`, data);
            if (SearchState.lawsData.length === 0) {
                SearchState.lawsData = [];
                SearchState.filteredLaws = [];
            }
            SearchState.lawsLoaded = true;
        }
    } catch (error) {
        console.error(`[Search] Failed to load laws for ${serverId}:`, error);
        SearchState.loadError = error.message;
        if (SearchState.lawsData.length === 0) {
            SearchState.lawsData = [];
            SearchState.filteredLaws = [];
        }
        SearchState.lawsLoaded = true;
        if (window.SoundManager) SoundManager.play('error');
    } finally {
        SearchState.isLoading = false;
        if (SearchState.activeTab === 'laws' && !SearchState.initializing) {
            filterLaws();
            renderResults();
        }
    }
}

async function loadRules() {
    console.log('[Search] Loading rules...');
    
    try {
        const cachedGeneral = Utils.loadFromOfflineCache('rules', 'general');
        const cachedEvents = Utils.loadFromOfflineCache('rules', 'events');
        const cachedOrgs = Utils.loadFromOfflineCache('rules', 'organizations');
        
        if (cachedGeneral && typeof cachedGeneral === 'object') SearchState.rulesData.general = cachedGeneral;
        if (cachedEvents && typeof cachedEvents === 'object') SearchState.rulesData.events = cachedEvents;
        if (cachedOrgs && typeof cachedOrgs === 'object') SearchState.rulesData.organizations = cachedOrgs;
        
        console.log('[Search] Fetching rules from server...');
        const [general, events, organizations] = await Promise.allSettled([
            window.CodexAPI.laws.fetchRules('general'),
            window.CodexAPI.laws.fetchRules('events'),
            window.CodexAPI.laws.fetchRules('organizations')
        ]);
        
        if (general.status === 'fulfilled' && general.value && typeof general.value === 'object' && Object.keys(general.value).length > 0) {
            console.log('[Search] Loaded general rules');
            SearchState.rulesData.general = general.value;
            Utils.saveToOfflineCache('rules', 'general', general.value);
        }
        
        if (events.status === 'fulfilled' && events.value && typeof events.value === 'object' && Object.keys(events.value).length > 0) {
            console.log('[Search] Loaded events rules');
            SearchState.rulesData.events = events.value;
            Utils.saveToOfflineCache('rules', 'events', events.value);
        }
        
        if (organizations.status === 'fulfilled' && organizations.value && typeof organizations.value === 'object' && Object.keys(organizations.value).length > 0) {
            console.log('[Search] Loaded organizations rules');
            SearchState.rulesData.organizations = organizations.value;
            Utils.saveToOfflineCache('rules', 'organizations', organizations.value);
        }
        
        updateSubcategoriesData();
        SearchState.rulesLoaded = true;
        console.log('[Search] Rules loaded successfully');
        
        if (SearchState.activeTab === 'rules' && !SearchState.initializing) {
            filterRules();
            renderResults();
        }
    } catch (error) {
        console.error('[Search] Failed to load rules:', error);
        if (Object.keys(SearchState.rulesData.general).length > 0 || 
            Object.keys(SearchState.rulesData.events).length > 0 || 
            Object.keys(SearchState.rulesData.organizations).length > 0) {
            SearchState.rulesLoaded = true;
        }
        if (window.SoundManager) SoundManager.play('error');
    }
}

function updateLawFilters() {
    const container = document.getElementById('laws-filters');
    if (!container) return;
    
    if (!SearchState.lawsData || SearchState.lawsData.length === 0) {
        container.innerHTML = '<button class="filter-button active" data-cat="all">Все</button>';
        return;
    }
    
    const sections = [...new Set(SearchState.lawsData.map(item => item.section).filter(Boolean))];
    console.log('[Filters] Found sections:', sections);
    
    const order = ['all', 'UAK', 'UK', 'AK', 'DK', 'PK'];
    
    let html = '<button class="filter-button active" data-cat="all">Все</button>';
    
    order.forEach(code => {
        if (sections.includes(code)) {
            html += `<button class="filter-button" data-cat="${code}">${CONSTANTS.LAW_NAMES[code] || code}</button>`;
        }
    });
    
    sections.forEach(section => {
        if (!order.includes(section) && section !== 'all' && section) {
            const label = Utils.escapeHtml(section);
            html += `<button class="filter-button" data-cat="${label}">${label}</button>`;
        }
    });
    
    container.innerHTML = html;
    
    container.querySelectorAll('.filter-button').forEach(btn => {
        btn.addEventListener('click', () => {
            container.querySelectorAll('.filter-button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            SearchState.lawCategory = btn.dataset.cat;
            SearchState.lawsLimit = 20;
            
            filterLaws();
            renderResults();
            if (window.SoundManager) SoundManager.play('click');
        });
        
        btn.addEventListener('mouseenter', () => {
            if (window.SoundManager) {
                SoundManager.play('hover');
            }
        });
    });
}

function updateSubcategoriesData() {
    const data = SearchState.rulesData;
    
    Object.keys(data).forEach(category => {
        if (SearchState.availableSubcategories[category]) {
            Object.keys(data[category] || {}).forEach(subcat => {
                if (CONSTANTS.SUBCAT_NAMES[subcat]) {
                    SearchState.availableSubcategories[category][subcat] = CONSTANTS.SUBCAT_NAMES[subcat];
                }
            });
        }
    });
}

function setupFilters() {
    document.querySelectorAll('#rules-filters .filter-button').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#rules-filters .filter-button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const prevCategory = SearchState.ruleCategory;
            
            saveScrollPosition('rules', prevCategory);
            
            SearchState.subcategory = null;
            SearchState.ruleCategory = btn.dataset.cat;
            SearchState.rulesLimit = 20;
            SearchState.currentCategory = btn.dataset.cat;
            
            const subcatText = document.getElementById('subcategory-text');
            if (subcatText) {
                subcatText.textContent = 'Показать все';
            }
            
            document.querySelectorAll('.subcategory-item').forEach(i => i.classList.remove('active'));
            const subcatAll = document.getElementById('subcategory-all');
            if (subcatAll) {
                subcatAll.classList.add('active');
            }
            
            updateSubcategorySelector(btn.dataset.cat);
            
            filterRules();
            renderResults();
            
            restoreScrollPosition('rules', btn.dataset.cat);
            
            if (window.SoundManager) SoundManager.play('click');
        });
        
        btn.addEventListener('mouseenter', () => {
            if (window.SoundManager) {
                SoundManager.play('hover');
            }
        });
    });
    
    const subcatBtn = document.getElementById('subcategory-button');
    const subcatDropdown = document.getElementById('subcategory-dropdown');
    
    subcatBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        subcatDropdown?.classList.toggle('hidden');
        if (window.SoundManager) SoundManager.play('click');
    });
    
    document.addEventListener('click', (e) => {
        if (!subcatBtn?.contains(e.target) && !subcatDropdown?.contains(e.target)) {
            subcatDropdown?.classList.add('hidden');
        }
    });
    
    document.getElementById('subcategory-all')?.addEventListener('click', () => {
        saveScrollPosition('rules', SearchState.ruleCategory, SearchState.subcategory);
        
        SearchState.subcategory = null;
        SearchState.rulesLimit = 20;
        
        const subcatText = document.getElementById('subcategory-text');
        if (subcatText) subcatText.textContent = 'Показать все';
        
        const subcatDropdown = document.getElementById('subcategory-dropdown');
        if (subcatDropdown) subcatDropdown.classList.add('hidden');
        
        document.querySelectorAll('.subcategory-item').forEach(i => i.classList.remove('active'));
        const subcatAll = document.getElementById('subcategory-all');
        if (subcatAll) subcatAll.classList.add('active');
        
        filterRules();
        renderResults();
        
        restoreScrollPosition('rules', SearchState.ruleCategory, null);
        
        if (window.SoundManager) SoundManager.play('click');
    });
}

function updateSubcategorySelector(category) {
    const selector = document.getElementById('subcategory-selector');
    const list = document.getElementById('subcategories-list');
    const subcatBtn = document.getElementById('subcategory-button');
    const subcatText = document.getElementById('subcategory-text');
    
    if (!selector || !list || !subcatBtn || !subcatText) return;
    
    list.innerHTML = '';
    
    if (category === 'all') {
        selector.style.display = 'none';
        subcatText.textContent = 'Показать все';
        return;
    }
    
    const subcats = SearchState.availableSubcategories[category] || {};
    
    if (Object.keys(subcats).length === 0) {
        selector.style.display = 'none';
        subcatText.textContent = 'Показать все';
        return;
    }
    
    selector.style.display = 'block';
    
    if (!SearchState.subcategory) {
        subcatText.textContent = 'Показать все';
    }
    
    Object.entries(subcats).forEach(([key, name]) => {
        const item = document.createElement('div');
        item.className = 'subcategory-item';
        if (SearchState.subcategory === key) {
            item.classList.add('active');
        }
        item.dataset.subcategory = key;
        item.textContent = name;
        
        item.addEventListener('click', () => {
            saveScrollPosition('rules', SearchState.ruleCategory, SearchState.subcategory);
            
            document.querySelectorAll('.subcategory-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            const subcatAll = document.getElementById('subcategory-all');
            if (subcatAll) subcatAll.classList.remove('active');
            
            SearchState.subcategory = key;
            SearchState.rulesLimit = 20;
            
            if (subcatText) subcatText.textContent = name;
            
            const subcatDropdown = document.getElementById('subcategory-dropdown');
            if (subcatDropdown) subcatDropdown.classList.add('hidden');
            
            filterRules();
            renderResults();
            
            restoreScrollPosition('rules', SearchState.ruleCategory, key);
            
            if (window.SoundManager) SoundManager.play('click');
        });
        
        item.addEventListener('mouseenter', () => {
            if (window.SoundManager) {
                SoundManager.play('hover');
            }
        });
        
        list.appendChild(item);
    });
}

function saveScrollPosition(tab, category, subcategory = null) {
    const container = document.getElementById('results-container');
    if (!container) return;
    
    const key = subcategory ? `${category}_${subcategory}` : category;
    SearchState.scrollPositions[tab][key] = container.scrollTop;
}

function restoreScrollPosition(tab, category, subcategory = null) {
    const container = document.getElementById('results-container');
    if (!container) return;
    
    const key = subcategory ? `${category}_${subcategory}` : category;
    const savedPosition = SearchState.scrollPositions[tab][key] ?? 0;
    
    // Двойной rAF: первый ждёт конца текущего фрейма, второй — следующего рендера
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            container.scrollTop = savedPosition;
        });
    });
}

function filterRules() {
    let allRules = [];
    
    if (SearchState.ruleCategory === 'all') {
        Object.values(SearchState.rulesData).forEach(category => {
            Object.values(category).forEach(subcat => {
                if (Array.isArray(subcat)) {
                    allRules.push(...subcat);
                }
            });
        });
    } else {
        const categoryData = SearchState.rulesData[SearchState.ruleCategory] || {};
        
        if (SearchState.subcategory) {
            const subcat = categoryData[SearchState.subcategory];
            if (Array.isArray(subcat)) {
                allRules = subcat;
            }
        } else {
            Object.values(categoryData).forEach(subcat => {
                if (Array.isArray(subcat)) {
                    allRules.push(...subcat);
                }
            });
        }
    }
    
    if (SearchState.searchQuery) {
        const query = SearchState.searchQuery.toLowerCase();
        allRules = allRules.filter(item => 
            (item.code || '').toLowerCase().includes(query) ||
            (item.title || '').toLowerCase().includes(query) ||
            (item.text || '').toLowerCase().includes(query) ||
            (item.note || '').toLowerCase().includes(query) ||
            (item.explanation || '').toLowerCase().includes(query) ||
            (item.exception || '').toLowerCase().includes(query) ||
            (item.penalty || '').toLowerCase().includes(query)
        );
    }
    
    SearchState.filteredRules = allRules;
    SearchState.rulesLimit = 20;
}

function filterLaws() {
    if (!SearchState.lawsData || SearchState.lawsData.length === 0) {
        SearchState.filteredLaws = [];
        return;
    }
    
    let filtered = [...SearchState.lawsData];
    
    if (SearchState.lawCategory !== 'all') {
        filtered = filtered.filter(item => item.section === SearchState.lawCategory);
    }
    
    if (SearchState.searchQuery) {
        const query = SearchState.searchQuery.toLowerCase();
        filtered = filtered.filter(item => 
            (item.code || '').toLowerCase().includes(query) ||
            (item.title || '').toLowerCase().includes(query) ||
            (item.text || '').toLowerCase().includes(query) ||
            (item.explanation || '').toLowerCase().includes(query) ||
            (item.note || '').toLowerCase().includes(query) ||
            (item.exception || '').toLowerCase().includes(query) ||
            (item.penalty || '').toLowerCase().includes(query)
        );
    }
    
    SearchState.filteredLaws = filtered;
    SearchState.lawsLimit = 20;
    
    window.CodexAPI.analytics.search(SearchState.searchQuery, filtered.length);
}

function setupTabs() {
    document.getElementById('tab-laws')?.addEventListener('click', activateLawsTab);
    document.getElementById('tab-rules')?.addEventListener('click', activateRulesTab);
}

function activateLawsTab() {
    if (SearchState.activeTab === 'laws') return;
    
    SearchState.activeTab = 'laws';
    localStorage.setItem('activeTab', 'laws');
    
    document.getElementById('tab-laws').classList.add('active');
    document.getElementById('tab-rules').classList.remove('active');
    document.getElementById('laws-filters').classList.remove('hidden');
    document.getElementById('rules-filters').classList.add('hidden');
    document.getElementById('search-input').placeholder = 'Поиск по законам';
    
    const serverSelector = document.getElementById('search-server-selector');
    if (serverSelector) serverSelector.style.display = 'block';
    
    SearchState.lawsLimit = 20;
    filterLaws();
    renderResults();
    
    if (window.SoundManager) SoundManager.play('toggle');
}

function activateRulesTab() {
    if (SearchState.activeTab === 'rules') return;
    
    SearchState.activeTab = 'rules';
    localStorage.setItem('activeTab', 'rules');
    
    document.getElementById('tab-rules').classList.add('active');
    document.getElementById('tab-laws').classList.remove('active');
    document.getElementById('rules-filters').classList.remove('hidden');
    document.getElementById('laws-filters').classList.add('hidden');
    document.getElementById('search-input').placeholder = 'Поиск по правилам';
    
    const serverSelector = document.getElementById('search-server-selector');
    if (serverSelector) serverSelector.style.display = 'none';
    
    SearchState.rulesLimit = 20;
    filterRules();
    renderResults();
    
    if (SearchState.ruleCategory === 'all') {
        const selector = document.getElementById('subcategory-selector');
        if (selector) selector.style.display = 'none';
    }
    
    if (window.SoundManager) SoundManager.play('toggle');
}

function setupSearch() {
    const input = document.getElementById('search-input');
    const clearBtn = document.getElementById('clear-search');
    
    if (!input || !clearBtn) return;
    
    const savedQuery = localStorage.getItem('searchQuery') || '';
    if (savedQuery) {
        input.value = savedQuery;
        SearchState.searchQuery = savedQuery;
        clearBtn.classList.remove('hidden');
    }
    
    const debouncedSearch = Utils.debounce(() => {
        SearchState.searchQuery = input.value.trim();
        localStorage.setItem('searchQuery', SearchState.searchQuery);
        
        if (SearchState.searchQuery) {
            clearBtn.classList.remove('hidden');
        } else {
            clearBtn.classList.add('hidden');
        }
        
        if (SearchState.activeTab === 'laws') {
            filterLaws();
        } else {
            filterRules();
        }
        
        renderResults();
        
        if (window.SoundManager) SoundManager.play('tick');
    }, 300);
    
    input.addEventListener('input', debouncedSearch);
    
    clearBtn.addEventListener('click', () => {
        input.value = '';
        SearchState.searchQuery = '';
        localStorage.setItem('searchQuery', '');
        clearBtn.classList.add('hidden');
        
        if (SearchState.activeTab === 'laws') {
            filterLaws();
        } else {
            filterRules();
        }
        
        renderResults();
        input.focus();
        
        if (window.SoundManager) SoundManager.play('click');
    });
}

function renderResults() {
    const container = document.getElementById('results-container');
    if (!container) return;
    
    if (SearchState.activeTab === 'laws') {
        if (!SearchState.lawsLoaded && SearchState.isLoading) {
            showLoading();
            return;
        }
        if (SearchState.loadError && SearchState.lawsData.length === 0) {
            showError('Ошибка загрузки данных. Проверьте подключение к интернету.');
            return;
        }
        renderLaws(container);
    } else {
        if (!SearchState.rulesLoaded && SearchState.isLoading) {
            showLoading();
            return;
        }
        renderRules(container);
    }
}

// ─── Shared render helpers ────────────────────────────────────────────────────

const PENALTY_SVG = `<svg width="16" height="16" viewBox="0 0 297 297" class="penalty-icon">
    <path d="M181.115,252.771h-22.731V76.845h57.057l-19.569,48.923h21.29l19.569-48.923h2.925l19.569,48.923h21.29l-19.569-48.923h1.71c5.458,0,9.883-4.426,9.883-9.884s-4.425-9.884-9.883-9.884H158.384V34.346c0-5.459-4.426-9.884-9.884-9.884s-9.884,4.425-9.884,9.884v22.731H34.345c-5.458,0-9.883,4.426-9.883,9.884s4.425,9.884,9.883,9.884h1.71l-19.569,48.923h21.29l19.569-48.923h2.925l19.569,48.923h21.29L81.56,76.845h57.057v175.927h-22.731c-5.458,0-9.884,4.425-9.884,9.883c0,5.459,4.426,9.884,9.884,9.884h65.23c5.458,0,9.884-4.425,9.884-9.884C190.999,257.196,186.573,252.771,181.115,252.771z" fill="#cc3636"/>
    <path d="M107.73,138.616H9.884C4.426,138.616,0,143.042,0,148.5c0,32.427,26.381,58.807,58.807,58.807c32.427,0,58.808-26.38,58.808-58.807C117.614,143.042,113.188,138.616,107.73,138.616z" fill="#cc3636"/>
    <path d="M287.116,138.616H189.27c-5.458,0-9.884,4.426-9.884,9.884c0,32.427,26.381,58.807,58.808,58.807c32.426,0,58.807-26.38,58.807-58.807C297,143.042,292.574,138.616,287.116,138.616z" fill="#cc3636"/>
</svg>`;

function buildPenaltyHTML(penaltyText) {
    return `<div class="penalty-block">${PENALTY_SVG}<span class="penalty-text">${penaltyText}</span></div>`;
}

function buildEmptyState(title, text) {
    return `<div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#6B7280" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
            <circle cx="12" cy="16" r="0.5" fill="#6B7280"/>
        </svg>
        <div class="empty-state-title">${title}</div>
        <div class="empty-state-text">${text}</div>
    </div>`;
}

function buildLawItemHTML(item) {
    const abbr     = Utils.escapeHtml(CONSTANTS.LAW_ABBR[item.section] || item.section);
    const fullName = Utils.escapeHtml(CONSTANTS.LAW_FULL[item.section] || item.section);
    const section  = Utils.escapeHtml(item.section);
    const code     = Utils.escapeHtml(item.code);
    const itemId   = Utils.escapeHtml(item.id);
    const color    = CONSTANTS.LAW_COLORS[item.section] || '#576069';
    const textId   = `text-${item.id.replace(/[^a-zA-Z0-9-]/g, '-')}`;
    const title    = Utils.highlightText(item.title,  SearchState.searchQuery);
    const text     = Utils.highlightText(item.text,   SearchState.searchQuery);

    let html = `<div class="result-item" data-id="${itemId}" data-section="${section}" data-code="${code}">
        <div class="result-header">
            <span class="code-badge" data-code="${code}" data-section="${section}"
                  title="${code} ${fullName}" style="border-color:${color}40;color:${color};">
                ${abbr} ${code}
            </span>
            <p class="result-title">${title}</p>
        </div>
        <div id="${textId}" class="result-text">${text}</div>`;

    for (const { field, label } of [
        { field: 'explanation', label: 'Пояснение:' },
        { field: 'note', label: 'Примечание:' },
        { field: 'exception', label: 'Исключение:' }
    ]) {
        if (item[field]) {
            html += `<div class="note-text">${label}</div><div class="result-text">${Utils.highlightText(item[field], SearchState.searchQuery)}</div>`;
        }
    }

    if (item.penalty) html += buildPenaltyHTML(Utils.highlightText(item.penalty, SearchState.searchQuery));
    html += '</div>';
    return html;
}

function buildRuleItemHTML(item) {
    const abbr     = Utils.escapeHtml(CONSTANTS.RULE_ABBR[item.subcategory] || item.subcategory);
    const fullName = Utils.escapeHtml(CONSTANTS.RULE_FULL[item.subcategory] || item.subcategory);
    const subcategory = Utils.escapeHtml(item.subcategory);
    const code     = Utils.escapeHtml(item.code);
    const itemId   = Utils.escapeHtml(item.id);
    const color    = '#576069';
    const title    = Utils.highlightText(item.title, SearchState.searchQuery);

    let html = `<div class="result-item" data-id="${itemId}" data-subcategory="${subcategory}" data-code="${code}">
        <div class="result-header">
            <span class="code-badge" data-code="${code}" data-subcategory="${subcategory}"
                  title="${code} ${fullName}" style="border-color:${color}40;color:${color};">
                ${abbr} ${code}
            </span>
            <p class="result-title">${title}</p>
        </div>`;

    const extras = [
        { field: 'note',        label: 'Примечание:',  idPrefix: 'note' },
        { field: 'explanation', label: 'Пояснение:',   idPrefix: 'exp'  },
        { field: 'exception',   label: 'Исключение:',  idPrefix: 'exc'  },
    ];
    for (const { field, label, idPrefix } of extras) {
        if (item[field]) {
            const id = `${idPrefix}-${item.id.replace(/[^a-zA-Z0-9-]/g, '-')}`;
            html += `<div class="note-text">${label}</div>
                     <div id="${id}" class="result-text">${Utils.highlightText(item[field], SearchState.searchQuery)}</div>`;
        }
    }

    if (item.text) {
        html += `<div class="result-text">${Utils.highlightText(item.text, SearchState.searchQuery)}</div>`;
    }

    if (item.penalty) html += buildPenaltyHTML(Utils.highlightText(item.penalty, SearchState.searchQuery));
    html += '</div>';
    return html;
}

// ─── Render functions ─────────────────────────────────────────────────────────

function renderLaws(container) {
    if (!SearchState.filteredLaws || SearchState.filteredLaws.length === 0) {
        container.innerHTML = buildEmptyState('Законов не найдено', 'Попробуйте изменить параметры поиска');
        return;
    }

    const toShow = SearchState.filteredLaws.slice(0, SearchState.lawsLimit);
    let html = '<div class="laws-list">' + toShow.map(buildLawItemHTML).join('');

    if (SearchState.filteredLaws.length > SearchState.lawsLimit) {
        html += '<div class="infinite-scroll-trigger"><div class="loading-dots"><span></span><span></span><span></span></div></div>';
    }

    container.innerHTML = html + '</div>';
    requestAnimationFrame(() => { if (container.isConnected) Utils.setupCollapsible(toShow); });
}

function renderRules(container) {
    if (!SearchState.filteredRules || SearchState.filteredRules.length === 0) {
        container.innerHTML = buildEmptyState('Правил не найдено', 'Попробуйте изменить параметры поиска');
        return;
    }

    const toShow = SearchState.filteredRules.slice(0, SearchState.rulesLimit);
    let html = '<div class="rules-list">' + toShow.map(buildRuleItemHTML).join('');

    if (SearchState.filteredRules.length > SearchState.rulesLimit) {
        html += '<div class="infinite-scroll-trigger"><div class="loading-dots"><span></span><span></span><span></span></div></div>';
    }

    container.innerHTML = html + '</div>';
    requestAnimationFrame(() => { if (container.isConnected) Utils.setupCollapsible(toShow); });
}


function setupCopyHandlers() {
    document.addEventListener('click', (e) => {
        const badge = e.target.closest('.code-badge');
        if (!badge) return;
        
        e.stopPropagation();
        
        const code = badge.dataset.code;
        const section = badge.dataset.section;
        const subcategory = badge.dataset.subcategory;
        
        if (!code) return;
        
        let copyText = code;
        if (section) {
            copyText = `${code} ${CONSTANTS.LAW_ABBR[section] || section}`;
        } else if (subcategory) {
            copyText = `${code} ${CONSTANTS.RULE_ABBR[subcategory] || subcategory}`;
        }
        
        Utils.copyToClipboard(copyText);
        
        badge.classList.add('copied');
        setTimeout(() => badge.classList.remove('copied'), 200);
        
        Notification.show('Код скопирован');
        
        if (window.SoundManager) {
            SoundManager.play('copy');
        }
        
        window.CodexAPI.analytics.copy(section ? 'law' : 'rule', section || subcategory);
    });
}

function setupAutoHide() {
    const checkbox = document.getElementById('auto-hide-checkbox');
    if (!checkbox) return;
    
    const saved = localStorage.getItem('autoHideEnabled');
    if (saved !== null) {
        checkbox.checked = saved === 'true';
    }
    
    checkbox.addEventListener('change', (e) => {
        localStorage.setItem('autoHideEnabled', e.target.checked);
        window.CodexAPI.config.setAutoHide(e.target.checked);
        if (window.SoundManager) SoundManager.play('toggle');
    });
}

function setupOpacitySlider() {
    if (opacityListenersSetup) return;
    opacityListenersSetup = true;
    const slider = document.getElementById('opacity-slider');
    const valueDisplay = document.getElementById('opacity-value');
    
    if (!slider || !valueDisplay) return;
    
    const saved = localStorage.getItem('windowOpacity');
    if (saved !== null) {
        slider.value = saved;
        valueDisplay.textContent = `${saved}%`;
        applyOpacity(parseInt(saved));
    }
    
    let timeout;
    
    slider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        valueDisplay.textContent = `${value}%`;
        applyOpacity(value);
        
        if (window.SoundManager) {
            SoundManager.play('slider');
        }
        
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            localStorage.setItem('windowOpacity', value);
        }, 500);
    });
    
    slider.addEventListener('mouseenter', () => {
        if (window.SoundManager) {
            SoundManager.play('hover');
        }
    });
}

function applyOpacity(value) {
    document.documentElement.style.opacity = 1 - (value / 100);
    
    if (!opacityListenersSetup) {
        window._setOpacityHandler = () => {
            document.documentElement.style.opacity = '0';
        };
        
        window._restoreOpacityHandler = () => {
            applyOpacity(parseInt(localStorage.getItem('windowOpacity') || '0'));
        };
        
        window.CodexAPI.utils.on('window:set-css-opacity-zero', window._setOpacityHandler);
        window.CodexAPI.utils.on('window:restore-css-opacity', window._restoreOpacityHandler);
        
        opacityListenersSetup = true;
    }
}

function setupInfiniteScroll() {
    const container = document.getElementById('results-container');
    if (!container) return;
    
    let ticking = false;
    
    container.addEventListener('scroll', () => {
        if (!ticking) {
            requestAnimationFrame(() => {
                const { scrollTop, scrollHeight, clientHeight } = container;
                
                if (scrollHeight - (scrollTop + clientHeight) < 200) {
                    if (SearchState.activeTab === 'laws') {
                        if (SearchState.lawsLimit < SearchState.filteredLaws.length) {
                            SearchState.lawsLimit += 20;
                            renderResults();
                        }
                    } else {
                        if (SearchState.rulesLimit < SearchState.filteredRules.length) {
                            SearchState.rulesLimit += 20;
                            renderResults();
                        }
                    }
                }
                
                ticking = false;
            });
            
            ticking = true;
        }
    });
}

function showLoading() {
    const container = document.getElementById('results-container');
    if (container) {
        container.innerHTML = `
            <div class="loading-message">
                <div class="loading-dots"><span></span><span></span><span></span></div>
                <span>Загрузка...</span>
            </div>
        `;
    }
}

function showError(message) {
    const container = document.getElementById('results-container');
    if (container) {
        container.innerHTML = `
            <div class="error-message">
                <svg width="32" height="32" viewBox="0 0 24 24" stroke="#cc3636" fill="none">
                    <circle cx="12" cy="12" r="10" stroke-width="1.5"/>
                    <line x1="12" y1="8" x2="12" y2="12" stroke-width="1.5"/>
                    <circle cx="12" cy="16" r="0.5" fill="#cc3636"/>
                </svg>
                <div>${message}</div>
            </div>
        `;
    }
}

window.debugReloadLaws = async function() {
    console.log('[Debug] Force reloading laws...');
    
    if (window.Utils && window.Utils.clearAllCache) {
        window.Utils.clearAllCache();
    }
    
    SearchState.lawsCache.clear();
    SearchState.lawsData = [];
    SearchState.filteredLaws = [];
    SearchState.lawsLoaded = false;
    
    const serverId = await getCurrentServer();
    await loadLaws(serverId);
    
    console.log('[Debug] Reload complete');
    if (window.SoundManager) SoundManager.play('success');
};

document.addEventListener('DOMContentLoaded', () => {
    initSearchWindow();
});
