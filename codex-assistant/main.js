// main.js
const { app, BrowserWindow, clipboard, globalShortcut, ipcMain, Menu, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const Analytics = require('./src/js/analytics.js');
const RUSSIA_SERVERS = require('./assets/servers/russia-online.json');

// ========== ИСТОЧНИК ДАННЫХ ==========
const DATA_OWNER = 'dev-onewizard';
const DATA_REPO = 'majestic-laws-db';
const DATA_BRANCH = 'main';
const BASE_URL = `https://raw.githubusercontent.com/${DATA_OWNER}/${DATA_REPO}/${DATA_BRANCH}`;
const UPSTREAM_BASE_URL = `https://raw.githubusercontent.com/alamantik/${DATA_REPO}/${DATA_BRANCH}`;
const RELEASES_PAGE = 'https://github.com/dev-onewizard/dev-onewizard/releases/latest';
const DEFAULT_PREFS = { opacity: 0, theme: 'dark', soundEnabled: true, soundVolume: 70, autoUpdate: true };
const SERVER_FILE_NAMES = {
    'las-vegas-9': 'las vegas-9',
    'los-angeles-7': 'los angeles-7',
    'new-york-1': 'new york-1',
    'san-diego-6': 'san diego-6',
    'san-francisco-4': 'san francisco-4'
};

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const updateMode = isDev ? 'development' :
    process.platform !== 'win32' ? 'manual' :
    process.env.PORTABLE_EXECUTABLE_FILE ? 'portable' : 'installed';
let updateStatus = { state: 'idle', mode: updateMode, current: app.getVersion() };
let updateCheck = null;
let downloadedVersion = null;

let mainWindow = null;
let searchWindow = null;
let activeProject = 'majestic';
let currentHotkey = 'Ctrl+Shift+K';
let isEditingHotkey = false;
let autoHideEnabled = true;
let lastSearchBounds = null;
let inactivityTimer = null;
let searchHideTimer = null;
const INACTIVITY_TIMEOUT = 20000; // 20 секунд бездействия

const dataCache = {
    laws: new Map(),
    rules: new Map(),
    structure: null
};
const CACHE_TTL = 10 * 60 * 1000;
let cacheGeneration = 0;
const pendingData = new Map();

function cacheDir() {
    return path.join(app.getPath('userData'), 'reference-cache');
}

function readCachedData(key) {
    try { return JSON.parse(fs.readFileSync(path.join(cacheDir(), key + '.json'), 'utf8')); }
    catch { return null; }
}

function saveCachedData(key, data, generation) {
    if (generation !== cacheGeneration) return;
    try {
        fs.mkdirSync(cacheDir(), { recursive: true });
        fs.writeFileSync(path.join(cacheDir(), key + '.json'), JSON.stringify(data));
    } catch (error) {
        console.warn('[Cache]', error.message);
    }
}

function getCacheSize() {
    try {
        return fs.readdirSync(cacheDir(), { withFileTypes: true })
            .filter(entry => entry.isFile())
            .reduce((bytes, entry) => bytes + fs.statSync(path.join(cacheDir(), entry.name)).size, 0);
    } catch (error) {
        if (error.code === 'ENOENT') return 0;
        throw error;
    }
}

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========

function getIconPath() {
    const iconName = process.platform === 'win32' ? 'windows.ico' : 'icon.png';
    return path.join(__dirname, 'assets', 'Icon', iconName);
}

function getConfigPath() {
    return path.join(app.getPath('userData'), 'config.json');
}

function readConfig() {
    try { return JSON.parse(fs.readFileSync(getConfigPath(), 'utf8')) || {}; }
    catch { return {}; }
}

function updateConfig(updater) {
    const configPath = getConfigPath();
    try {
        const dir = path.dirname(configPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const newConfig = updater(readConfig());
        fs.writeFileSync(configPath + '.tmp', JSON.stringify(newConfig, null, 2), 'utf8');
        fs.renameSync(configPath + '.tmp', configPath);
        return newConfig;
    } catch (error) {
        console.error('[Config] Failed to update:', error);
        return null;
    }
}

function getPreferences() {
    return { ...DEFAULT_PREFS, ...readConfig().preferences, autoHide: autoHideEnabled };
}

function setActiveProject(project) {
    if (project === activeProject) return;
    activeProject = project;
    if (searchWindow && !searchWindow.isDestroyed()) searchWindow.destroy();
}

function broadcast(channel, value) {
    for (const win of [mainWindow, searchWindow]) {
        if (win && !win.isDestroyed()) win.webContents.send(channel, value);
    }
}

function savePreferences(changes, initialize = false) {
    const config = readConfig();
    if (initialize && config.preferences) return getPreferences();
    const prefs = { ...DEFAULT_PREFS, ...config.preferences };
    if (Number.isFinite(changes?.opacity)) prefs.opacity = Math.max(0, Math.min(25, Math.round(changes.opacity)));
    if (Number.isFinite(changes?.soundVolume)) prefs.soundVolume = Math.max(0, Math.min(100, Math.round(changes.soundVolume)));
    if (['dark', 'light'].includes(changes?.theme)) prefs.theme = changes.theme;
    for (const key of ['soundEnabled', 'autoUpdate']) {
        if (typeof changes?.[key] === 'boolean') prefs[key] = changes[key];
    }
    if (!updateConfig(current => ({ ...current, preferences: prefs }))) throw Error('Preferences write failed');
    const state = getPreferences();
    broadcast('preferences:changed', state);
    if (state.autoUpdate && config.preferences?.autoUpdate === false) checkAutomatically();
    return state;
}

function readHotkey() {
    try {
        const config = JSON.parse(fs.readFileSync(getConfigPath(), 'utf-8'));
        return config.toggleSearch || 'Ctrl+Shift+K';
    } catch {
        return 'Ctrl+Shift+K';
    }
}

function writeHotkey(hotkey) {
    return updateConfig((config) => {
        config.toggleSearch = hotkey;
        return config;
    });
}

function readAutoHide() {
    try {
        const config = JSON.parse(fs.readFileSync(getConfigPath(), 'utf-8'));
        return config.autoHideEnabled !== undefined ? config.autoHideEnabled : true;
    } catch {
        return true;
    }
}

function writeAutoHide(enabled) {
    return updateConfig((config) => {
        config.autoHideEnabled = enabled;
        return config;
    });
}

// ========== УПРАВЛЕНИЕ ТАЙМЕРОМ БЕЗДЕЙСТВИЯ ==========

function resetInactivityTimer() {
    clearInactivityTimer();
    if (searchWindow?.isVisible() && autoHideEnabled) {
        inactivityTimer = setTimeout(hideSearchWindow, INACTIVITY_TIMEOUT);
    }
}

function clearInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
}

function cancelSearchHide() {
    clearTimeout(searchHideTimer);
    searchHideTimer = null;
}

function hideSearchWindow() {
    const window = searchWindow;
    if (!window?.isVisible() || searchHideTimer) return;

    clearInactivityTimer();
    window.webContents.send('window:set-css-opacity-zero');
    searchHideTimer = setTimeout(() => {
        searchHideTimer = null;
        if (!window.isDestroyed()) window.hide();
    }, 115);
}

function showSearchWindow() {
    cancelSearchHide();
    searchWindow.webContents.send('window:restore-css-opacity');
    searchWindow.show();
    searchWindow.focus();
    resetInactivityTimer();
}

// ========== НОРМАЛИЗАЦИЯ ID СЕРВЕРОВ ==========

function normalizeServerId(serverId) {
    if (typeof serverId !== 'string') return '';
    return serverId.toLowerCase().trim().replace(/\s+/g, '-');
}

// ========== ЗАГРУЗКА ДАННЫХ ==========

function oncePerRequest(key, load) {
    const current = pendingData.get(key);
    if (current) return current;

    const request = load().finally(() => {
        if (pendingData.get(key) === request) pendingData.delete(key);
    });
    pendingData.set(key, request);
    return request;
}

function fetchRepoStructure(forceRefresh = false) {
    return forceRefresh ? requestRepoStructure(true) : oncePerRequest('catalog', requestRepoStructure);
}

async function fetchReference(relativePath, timeout) {
    try {
        const response = await fetch(`${BASE_URL}/${relativePath}`, { timeout });
        if (response.ok) return response;
    } catch (error) {
        console.warn('[API] Dataset fork unavailable:', error.message);
    }
    return fetch(`${UPSTREAM_BASE_URL}/${relativePath}`, { timeout });
}

async function requestRepoStructure(ignoreCache = false) {
    if (!ignoreCache && dataCache.structure && (Date.now() - dataCache.structureTimestamp) < CACHE_TTL) {
        return dataCache.structure;
    }
    
    const generation = cacheGeneration;
    try {
        const response = await fetchReference('repo_structure.json', 5000);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const text = await response.text();
        const cleanText = text.replace(/^\uFEFF/, '');
        const structure = JSON.parse(cleanText);
        if (generation === cacheGeneration) {
            dataCache.structure = structure;
            dataCache.structureTimestamp = Date.now();
            saveCachedData('catalog', structure, generation);
        }
        console.log('[API] Repo structure loaded successfully');
        return structure;
        
    } catch (error) {
        console.error('[API] Error fetching structure:', error.message);
        return readCachedData('catalog');
    }
}

function parseServerFiles(structure) {
    const files = structure?.laws?.files;
    if (!Array.isArray(files)) return [];
    return files
        .filter(file => typeof file === 'string' && /^[a-z0-9]+(?:[ -][a-z0-9]+)*-\d+\.json$/i.test(file))
        .map(file => ({ file, id: normalizeServerId(file.slice(0, -5)) }));
}

async function fetchServersList(forceRefresh = false) {
    
    try {
        const structure = await fetchRepoStructure(forceRefresh);
        const files = parseServerFiles(structure || dataCache.structure);
        if (files.length) {
            return files
                .map(({ id }) => ({ id, name: formatServerName(id) }))
                .sort((a, b) => {
                    const numA = parseInt(a.id.split('-').pop()) || 0;
                    const numB = parseInt(b.id.split('-').pop()) || 0;
                    return numA - numB;
                });
        }
        return getFallbackServers();
        
    } catch (error) {
        console.error('[API] Error fetching servers list:', error);
        return getFallbackServers();
    }
}

function formatServerName(serverId) {
    const names = {
        'new-york': 'New York', 'detroit': 'Detroit', 'chicago': 'Chicago',
        'san-francisco': 'San Francisco', 'atlanta': 'Atlanta', 'san-diego': 'San Diego',
        'los-angeles': 'Los Angeles', 'miami': 'Miami', 'las-vegas': 'Las Vegas',
        'washington': 'Washington', 'dallas': 'Dallas', 'boston': 'Boston',
        'houston': 'Houston', 'seattle': 'Seattle', 'phoenix': 'Phoenix',
        'denver': 'Denver', 'portland': 'Portland', 'orlando': 'Orlando',
        'memphis': 'Memphis'
    };
    
    const normalizedId = normalizeServerId(serverId);
    const match = normalizedId.match(/(.+)-(\d+)$/);
    
    if (match) {
        const baseName = names[match[1]] || match[1].split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
        return `${baseName} ${match[2]}`;
    }
    
    return names[normalizedId] || normalizedId.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

function getFallbackServers() {
    return [
        { id: 'new-york-1', name: 'New York 1' },
        { id: 'detroit-2', name: 'Detroit 2' },
        { id: 'chicago-3', name: 'Chicago 3' },
        { id: 'san-francisco-4', name: 'San Francisco 4' },
        { id: 'atlanta-5', name: 'Atlanta 5' },
        { id: 'san-diego-6', name: 'San Diego 6' },
        { id: 'los-angeles-7', name: 'Los Angeles 7' },
        { id: 'miami-8', name: 'Miami 8' },
        { id: 'las-vegas-9', name: 'Las Vegas 9' },
        { id: 'washington-10', name: 'Washington 10' },
        { id: 'dallas-11', name: 'Dallas 11' },
        { id: 'boston-12', name: 'Boston 12' },
        { id: 'houston-13', name: 'Houston 13' },
        { id: 'seattle-14', name: 'Seattle 14' },
        { id: 'phoenix-15', name: 'Phoenix 15' },
        { id: 'denver-16', name: 'Denver 16' },
        { id: 'portland-17', name: 'Portland 17' },
        { id: 'orlando-18', name: 'Orlando 18' },
        { id: 'memphis-19', name: 'Memphis 19' }
    ];
}

// ========== ИСПРАВЛЕННАЯ ФУНКЦИЯ ТРАНСФОРМАЦИИ ЗАКОНОВ ==========
function transformLawsData(serverId, rawData) {
    if (!rawData) {
        console.warn(`[API] No data for ${serverId}`);
        return null;
    }
    
    console.log(`[API] Transforming data for ${serverId}, type:`, typeof rawData);
    console.log(`[API] Raw data keys:`, Object.keys(rawData));
    
    const items = [];
    const sourceUrls = {};
    
    if (rawData.items && Array.isArray(rawData.items)) {
        console.log(`[API] Using rawData.items format (old format)`);
        return {
            server: serverId,
            updatedAt: rawData.updatedAt || Date.now(),
            sourceUrls: rawData.sourceUrls || {},
            items: rawData.items
        };
    }
    
    let data = rawData;
    if (rawData.data && typeof rawData.data === 'object') {
        console.log(`[API] Using rawData.data format (sectioned format)`);
        data = rawData.data;
    }
    
    const sections = Object.keys(data).filter(key => 
        typeof data[key] === 'object' && data[key] !== null && !Array.isArray(data[key])
    );
    console.log(`[API] Found sections:`, sections);
    
    for (const [section, sectionData] of Object.entries(data)) {
        if (!sectionData || typeof sectionData !== 'object') {
            console.log(`[API] Skipping section ${section} - invalid data`);
            continue;
        }
        
        console.log(`[API] Processing section ${section}:`, Object.keys(sectionData));
        
        if (sectionData.url) {
            sourceUrls[section] = sectionData.url;
        }
        
        const articles = sectionData.articles || [];
        
        if (!Array.isArray(articles)) {
            console.warn(`[API] articles is not an array for section ${section}`);
            continue;
        }
        
        console.log(`[API] Found ${articles.length} articles in section ${section}`);
        
        articles.forEach((article, index) => {
            if (!article) return;
            
            items.push({
                id: `${serverId}-${section}-${article.code || index}`,
                section: section,
                code: article.code || '',
                title: article.title || '',
                text: article.text || article.description || '',
                explanation: article.explanation || null,
                note: article.note || null,
                exception: article.exception || null,
                jurisdiction: article.jurisdiction || null,
                penalty: article.penalty || null,
                wanted_stars: article.wanted_stars || article.wantedStars || null,
                searchText: `${article.code || ''} ${article.title || ''} ${article.text || article.description || ''} ${article.explanation || ''} ${article.note || ''} ${article.exception || ''} ${article.penalty || ''}`.toLowerCase()
            });
        });
    }
    
    console.log(`[API] Transformed ${items.length} items for ${serverId}`);
    
    return {
        server: serverId,
        updatedAt: rawData.updatedAt || Date.now(),
        sourceUrls,
        items
    };
}

function fetchServerJson(serverId, forceRefresh = false) {
    const key = 'laws-' + normalizeServerId(serverId);
    if (forceRefresh) return requestServerJson(serverId, true);
    return oncePerRequest(key, () => requestServerJson(serverId));
}

async function requestServerJson(serverId, forceRefresh = false) {
    const normalizedId = normalizeServerId(serverId);
    if (!/^[a-z0-9-]+$/.test(normalizedId)) return null;
    
    const cached = dataCache.laws.get(normalizedId);
    if (!forceRefresh && cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        console.log(`[API] Using cache for ${normalizedId}`);
        return cached.data;
    }
    
    const cacheKey = 'laws-' + normalizedId;
    const generation = cacheGeneration;
    const offline = () => forceRefresh ? null : readCachedData(cacheKey);
    try {
        const structure = dataCache.structure || await fetchRepoStructure();
        const fileName = parseServerFiles(structure).find(({ id }) => id === normalizedId)?.file
            || `${SERVER_FILE_NAMES[normalizedId] || normalizedId}.json`;
        const response = await fetchReference(`laws/${encodeURIComponent(fileName)}`, 10000);
        
        if (response.status === 404) {
            console.warn(`[API] Laws file for ${normalizedId} not found (404)`);
            return offline();
        }
        
        if (!response.ok) {
            console.warn(`[API] Server ${normalizedId} returned ${response.status}`);
            return offline();
        }
        
        const text = await response.text();
        console.log(`[API] Received ${text.length} bytes for ${normalizedId}`);
        
        const cleanText = text.replace(/^\uFEFF/, '');
        let rawData;
        
        try {
            rawData = JSON.parse(cleanText);
        } catch (parseError) {
            console.error(`[API] JSON parse error for ${normalizedId}:`, parseError.message);
            return offline();
        }
        
        if (!rawData || typeof rawData !== 'object') {
            console.warn(`[API] Invalid data format for ${normalizedId}`);
            return offline();
        }
        
        const processedData = transformLawsData(normalizedId, rawData);
        
        if (processedData && processedData.items) {
            if (generation === cacheGeneration) {
                dataCache.laws.set(normalizedId, { data: processedData, timestamp: Date.now() });
                saveCachedData(cacheKey, processedData, generation);
            }
            console.log(`[API] Loaded ${processedData.items.length} laws for ${normalizedId}`);
            return processedData;
        }
        
        console.warn(`[API] No laws found for ${normalizedId}`);
        return offline();
        
    } catch (error) {
        console.error(`[API] Error fetching ${normalizedId}:`, error.message);
        return offline();
    }
}

async function fetchRulesJson(filename, forceRefresh = false) {
    const safeFilename = String(filename || '').toLowerCase();
    if (!['general', 'events', 'organizations'].includes(safeFilename)) return null;
    const cached = dataCache.rules.get(safeFilename);
    if (!forceRefresh && cached && (Date.now() - cached.timestamp) < CACHE_TTL) return cached.data;
    
    const cacheKey = 'rules-' + safeFilename;
    const generation = cacheGeneration;
    const offline = () => forceRefresh ? null : readCachedData(cacheKey);
    try {
        const response = await fetchReference(`rules/${safeFilename}.json`, 5000);
        
        if (response.status === 404) {
            console.warn(`[API] Rules file ${safeFilename} not found (404)`);
            return offline();
        }
        
        if (!response.ok) {
            console.warn(`[API] Rules ${safeFilename} returned ${response.status}`);
            return offline();
        }
        
        const text = await response.text();
        const cleanText = text.replace(/^\uFEFF/, '');
        const rawData = JSON.parse(cleanText);
        
        if (!rawData || typeof rawData !== 'object') {
            console.warn(`[API] Invalid rules data format for ${filename}`);
            return offline();
        }
        
        const processedData = transformRulesData(safeFilename, rawData);
        
        if (processedData && Object.keys(processedData).length > 0) {
            if (generation === cacheGeneration) {
                dataCache.rules.set(safeFilename, { data: processedData, timestamp: Date.now() });
                saveCachedData(cacheKey, processedData, generation);
            }
            console.log(`[API] Loaded rules for ${safeFilename}`);
            return processedData;
        }
        
        console.warn(`[API] No rules found for ${safeFilename}`);
        return offline();
        
    } catch (error) {
        console.error(`[API] Error fetching rules ${safeFilename}:`, error.message);
        return offline();
    }
}

function transformRulesData(filename, rawData) {
    if (!rawData?.data) return {};
    
    const rulesByCategory = {};
    const categoryName = { 
        general: 'Основные', 
        events: 'События', 
        organizations: 'Организации' 
    }[filename] || filename;
    
    for (const [subcategory, sectionData] of Object.entries(rawData.data)) {
        if (!sectionData || !Array.isArray(sectionData.articles)) continue;
        
        rulesByCategory[subcategory] = sectionData.articles.map((article, idx) => ({
            id: `${filename}-${subcategory}-${article.code || idx}`,
            code: article.code || '', 
            title: article.title || '',
            text: article.text || '',
            exception: article.exception || null, 
            explanation: article.explanation || null,
            note: article.note || null, 
            penalty: article.penalty || null,
            category: categoryName, 
            subcategory,
            searchText: `${article.code || ''} ${article.title || ''} ${article.text || ''} ${article.note || ''} ${article.explanation || ''} ${article.exception || ''} ${article.penalty || ''}`.toLowerCase()
        }));
    }
    
    return rulesByCategory;
}

// ========== УПРАВЛЕНИЕ ОКНАМИ ==========

async function createMainWindow() {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.focus();
        return;
    }
    
    mainWindow = new BrowserWindow({
        width: 820,
        height: 510,
        resizable: false,
        frame: false,
        transparent: true,
        roundedCorners: false,
        hasShadow: false,
        backgroundColor: '#00000000',
        icon: getIconPath(),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });
    
    Menu.setApplicationMenu(null);
    mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
    
    if (isDev && process.argv.includes('--devtools')) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
    
    mainWindow.on('closed', () => {
        if (searchWindow && !searchWindow.isDestroyed()) searchWindow.close();
        mainWindow = null;
    });
    
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        openHttpsLink(url);
        return { action: 'deny' };
    });
    
    if (!isDev) {
        Analytics.trackAppStart();
        setupAutoUpdater();
    }
    
    currentHotkey = readHotkey();
    registerToggleHotkey(currentHotkey);
}

function createSearchWindow(tab) {
    autoHideEnabled = readAutoHide();
    
    searchWindow = new BrowserWindow({
        width: 900,
        height: 600,
        resizable: false,
        frame: false,
        transparent: true,
        roundedCorners: false,
        hasShadow: false,
        alwaysOnTop: true,
        show: false,
        backgroundColor: '#00000000',
        icon: getIconPath(),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });
    
    searchWindow.setAlwaysOnTop(true, 'screen-saver');
    searchWindow.setVisibleOnAllWorkspaces(true);
    const query = tab ? { tab } : {};
    if (activeProject === 'russia-online') query.project = activeProject;
    searchWindow.loadFile(path.join(__dirname, 'src', 'search.html'), { query });
    
    if (isDev) {
        searchWindow.webContents.on('before-input-event', (event, input) => {
            if (input.key.toLowerCase() === 'f12' || (input.control && input.key.toLowerCase() === 'i')) {
                searchWindow.webContents.openDevTools({ mode: 'detach' });
                event.preventDefault();
            }
        });
    }
    
    searchWindow.on('closed', () => {
        cancelSearchHide();
        clearInactivityTimer();
        searchWindow = null;
        lastSearchBounds = null;
    });

    searchWindow.on('blur', () => {
        if (autoHideEnabled && !isEditingHotkey && !searchWindow.webContents.isDevToolsOpened()) {
            hideSearchWindow();
        }
    });
    searchWindow.on('focus', () => {
        if (searchHideTimer) {
            cancelSearchHide();
            searchWindow.webContents.send('window:restore-css-opacity');
        }
        resetInactivityTimer();
    });

    searchWindow.once('ready-to-show', () => {
        if (lastSearchBounds) searchWindow.setBounds(lastSearchBounds);
        showSearchWindow();
    });

    searchWindow.on('move', () => {
        if (searchWindow && !searchWindow.isDestroyed()) {
            const bounds = searchWindow.getBounds();
            if (bounds.x > -10000 && bounds.y > -10000) lastSearchBounds = bounds;
        }
    });
}

function toggleSearchWindow() {
    if (isEditingHotkey) return;
    if (searchWindow?.isVisible() && !searchHideTimer) {
        hideSearchWindow();
        return;
    }

    if (!searchWindow) createSearchWindow();
    else if (!searchWindow.webContents.isLoading()) showSearchWindow();
    Analytics.trackHotkeyUse();
}

function openSearchWindow(tab) {
    if (isEditingHotkey || (tab !== undefined && tab !== 'laws' && tab !== 'rules')) return;
    if (!searchWindow) {
        createSearchWindow(tab);
        return;
    }

    const target = searchWindow;
    if (target.webContents.isLoading()) {
        if (tab) target.webContents.once('did-finish-load', () => {
            if (!target.isDestroyed()) target.webContents.send('window:select-search-tab', tab);
        });
        return;
    }
    if (tab) target.webContents.send('window:select-search-tab', tab);
    showSearchWindow();
}

// ========== СИСТЕМА ГОРЯЧИХ КЛАВИШ ==========

const keyCodeMap = {
    'KeyA': 'A', 'KeyB': 'B', 'KeyC': 'C', 'KeyD': 'D', 'KeyE': 'E', 'KeyF': 'F',
    'KeyG': 'G', 'KeyH': 'H', 'KeyI': 'I', 'KeyJ': 'J', 'KeyK': 'K', 'KeyL': 'L',
    'KeyM': 'M', 'KeyN': 'N', 'KeyO': 'O', 'KeyP': 'P', 'KeyQ': 'Q', 'KeyR': 'R',
    'KeyS': 'S', 'KeyT': 'T', 'KeyU': 'U', 'KeyV': 'V', 'KeyW': 'W', 'KeyX': 'X',
    'KeyY': 'Y', 'KeyZ': 'Z',
    'Digit0': '0', 'Digit1': '1', 'Digit2': '2', 'Digit3': '3', 'Digit4': '4',
    'Digit5': '5', 'Digit6': '6', 'Digit7': '7', 'Digit8': '8', 'Digit9': '9',
    'F1': 'F1', 'F2': 'F2', 'F3': 'F3', 'F4': 'F4', 'F5': 'F5',
    'F6': 'F6', 'F7': 'F7', 'F8': 'F8', 'F9': 'F9', 'F10': 'F10',
    'F11': 'F11', 'F12': 'F12', 'F13': 'F13', 'F14': 'F14', 'F15': 'F15',
    'F16': 'F16', 'F17': 'F17', 'F18': 'F18', 'F19': 'F19', 'F20': 'F20',
    'F21': 'F21', 'F22': 'F22', 'F23': 'F23', 'F24': 'F24',
    'Space': 'Space',
    'Escape': 'Escape',
    'Enter': 'Enter',
    'Tab': 'Tab',
    'Delete': 'Delete',
    'Insert': 'Insert',
    'Home': 'Home',
    'End': 'End',
    'PageUp': 'PageUp',
    'PageDown': 'PageDown',
    'ArrowUp': 'Up',
    'ArrowDown': 'Down',
    'ArrowLeft': 'Left',
    'ArrowRight': 'Right',
    'Backspace': 'Backspace',
    'CapsLock': 'CapsLock',
    'NumLock': 'NumLock',
    'ScrollLock': 'ScrollLock',
    'Pause': 'Pause',
    'PrintScreen': 'PrintScreen',
    'Minus': '-',
    'Equal': '=',
    'BracketLeft': '[',
    'BracketRight': ']',
    'Backslash': '\\',
    'Semicolon': ';',
    'Quote': "'",
    'Comma': ',',
    'Period': '.',
    'Slash': '/',
    'Backquote': '`'
};

const reverseKeyCodeMap = {};
Object.entries(keyCodeMap).forEach(([code, name]) => {
    reverseKeyCodeMap[name] = code;
});

function validateHotkey(hotkey) {
    if (!hotkey) return false;
    
    const parts = hotkey.split('+');
    const keyName = parts[parts.length - 1];
    
    // Проверяем, что клавиша существует в нашей карте
    if (!reverseKeyCodeMap[keyName]) {
        console.log('[Hotkey] Invalid key name:', keyName);
        return false;
    }
    
    // Список зарезервированных системных комбинаций
    const reservedCombos = [
        'F12', 'Ctrl+I', 'Ctrl+Shift+I', 'Cmd+I', 'Cmd+Shift+I',
        'Ctrl+Alt+Delete', 'Ctrl+Shift+Escape', 'Alt+Tab', 'Ctrl+Esc',
        'Ctrl+Alt+Del', 'Ctrl+Shift+Esc'
    ];
    
    // Проверяем только полное совпадение с зарезервированными комбинациями
    if (reservedCombos.includes(hotkey)) {
        console.log('[Hotkey] Reserved combination:', hotkey);
        return false;
    }
    
    // Разрешаем все одиночные клавиши
    if (parts.length === 1) {
        // Запрещаем только совсем опасные одиночные клавиши
        const dangerousKeys = ['Escape', 'Enter', 'Tab', 'Space', 'Backspace'];
        if (dangerousKeys.includes(keyName)) {
            console.log('[Hotkey] Dangerous single key:', keyName);
            return false;
        }
        return true;
    }
    
    // Для комбинаций с модификаторами разрешаем любые клавиши
    return true;
}

function registerToggleHotkey(accelerator) {
    try {
        if (!validateHotkey(accelerator)) {
            console.log('[Hotkey] Invalid hotkey combination:', accelerator);
            return false;
        }
        if (accelerator === currentHotkey && globalShortcut.isRegistered(accelerator)) return true;
        
        const success = globalShortcut.register(accelerator, toggleSearchWindow);
        
        if (success) {
            if (currentHotkey && currentHotkey !== accelerator) globalShortcut.unregister(currentHotkey);
            console.log('[Hotkey] Registered:', accelerator);
            currentHotkey = accelerator;
            return true;
        } else {
            console.log('[Hotkey] Failed to register:', accelerator);
            return false;
        }
    } catch (error) {
        console.error('[Hotkey] Error:', error);
        return false;
    }
}

function publishUpdateStatus(state, details = {}) {
    updateStatus = { state, mode: updateMode, current: app.getVersion(), ...details };
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updates:status', updateStatus);
    }
    return updateStatus;
}

function checkAutomatically() {
    if (['installed', 'portable'].includes(updateMode) && !downloadedVersion && getPreferences().autoUpdate) {
        checkAppUpdate();
    }
}

function setupAutoUpdater() {
    if (updateMode === 'installed') {
        autoUpdater.autoDownload = true;
        autoUpdater.autoInstallOnAppQuit = true;
        autoUpdater.allowPrerelease = false;
        autoUpdater.on('error', error => {
            console.error('[AutoUpdater]', error.message);
            if (updateStatus.state === 'installing') {
                publishUpdateStatus('install-error', { latest: downloadedVersion });
            }
        });
        autoUpdater.on('update-available', info => {
            publishUpdateStatus('downloading', { latest: info.version });
        });
        autoUpdater.on('download-progress', progress => {
            publishUpdateStatus('downloading', {
                latest: updateStatus.latest,
                percent: Math.min(100, Math.max(0, Math.floor(progress.percent)))
            });
        });
        autoUpdater.on('update-downloaded', info => {
            downloadedVersion = info.version;
            publishUpdateStatus('downloaded', { latest: downloadedVersion });
        });
        // Run before the updater's quit listener, which is registered after the first download.
        app.on('quit', () => {
            autoUpdater.autoInstallOnAppQuit = getPreferences().autoUpdate;
        });
    }
    setInterval(checkAutomatically, 60 * 60 * 1000).unref();
}

function checkAppUpdate() {
    if (downloadedVersion || updateCheck) return updateStatus;
    publishUpdateStatus('checking');
    updateCheck = checkGitHubRelease()
        .catch(error => {
            console.error('[AutoUpdater]', error.message);
            publishUpdateStatus(updateStatus.state === 'downloading' ? 'download-error' : 'check-error');
        })
        .finally(() => { updateCheck = null; });
    return updateStatus;
}

async function checkGitHubRelease() {
    if (updateMode === 'installed') {
        const result = await autoUpdater.checkForUpdates();
        if (!result) throw Error('Update provider unavailable');
        if (result.isUpdateAvailable) await result.downloadPromise;
        else publishUpdateStatus('current');
        return;
    }

    const response = await fetch(RELEASES_PAGE, { timeout: 8000, redirect: 'manual' });
    const location = response.headers.get('location');
    if (response.status !== 302 || !location) throw Error('GitHub HTTP ' + response.status);
    const target = new URL(location, RELEASES_PAGE);
    const latest = target.origin === 'https://github.com' &&
        /^\/dev-onewizard\/dev-onewizard\/releases\/tag\/v?(\d+\.\d+\.\d+)$/.exec(target.pathname)?.[1];
    if (!latest) throw Error('Invalid stable release version');
    const installed = app.getVersion().split('.').map(Number);
    const difference = latest.split('.').map((part, index) => Number(part) - installed[index]).find(value => value !== 0);
    publishUpdateStatus(difference > 0 ? 'available' : 'current', { latest });
}

function openHttpsLink(url) {
    if (typeof url !== 'string') return;
    try {
        const link = new URL(url);
        if (link.protocol === 'https:') shell.openExternal(link.href).catch(console.error);
    } catch {
        // Ignore invalid URLs.
    }
}

function setupIPCHandlers() {
    ipcMain.handle('preferences:get', () => getPreferences());
    ipcMain.handle('preferences:save', (_, changes, initialize) => savePreferences(changes, initialize === true));
    ipcMain.handle('preferences:reset', () => {
        const hotkeySet = registerToggleHotkey('Ctrl+Shift+K');
        const saved = updateConfig(config => ({
            ...config, preferences: { ...DEFAULT_PREFS }, toggleSearch: currentHotkey,
            autoHideEnabled: true, selectedServer: 'new-york-1', russiaServer: RUSSIA_SERVERS[0].id,
            selectedProject: 'majestic'
        }));
        if (!saved) throw Error('Settings reset failed');
        autoHideEnabled = true;
        setActiveProject('majestic');
        lastSearchBounds = null;
        broadcast('preferences:reset', { ...getPreferences(), hotkeySet });
        checkAutomatically();
        if (searchWindow?.isVisible()) resetInactivityTimer();
        return { hotkeySet };
    });
    ipcMain.handle('cache:size', () => getCacheSize());
    ipcMain.handle('cache:clear', () => {
        fs.rmSync(cacheDir(), { recursive: true, force: true });
        cacheGeneration++;
        pendingData.clear();
        dataCache.structure = null;
        dataCache.structureTimestamp = 0;
        dataCache.laws.clear();
        dataCache.rules.clear();
        broadcast('cache:cleared');
        return 0;
    });
    ipcMain.handle('clipboard:copy', (_, text) => {
        if (typeof text !== 'string' || !text || text.length > 500) return false;
        clipboard.writeText(text);
        return true;
    });
    ipcMain.handle('updates:check', () => checkAppUpdate());
    ipcMain.handle('updates:startup-check', event => {
        if (event.sender === mainWindow?.webContents && getPreferences().autoUpdate) return checkAppUpdate();
        return updateStatus;
    });
    ipcMain.handle('updates:status', () => updateStatus);
    ipcMain.handle('updates:history', () => require('./releases.json').updates);
    ipcMain.handle('ads:list', () => {
        const banners = require('./assets/ads/banners.json');
        if (!Array.isArray(banners)) return [];
        return banners.filter(banner =>
            typeof banner?.image === 'string' &&
            /^[a-z0-9][a-z0-9._-]*\.(?:jpe?g|png|webp|avif)$/i.test(banner.image) &&
            fs.existsSync(path.join(__dirname, 'assets', 'ads', banner.image))
        ).map(({ image, title, url }) => ({
            image,
            title: typeof title === 'string' ? title.trim() : '',
            url: typeof url === 'string' ? url : ''
        }));
    });
    ipcMain.on('updates:install', (event) => {
        if (!downloadedVersion || updateStatus.state === 'installing' ||
            event.sender !== mainWindow?.webContents) return;
        publishUpdateStatus('installing', { latest: downloadedVersion });
        autoUpdater.quitAndInstall(true, true);
    });
    ipcMain.on('window:minimize', () => mainWindow?.minimize());
    ipcMain.on('window:close', () => app.quit());
    ipcMain.on('window:hide-search', (event) => {
        if (event.sender === searchWindow?.webContents) hideSearchWindow();
    });
    ipcMain.on('window:toggle-search', toggleSearchWindow);
    ipcMain.on('window:open-search', (event, tab) => {
        if (event.sender === mainWindow?.webContents) openSearchWindow(tab);
    });
    
    // Новый обработчик для звука
    ipcMain.on('play-sound', (event, type) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('play-sound', type);
        }
    });
    
    ipcMain.handle('cfg:getHotkey', async () => ({ toggleSearch: currentHotkey }));
    ipcMain.handle('cfg:setHotkey', async (event, accelerator) => {
        const previous = currentHotkey;
        if (!registerToggleHotkey(accelerator)) return { ok: false };
        if (!writeHotkey(accelerator)) {
            registerToggleHotkey(previous);
            return { ok: false };
        }
        Analytics.trackSettingsChange('hotkey', accelerator);
        return { ok: true };
    });
    ipcMain.handle('cfg:getAutoHide', () => autoHideEnabled);
    ipcMain.handle('cfg:setAutoHide', (event, enabled) => {
        if (typeof enabled !== 'boolean' || !writeAutoHide(enabled)) return false;
        autoHideEnabled = enabled;
        if (enabled) resetInactivityTimer();
        else clearInactivityTimer();
        broadcast('preferences:changed', getPreferences());
        return true;
    });
    
    ipcMain.handle('laws:listServers', (event, forceRefresh = false) => fetchServersList(forceRefresh));
    ipcMain.handle('get-repo-structure', () => fetchRepoStructure());
    ipcMain.handle('get-server-laws', (event, serverId, forceRefresh = false) => fetchServerJson(serverId, forceRefresh));
    ipcMain.handle('get-rules-file', (event, filename, forceRefresh = false) => fetchRulesJson(filename, forceRefresh));
    
    ipcMain.handle('laws:checkUpdates', async (event, serverId, currentUpdatedAt) => {
        const data = await fetchServerJson(serverId, true);
        return { hasUpdate: Boolean(data?.updatedAt && data.updatedAt !== currentUpdatedAt) };
    });
    
    ipcMain.handle('log', async (event, logs) => {
        try {
            if (!logs || !logs.length) return;
            
            const logDir = path.join(app.getPath('userData'), 'logs');
            const logFile = path.join(logDir, `app-${new Date().toISOString().split('T')[0]}.log`);
            
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }
            
            const logStream = logs.join('\n') + '\n';
            await fs.promises.appendFile(logFile, logStream, 'utf-8');
            
            try {
                const files = fs.readdirSync(logDir)
                    .filter(f => f.startsWith('app-') && f.endsWith('.log'))
                    .sort()
                    .reverse();
                
                if (files.length > 5) {
                    files.slice(5).forEach(f => {
                        const filePath = path.join(logDir, f);
                        if (fs.existsSync(filePath)) {
                            fs.unlinkSync(filePath);
                        }
                    });
                }
            } catch (rotationError) {
                console.error('[Logger] Log rotation failed:', rotationError);
            }
            
        } catch (error) {
            console.error('[Logger] Failed to write logs:', error);
        }
    });
    
    ipcMain.handle('get-app-info', () => ({
        version: app.getVersion(),
        name: 'Codex Assistant',
        author: 'onewizard-dev',
        platform: process.platform
    }));
    
    ipcMain.handle('project:get', () => activeProject);
    ipcMain.on('project:select', (event, project) => {
        if (event.sender !== mainWindow?.webContents || !['majestic', 'russia-online'].includes(project)) return;
        setActiveProject(project);
        updateConfig(config => ({ ...config, selectedProject: project }));
    });
    ipcMain.handle('server:list', (_, project) =>
        project === 'russia-online' ? RUSSIA_SERVERS : fetchServersList());
    ipcMain.on('server:selected', (event, serverId, project) => {
        if (project === 'russia-online') {
            if (!RUSSIA_SERVERS.some(server => server.id === serverId)) return;
            updateConfig(config => ({ ...config, russiaServer: serverId }));
            for (const win of [mainWindow, searchWindow]) {
                if (win && !win.isDestroyed() && event.sender !== win.webContents) {
                    win.webContents.send('server:russia-changed', serverId);
                }
            }
            return;
        }
        const normalizedId = normalizeServerId(serverId);
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*-\d+$/.test(normalizedId)) return;
        console.log('[IPC] Server selected:', normalizedId);
        Analytics.trackServerChange(normalizedId);
        updateConfig((config) => ({ ...config, selectedServer: normalizedId }));
        
        if (mainWindow && !mainWindow.isDestroyed() && event.sender !== mainWindow.webContents) {
            mainWindow.webContents.send('server:changed', normalizedId);
        }
        if (searchWindow && !searchWindow.isDestroyed() && event.sender !== searchWindow.webContents) {
            searchWindow.webContents.send('server:changed', normalizedId);
        }
    });
    
    ipcMain.handle('server:getCurrent', (_, project) => {
        const config = readConfig();
        if (project === 'russia-online') {
            return RUSSIA_SERVERS.find(server => server.id === config.russiaServer)?.id || RUSSIA_SERVERS[0].id;
        }
        return config.selectedServer || 'new-york-1';
    });
    
    ipcMain.on('analytics:search', (event, query, count) => Analytics.trackSearch(query, count));
    ipcMain.on('analytics:copy', (event, type, section) => Analytics.trackCopy(type, section));
    
    ipcMain.on('hotkey:startEditing', () => {
        isEditingHotkey = true;
        if (currentHotkey) {
            try {
                globalShortcut.unregister(currentHotkey);
            } catch (e) {
            }
        }
    });
    
    ipcMain.on('hotkey:stopEditing', () => {
        isEditingHotkey = false;
        if (currentHotkey) {
            try {
                if (!globalShortcut.isRegistered(currentHotkey)) {
                    globalShortcut.register(currentHotkey, toggleSearchWindow);
                }
            } catch (e) {
                console.error('[Hotkey] Failed to restore:', e);
            }
        }
    });
    
    ipcMain.on('hotkey:change', (event, newHotkey) => {
        if (newHotkey !== currentHotkey) {
            registerToggleHotkey(newHotkey);
            writeHotkey(newHotkey);
        }
        isEditingHotkey = false;
    });
    
    ipcMain.on('open-external', (event, url) => openHttpsLink(url));
    
    ipcMain.handle('utils:normalizeHotkeyFromKeyCode', (event, keyCode, modifiers) => {
        const keyName = keyCodeMap[keyCode];
        if (!keyName) return null;
        
        const parts = [];
        if (modifiers.ctrl) parts.push('Ctrl');
        if (modifiers.shift) parts.push('Shift');
        if (modifiers.alt) parts.push('Alt');
        if (modifiers.meta) parts.push('Cmd');
        
        parts.push(keyName);
        return parts.join('+');
    });
    
    ipcMain.on('search:user-activity', () => {
        if (searchWindow && !searchWindow.isDestroyed() && searchWindow.isVisible() && autoHideEnabled) {
            resetInactivityTimer();
        }
    });
}

app.whenReady().then(async () => {
    console.log('[App] Ready, isDev:', isDev);
    if (process.platform === 'win32') {
        app.setAppUserModelId('com.onewizard.codex-assistant');
    }
    Menu.setApplicationMenu(null);
    
    currentHotkey = readHotkey();
    autoHideEnabled = readAutoHide();
    if (readConfig().selectedProject === 'russia-online') activeProject = 'russia-online';
    Analytics.startSession();
    
    setupIPCHandlers();
    await createMainWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (mainWindow === null) createMainWindow();
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    clearInactivityTimer();
});

app.on('before-quit', () => {
    cancelSearchHide();
    clearInactivityTimer();
});

process.on('exit', () => Analytics.trackAppExit());
