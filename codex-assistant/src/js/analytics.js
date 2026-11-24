const { app } = require('electron');
const { randomUUID } = require('node:crypto');

const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

const MEASUREMENT_ID = process.env.CODEX_GA_MEASUREMENT_ID;
const API_SECRET = process.env.CODEX_GA_API_SECRET;

const APP_VERSION = app.getVersion();
const APP_NAME = 'Codex Hub';

let sessionStartTime = null;

function getUserId() {
    const userIdPath = path.join(app.getPath('userData'), 'analytics-id.json');
    
    try {
        if (fs.existsSync(userIdPath)) {
            const data = JSON.parse(fs.readFileSync(userIdPath, 'utf-8'));
            if (data.userId) return data.userId;
        }
    } catch (err) {
        console.error('[Analytics] Failed to read user ID:', err.message);
    }
    
    const userId = randomUUID();
    
    try {
        const dir = path.dirname(userIdPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(userIdPath, JSON.stringify({ userId }, null, 2));
    } catch (err) {
        console.error('[Analytics] Failed to save user ID:', err.message);
    }
    
    return userId;
}

async function sendEvent(eventName, params = {}) {
    if (!MEASUREMENT_ID || !API_SECRET) return;
    if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
        console.log('[Analytics] Skipped in dev mode:', eventName);
        return;
    }
    
    try {
        const userId = getUserId();
        const appVersion = app.getVersion();
        
        const payload = {
            client_id: userId,
            events: [{
                name: eventName,
                params: {
                    app_version: appVersion,
                    app_name: APP_NAME,
                    platform: process.platform,
                    ...params
                }
            }]
        };
        
        const url = `https://www.google-analytics.com/mp/collect?measurement_id=${MEASUREMENT_ID}&api_secret=${API_SECRET}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (response.ok) {
            console.log('[Analytics] Event sent:', eventName);
        }
    } catch (err) {
        if (process.env.NODE_ENV === 'development') {
            console.error('[Analytics] Error:', err.message);
        }
    }
}

async function trackAppStart() {
    await sendEvent('app_start', {
        app_version: app.getVersion(),
        platform: process.platform,
        arch: process.arch
    });
}

async function trackAppExit() {
    await sendEvent('app_exit', { session_duration: getSessionDuration() });
}

async function trackServerChange(serverId) {
    await sendEvent('server_change', { server_id: serverId });
}

async function trackSearch(query, resultCount) {
    await sendEvent('search', { query_length: query.length, result_count: resultCount });
}

async function trackCopy(articleType, section) {
    await sendEvent('copy', { article_type: articleType, section: section });
}

async function trackHotkeyUse() {
    await sendEvent('hotkey_use', {});
}

async function trackSettingsChange(setting, value) {
    await sendEvent('settings_change', { setting: setting, value: String(value) });
}

function startSession() {
    sessionStartTime = Date.now();
    console.log('[Analytics] Session started');
}

function getSessionDuration() {
    return sessionStartTime ? Math.floor((Date.now() - sessionStartTime) / 1000) : 0;
}

module.exports = {
    trackAppStart,
    trackAppExit,
    trackServerChange,
    trackSearch,
    trackCopy,
    trackHotkeyUse,
    trackSettingsChange,
    startSession,
    sendEvent
};