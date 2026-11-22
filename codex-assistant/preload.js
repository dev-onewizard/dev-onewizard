// preload.js
const { contextBridge, ipcRenderer } = require('electron');

console.log('[Preload] Loading Codex Assistant...');

function subscribe(channel, callback) {
    const handler = (_, value) => callback(value);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
}

const api = {
    window: {
        minimize: () => ipcRenderer.send('window:minimize'),
        close: () => ipcRenderer.send('window:close'),
        hideSearch: () => ipcRenderer.send('window:hide-search'),
        toggleSearch: () => ipcRenderer.send('window:toggle-search'),
    },
    preferences: {
        get: () => ipcRenderer.invoke('preferences:get'),
        save: (changes, initialize = false) => ipcRenderer.invoke('preferences:save', changes, initialize),
        reset: () => ipcRenderer.invoke('preferences:reset'),
        onChange: cb => subscribe('preferences:changed', cb),
        onReset: cb => subscribe('preferences:reset', cb),
    },
    cache: {
        size: () => ipcRenderer.invoke('cache:size'),
        clear: () => ipcRenderer.invoke('cache:clear'),
        onClear: cb => subscribe('cache:cleared', cb),
    },
    clipboard: { copy: text => ipcRenderer.invoke('clipboard:copy', text) },
    
    config: {
        getHotkey: () => ipcRenderer.invoke('cfg:getHotkey'),
        setHotkey: (acc) => ipcRenderer.invoke('cfg:setHotkey', acc),
        getAutoHide: () => ipcRenderer.invoke('cfg:getAutoHide'),
        setAutoHide: (enabled) => ipcRenderer.invoke('cfg:setAutoHide', enabled),
    },
    
    laws: {
        getServerData: (serverId, forceRefresh = false) => ipcRenderer.invoke('get-server-laws', serverId, forceRefresh),
        fetchRules: (filename, forceRefresh = false) => ipcRenderer.invoke('get-rules-file', filename, forceRefresh),
        listServers: (forceRefresh = false) => ipcRenderer.invoke('laws:listServers', forceRefresh),
        checkUpdates: (serverId, updatedAt) => 
            ipcRenderer.invoke('laws:checkUpdates', serverId, updatedAt),
    },
    
    server: {
        getCurrent: () => ipcRenderer.invoke('server:getCurrent'),
        select: (serverId) => ipcRenderer.send('server:selected', serverId),
        onChange: (callback) => {
            const handler = (_, id) => callback(id);
            ipcRenderer.on('server:changed', handler);
            return () => {
                ipcRenderer.removeListener('server:changed', handler);
            };
        }
    },
    
    updates: {
        check: () => ipcRenderer.invoke('updates:check'),
        history: () => ipcRenderer.invoke('updates:history'),
        install: () => ipcRenderer.send('updates:install'),
        onAvailable: (cb) => ipcRenderer.on('update-available', (_, v) => cb(v)),
        onProgress: (cb) => ipcRenderer.on('download-progress', (_, p) => cb(p)),
        onDownloaded: (cb) => ipcRenderer.on('update-downloaded', (_, v) => cb(v)),
        onError: (cb) => ipcRenderer.on('update-error', (_, m) => cb(m)),
    },
    
    app: {
        getInfo: () => ipcRenderer.invoke('get-app-info'),
    },
    
    analytics: {
        search: (query, count) => ipcRenderer.send('analytics:search', query, count),
        copy: (type, section) => ipcRenderer.send('analytics:copy', type, section),
    },
    
    hotkey: {
        startEditing: () => ipcRenderer.send('hotkey:startEditing'),
        stopEditing: () => ipcRenderer.send('hotkey:stopEditing'),
        change: (hotkey) => ipcRenderer.send('hotkey:change', hotkey),
    },
    
    activity: {
        userAction: () => ipcRenderer.send('search:user-activity'),
        trackInput: () => ipcRenderer.send('search:user-activity'),
        trackScroll: () => ipcRenderer.send('search:user-activity'),
        trackClick: () => ipcRenderer.send('search:user-activity'),
        trackMouseMove: () => ipcRenderer.send('search:user-activity'),
    },
    
    sound: {
        play: (type) => {
            ipcRenderer.send('play-sound', type);
        },
        setEnabled: (enabled) => {
            if (window.SoundManager) {
                window.SoundManager.setEnabled(enabled);
            }
        },
        setVolume: (volume) => {
            if (window.SoundManager) {
                window.SoundManager.setVolume(volume);
            }
        },
        test: () => {
            if (window.SoundManager) {
                window.SoundManager.test();
            }
        },
        preview: (type) => {
            if (window.SoundManager) {
                window.SoundManager.preview(type);
            }
        }
    },
    
    utils: {
        openExternal: (url) => ipcRenderer.send('open-external', url),
        on: (channel, callback) => {
            const handler = (_, ...args) => callback(...args);
            ipcRenderer.on(channel, handler);
            return () => ipcRenderer.removeListener(channel, handler);
        },
        log: (logs) => ipcRenderer.invoke('log', logs),
        
        normalizeHotkeyFromKeyCode: (keyCode, modifiers) => {
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
                'F11': 'F11', 'F12': 'F12', 'Space': 'Space', 'Escape': 'Escape',
                'Enter': 'Enter', 'Tab': 'Tab', 'Delete': 'Delete', 'Insert': 'Insert',
                'Home': 'Home', 'End': 'End', 'PageUp': 'PageUp', 'PageDown': 'PageDown',
                'ArrowUp': 'Up', 'ArrowDown': 'Down', 'ArrowLeft': 'Left', 'ArrowRight': 'Right',
                'Minus': '-', 'Equal': '=', 'BracketLeft': '[', 'BracketRight': ']',
                'Backslash': '\\', 'Semicolon': ';', 'Quote': "'", 'Comma': ',',
                'Period': '.', 'Slash': '/', 'Backquote': '`', 'Backspace': 'Backspace'
            };
            
            const keyName = keyCodeMap[keyCode];
            if (!keyName) return null;
            
            const parts = [];
            if (modifiers.ctrl) parts.push('Ctrl');
            if (modifiers.shift) parts.push('Shift');
            if (modifiers.alt) parts.push('Alt');
            if (modifiers.meta) parts.push('Cmd');
            
            parts.push(keyName);
            return parts.join('+');
        },
        
validateHotkey: (hotkey) => {
    const validKeys = ['A','B','C','D','E','F','G','H','I','J','K','L','M',
        'N','O','P','Q','R','S','T','U','V','W','X','Y','Z',
        '0','1','2','3','4','5','6','7','8','9',
        'F1','F2','F3','F4','F5','F6','F7','F8','F9','F10',
        'F11','F12','Space','Escape','Enter','Tab','Delete','Insert',
        'Home','End','PageUp','PageDown','Up','Down','Left','Right',
        '-','=','[',']','\\',';','\'',',','.','/','`', 'Backspace'];
    
    const parts = hotkey.split('+');
    const keyName = parts[parts.length - 1];
    
    // Проверяем, что клавиша существует
    if (!validKeys.includes(keyName)) {
        return false;
    }
    
    // Список зарезервированных системных комбинаций
    const reservedCombos = [
        'F12', 'Ctrl+I', 'Ctrl+Shift+I', 'Cmd+I', 'Cmd+Shift+I',
        'Ctrl+Alt+Delete', 'Ctrl+Shift+Escape', 'Alt+Tab', 'Ctrl+Esc',
        'Ctrl+Alt+Del', 'Ctrl+Shift+Esc'
    ];
    
    if (reservedCombos.includes(hotkey)) {
        return false;
    }
    
    // Разрешаем все одиночные клавиши, кроме совсем опасных
    if (parts.length === 1) {
        const dangerousKeys = ['Escape', 'Enter', 'Tab', 'Space', 'Backspace'];
        return !dangerousKeys.includes(keyName);
    }
    
    // Для комбинаций с модификаторами всегда разрешаем
    return true;
},
        
        setTheme: (theme) => {
            localStorage.setItem('theme', theme);
            ipcRenderer.send('theme:changed', theme);
        },
        
        getTheme: () => {
            return localStorage.getItem('theme') || 'dark';
        }
    }
};

try {
    contextBridge.exposeInMainWorld('CodexAPI', api);
    console.log('[Preload] API exposed successfully');
} catch (error) {
    console.error('[Preload] Failed to expose API:', error);
}
