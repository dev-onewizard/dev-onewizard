// search-window.js
const PAGE_SIZE = 20;
const SearchState = {
    lawsData: [],
    rulesData: {},
    ruleGroups: {},
    activeTab: 'laws',
    lawCategory: 'all',
    ruleCategory: 'all',
    subcategory: null,
    searchQuery: '',
    highlightPattern: null,
    filteredLaws: [],
    filteredRules: [],
    currentServer: null,
    servers: [],
    availableSubcategories: { general: {}, events: {}, organizations: {} },
    lawsLoaded: false,
    rulesLoaded: false,
    rulesError: false,
    loadError: null,
    scrollPositions: { rules: {} }
};

async function initSearchWindow() {
    SoundManager.init();
    setupTabs();
    setupSearch();
    setupFilters();
    setupAutoHide();
    setupOpacitySlider();
    setupInfiniteScroll();
    setupCopyHandlers();
    setupServerSelector();
    setupActivityTracking();
    document.getElementById('hide-search').onclick = () => window.CodexAPI.window.hideSearch();
    document.getElementById('rules-source').onclick = event => {
        event.preventDefault();
        window.CodexAPI.utils.openExternal(event.currentTarget.href);
    };
    window.CodexAPI.server.onChange(serverId => selectSearchServer(serverId, false));

    try {
        await Promise.all([setupSettingsSync(), loadServersList()]);
        if (localStorage.getItem('activeTab') === 'rules') activateRulesTab();
        else loadLaws(SearchState.currentServer);
    } catch (error) {
        console.error('[Search] Initialization failed:', error);
        showError('Не удалось загрузить справочник. Проверьте подключение.');
    }
}

async function setupSettingsSync() {
    const api = window.CodexAPI;
    const apply = prefs => {
        const checkbox = document.getElementById('auto-hide-checkbox');
        if (checkbox) checkbox.checked = prefs.autoHide;
        Utils.applyTheme(prefs.theme);
        window.SoundManager?.setEnabled(prefs.soundEnabled);
        window.SoundManager?.setVolume(prefs.soundVolume);
        applyOpacity(prefs.opacity);
    };
    api.preferences.onChange(apply);
    api.preferences.onReset(prefs => {
        for (const key of ['activeTab', 'searchQuery', 'selectedServer', 'windowOpacity', 'autoHideEnabled', 'theme', 'sound_settings']) localStorage.removeItem(key);
        SearchState.currentServer = 'new-york-1';
        setSearchQuery('');
        SearchState.lawCategory = 'all';
        SearchState.ruleCategory = 'all';
        SearchState.subcategory = null;
        document.getElementById('search-input').value = '';
        document.getElementById('clear-search').classList.add('hidden');
        updateSearchServerButton(SearchState.currentServer);
        updateServersListSelection(SearchState.currentServer);
        apply(prefs);
        loadLaws(SearchState.currentServer);
        activateLawsTab();
    });
    api.cache.onClear(() => Utils.clearAllCache());
    apply(await api.preferences.get());
}

function setupActivityTracking() {
    let lastReport = -Infinity;
    const report = () => {
        const now = performance.now();
        if (now - lastReport < 250 || document.hidden) return;
        lastReport = now;
        window.CodexAPI.activity.userAction();
    };

    for (const event of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'touchmove', 'input']) {
        document.addEventListener(event, report, { passive: true });
    }
}

async function loadServersList() {
    const api = window.CodexAPI;
    const [servers, current] = await Promise.all([api.laws.listServers(), api.server.getCurrent()]);
    SearchState.servers = servers;
    SearchState.currentServer = SearchState.currentServer || current || servers[0]?.id || 'new-york-1';
    renderServersDropdown();
    updateSearchServerButton(SearchState.currentServer);
}

function renderServersDropdown() {
    const list = document.getElementById('search-servers-list');
    list.innerHTML = SearchState.servers.map(server => Utils.serverOption(server, SearchState.currentServer)).join('');
    document.getElementById('search-server-button').disabled = !SearchState.servers.length;
}

function updateServersListSelection(serverId) {
    for (const option of document.querySelectorAll('#search-servers-list .server-item')) {
        const selected = option.dataset.serverId === serverId;
        option.classList.toggle('selected', selected);
        option.setAttribute('aria-pressed', String(selected));
    }
}

function selectSearchServer(serverId, save = true) {
    if (serverId === SearchState.currentServer) return;
    SearchState.currentServer = serverId;
    updateSearchServerButton(serverId);
    updateServersListSelection(serverId);
    if (save) {
        window.CodexAPI.server.select(serverId);
        SoundManager.play('select');
    }
    if (SearchState.activeTab === 'laws') loadLaws(serverId);
    else {
        lawRequest++;
        SearchState.lawsLoaded = false;
    }
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
    const menu = document.getElementById('search-server-dropdown');
    Utils.bindDropdown(button, menu);
    document.getElementById('search-servers-list').addEventListener('click', event => {
        const option = event.target.closest('.server-item');
        if (!option) return;
        Utils.setDropdown(button, menu, false);
        button.focus();
        selectSearchServer(option.dataset.serverId);
    });
}

let lawRequest = 0;
async function loadLaws(serverId) {
    const request = ++lawRequest;
    SearchState.lawsLoaded = false;
    SearchState.loadError = null;
    SearchState.lawCategory = 'all';
    SearchState.lawsData = [];
    SearchState.filteredLaws = [];
    if (SearchState.activeTab === 'laws') renderResults();
    try {
        const data = await window.CodexAPI.laws.getServerData(serverId);
        if (request !== lawRequest) return;
        if (!Array.isArray(data?.items)) throw Error("Laws unavailable");
        SearchState.lawsData = data.items;
    } catch (error) {
        if (request === lawRequest) SearchState.loadError = error.message;
    } finally {
        if (request === lawRequest) {
            SearchState.lawsLoaded = true;
            updateLawFilters();
            filterLaws();
            if (SearchState.activeTab === 'laws') renderResults();
        }
    }
}

let rulesRequest;
async function loadRules() {
    if (SearchState.rulesLoaded || rulesRequest) return;
    SearchState.rulesError = false;
    const categories = ['general', 'events', 'organizations'];
    rulesRequest = Promise.allSettled(categories.map(category => window.CodexAPI.laws.fetchRules(category)));
    const rounds = await rulesRequest;
    for (const [index, result] of rounds.entries()) {
        if (result.status !== 'fulfilled' || !result.value) continue;
        const category = categories[index];
        SearchState.rulesData[category] = result.value;
        SearchState.ruleGroups[category] = Object.values(result.value).filter(Array.isArray).flat();
    }
    SearchState.rulesError = !Object.keys(SearchState.rulesData).length;
    SearchState.rulesLoaded = !SearchState.rulesError;
    SearchState.ruleGroups.all = categories.flatMap(category => SearchState.ruleGroups[category] || []);
    rulesRequest = null;
    updateSubcategoriesData();
    updateSubcategorySelector(SearchState.ruleCategory);
    filterRules();
    if (SearchState.activeTab === 'rules') renderResults();
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
            
            filterLaws();
            renderResults();
            if (window.SoundManager) SoundManager.play('click');
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
    });
    
    const subcatBtn = document.getElementById('subcategory-button');
    const subcatDropdown = document.getElementById('subcategory-dropdown');
    
    Utils.bindDropdown(subcatBtn, subcatDropdown);

    document.getElementById('subcategory-all')?.addEventListener('click', () => {
        saveScrollPosition('rules', SearchState.ruleCategory, SearchState.subcategory);
        
        SearchState.subcategory = null;
        
        const subcatText = document.getElementById('subcategory-text');
        if (subcatText) subcatText.textContent = 'Показать все';
        
        const subcatDropdown = document.getElementById('subcategory-dropdown');
        Utils.setDropdown(document.getElementById('subcategory-button'), subcatDropdown, false);
        
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
    
    list.replaceChildren();
    
    if (category === 'all') {
        selector.classList.add('hidden');
        subcatText.textContent = 'Показать все';
        return;
    }
    
    const subcats = SearchState.availableSubcategories[category] || {};
    
    if (Object.keys(subcats).length === 0) {
        selector.classList.add('hidden');
        subcatText.textContent = 'Показать все';
        return;
    }
    
    selector.classList.remove('hidden');
    
    if (!SearchState.subcategory) {
        subcatText.textContent = 'Показать все';
    }
    
    Object.entries(subcats).forEach(([key, name]) => {
        const item = document.createElement('button');
        item.type = 'button';
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
            
            if (subcatText) subcatText.textContent = name;
            
            const subcatDropdown = document.getElementById('subcategory-dropdown');
            Utils.setDropdown(document.getElementById('subcategory-button'), subcatDropdown, false);
            
            filterRules();
            renderResults();
            
            restoreScrollPosition('rules', SearchState.ruleCategory, key);
            
            if (window.SoundManager) SoundManager.play('click');
        });
        
        list.appendChild(item);
    });
}

function saveScrollPosition(tab, category, subcategory = null) {
    const container = document.getElementById('results-container');
    if (!resultPage) return;
    
    const key = subcategory ? `${category}_${subcategory}` : category;
    SearchState.scrollPositions[tab][key] = { top: container.scrollTop, count: resultPage.offset };
}

function restoreScrollPosition(tab, category, subcategory = null) {
    const container = document.getElementById('results-container');
    if (!resultPage) return;
    
    const key = subcategory ? `${category}_${subcategory}` : category;
    const saved = SearchState.scrollPositions[tab][key];
    if (!saved) return;
    if (saved.count > resultPage.offset) appendResults(saved.count - resultPage.offset);
    container.scrollTop = saved.top;
}

const searchFields = ['code', 'title', 'text', 'note', 'explanation', 'exception', 'penalty'];
const searchIndex = new WeakMap();

function matchesQuery(item, query) {
    if (!query) return true;
    let fields = searchIndex.get(item);
    if (!fields) {
        fields = searchFields.map(key => String(item[key] ?? '').toLowerCase()).join('\0');
        searchIndex.set(item, fields);
    }
    return fields.includes(query);
}

function filterRules() {
    const { ruleCategory, subcategory, searchQuery } = SearchState;
    const source = subcategory ? SearchState.rulesData[ruleCategory]?.[subcategory] : SearchState.ruleGroups[ruleCategory];
    const rules = Array.isArray(source) ? source : [];
    const query = searchQuery.toLowerCase();
    SearchState.filteredRules = query ? rules.filter(item => matchesQuery(item, query)) : rules;
}

function filterLaws() {
    const { lawsData, lawCategory, searchQuery } = SearchState;
    const query = searchQuery.toLowerCase();
    SearchState.filteredLaws = lawCategory === 'all' && !query ? lawsData : lawsData.filter(item =>
        (lawCategory === 'all' || item.section === lawCategory) && matchesQuery(item, query));
}

function setupTabs() {
    document.getElementById('tab-laws')?.addEventListener('click', activateLawsTab);
    document.getElementById('tab-rules')?.addEventListener('click', activateRulesTab);
}

function selectTab(tab) {
    if (SearchState.activeTab === tab) return;
    const laws = tab === 'laws';
    SearchState.activeTab = tab;
    localStorage.setItem('activeTab', tab);
    for (const [type, selected] of [['laws', laws], ['rules', !laws]]) {
        const button = document.getElementById('tab-' + type);
        button.classList.toggle('active', selected);
        button.setAttribute('aria-pressed', String(selected));
        document.getElementById(type + '-filters').classList.toggle('hidden', !selected);
    }
    document.getElementById('search-input').placeholder = laws ? 'Поиск по законам' : 'Поиск по правилам';
    document.getElementById('search-server-selector').classList.toggle('hidden', !laws);
    document.getElementById('rules-source').classList.toggle('hidden', laws);
    SoundManager.play('toggle');
}

function activateLawsTab() {
    if (SearchState.activeTab === 'laws') return;
    selectTab('laws');
    if (!SearchState.lawsLoaded) loadLaws(SearchState.currentServer);
    else {
        filterLaws();
        renderResults();
    }
}

function activateRulesTab() {
    if (SearchState.activeTab === 'rules') return;
    selectTab('rules');
    if (!SearchState.rulesLoaded) loadRules();
    filterRules();
    renderResults();
}

function setSearchQuery(query) {
    SearchState.searchQuery = query;
    const literal = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    SearchState.highlightPattern = literal ? new RegExp(literal, 'gi') : null;
}

function setupSearch() {
    const input = document.getElementById('search-input');
    const clear = document.getElementById('clear-search');
    input.value = localStorage.getItem('searchQuery') || '';
    setSearchQuery(input.value.trim());
    clear.classList.toggle('hidden', !input.value);

    let searchTimer;
    const update = () => {
        setSearchQuery(input.value.trim());
        localStorage.setItem('searchQuery', SearchState.searchQuery);
        SearchState.scrollPositions.rules = {};
        if (SearchState.activeTab === 'laws') filterLaws();
        else filterRules();
        renderResults();
        if (SearchState.activeTab === 'laws' && SearchState.searchQuery) {
            window.CodexAPI.analytics.search(SearchState.searchQuery, SearchState.filteredLaws.length);
        }
    };
    input.addEventListener('input', () => {
        clear.classList.toggle('hidden', !input.value);
        clearTimeout(searchTimer);
        searchTimer = setTimeout(update, 120);
    });
    clear.onclick = () => {
        clearTimeout(searchTimer);
        input.value = '';
        clear.classList.add('hidden');
        update();
        input.focus();
    };
}

const articleFields = [
    ['text', 'Текст'],
    ['explanation', 'Пояснение'],
    ['note', 'Примечание'],
    ['exception', 'Исключение']
];
const penaltyIcon = '<svg class="penalty-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M7.1 1.8a1 1 0 0 1 1.8 0l5.7 10.6a1 1 0 0 1-.9 1.5H2.3a1 1 0 0 1-.9-1.5L7.1 1.8zM7.4 5v4h1.2V5H7.4zm0 5.4v1.2h1.2v-1.2H7.4z" fill-rule="evenodd"/></svg>';

function buildResult(item, type) {
    const sectionKey = type === 'laws' ? 'section' : 'subcategory';
    const section = item[sectionKey];
    const names = type === 'laws' ? CONSTANTS.LAW_ABBR : CONSTANTS.RULE_ABBR;
    const label = Utils.escapeHtml(names[section] || section);
    const code = Utils.escapeHtml(item.code);
    const highlight = value => Utils.highlightText(value, SearchState.highlightPattern);
    let html = '<article class="result-item"><div class="result-header">' +
        '<button type="button" class="code-badge" data-code="' + code + '" data-' + sectionKey + '="' +
        Utils.escapeHtml(section) + '" title="Скопировать номер">' + label + ' ' + code + '</button>' +
        '<p class="result-title">' + highlight(item.title) + '</p></div>';

    for (const [field, fieldLabel] of articleFields) {
        const value = item[field];
        if (!value) continue;
        const formatted = highlight(value);
        if (String(value).length > 260 && !formatted.includes('<mark ')) {
            html += '<details class="result-details"><summary>' + (field === 'text' ? 'Читать текст' : fieldLabel) +
                '</summary><p class="result-text">' + formatted + '</p></details>';
        } else {
            if (field !== 'text') html += '<p class="note-text">' + fieldLabel + '</p>';
            html += '<p class="result-text">' + formatted + '</p>';
        }
    }
    if (item.penalty) html += '<div class="penalty-block">' + penaltyIcon + '<span>' + highlight(item.penalty) + '</span></div>';
    return html + '</article>';
}

let resultPage;
let resultsObserver;

function renderResults() {
    const container = document.getElementById('results-container');
    const count = document.getElementById('result-count');
    resultsObserver.disconnect();
    resultPage = null;
    count.textContent = '';
    container.scrollTop = 0;

    const type = SearchState.activeTab;
    const laws = type === 'laws';
    if (laws ? SearchState.loadError : SearchState.rulesError) {
        showError('Не удалось загрузить данные. Проверьте подключение.');
        return;
    }
    if (laws ? !SearchState.lawsLoaded : !SearchState.rulesLoaded) {
        container.innerHTML = '<div class="loading-message" role="status">Загрузка данных…</div>';
        return;
    }

    const items = laws ? SearchState.filteredLaws : SearchState.filteredRules;
    count.textContent = 'Найдено: ' + items.length;
    if (!items.length) {
        container.innerHTML = '<div class="empty-state"><p class="empty-state-title">Ничего не найдено</p>' +
            '<p>Измените запрос или выберите другой раздел.</p></div>';
        return;
    }

    const list = document.createElement('div');
    list.className = 'results-list';
    const end = document.createElement('div');
    end.className = 'infinite-scroll-trigger';
    end.setAttribute('aria-hidden', 'true');
    container.replaceChildren(list, end);
    resultPage = { items, type, list, end, offset: 0 };
    appendResults();
    if (resultPage.offset < items.length) resultsObserver.observe(end);
}

function appendResults(count = PAGE_SIZE) {
    const { items, type, list, end, offset } = resultPage;
    const next = Math.min(offset + count, items.length);
    list.insertAdjacentHTML('beforeend', items.slice(offset, next).map(item => buildResult(item, type)).join(''));
    resultPage.offset = next;
    if (next === items.length) {
        resultsObserver.unobserve(end);
        end.remove();
    }
}

function setupCopyHandlers() {
    document.addEventListener('click', async (e) => {
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
        
        try {
            if (!await window.CodexAPI.clipboard.copy(copyText)) throw Error("Copy failed");
        } catch {
            AppToast.show('Не удалось скопировать', 'error');
            return;
        }
        
        badge.classList.add('copied');
        setTimeout(() => badge.classList.remove('copied'), 200);
        
        AppToast.show('Скопировано: ' + copyText);
        
        if (window.SoundManager) {
            SoundManager.play('copy');
        }
        
        window.CodexAPI.analytics.copy(section ? 'law' : 'rule', section || subcategory);
    });
}

function setupAutoHide() {
    const checkbox = document.getElementById('auto-hide-checkbox');
    checkbox.onchange = async () => {
        try {
            if (!await window.CodexAPI.config.setAutoHide(checkbox.checked)) throw Error("Save failed");
        } catch {
            AppToast.show('Не удалось изменить автоскрытие', 'error');
        }
    };
}

function setupOpacitySlider() {
    const slider = document.getElementById('opacity-slider');
slider.oninput = () => applyOpacity(Number(slider.value));
    slider.onchange = () => {
        window.CodexAPI.preferences.save({ opacity: Number(slider.value) }).catch(() => {
            AppToast.show('Не удалось сохранить прозрачность', 'error');
        });
    };
    window.CodexAPI.utils.on('window:set-css-opacity-zero', () => {
        document.documentElement.dataset.overlayHidden = '';
    });
    window.CodexAPI.utils.on('window:restore-css-opacity', () => {
        delete document.documentElement.dataset.overlayHidden;
        document.getElementById('search-input').focus();
    });
}

function applyOpacity(value) {
    Utils.renderRange(document.getElementById('opacity-slider'), document.getElementById('opacity-value'), value);
    document.documentElement.style.setProperty('--overlay-opacity', String(1 - value / 100));
}

function setupInfiniteScroll() {
    resultsObserver = new IntersectionObserver(entries => {
        if (!resultPage || !entries.some(entry => entry.target === resultPage.end && entry.isIntersecting)) return;
        const { end, items } = resultPage;
        resultsObserver.unobserve(end);
        appendResults();
        if (resultPage.offset < items.length) resultsObserver.observe(end);
    }, { root: document.getElementById('results-container'), rootMargin: '0px 0px 150px' });
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

document.addEventListener('DOMContentLoaded', () => {
    initSearchWindow();
});
