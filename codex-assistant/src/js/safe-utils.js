(function() {
    'use strict';

    const SafeUtils = {
        getElement(id, context = document) {
            try {
                if (!id) {
                    if (window.logger) logger.warn('SafeUtils.getElement: empty id');
                    return null;
                }
                if (!context || typeof context.getElementById !== 'function') {
                    return null;
                }
                const el = context.getElementById(id);
                if (!el && window.logger) {
                    logger.debug(`Element not found: ${id}`);
                }
                return el;
            } catch (error) {
                if (window.logger) logger.error('SafeUtils.getElement error:', error);
                return null;
            }
        },
        
        addEventHandler(element, event, handler, options = {}) {
            try {
                if (!element || !event || !handler) {
                    if (window.logger) logger.warn('SafeUtils.addEventHandler: missing required params');
                    return false;
                }
                
                if (typeof element === 'string') {
                    element = this.getElement(element);
                    if (!element) return false;
                }
                
                element.removeEventListener(event, handler, options);
                element.addEventListener(event, handler, options);
                
                return true;
            } catch (error) {
                if (window.logger) logger.error('SafeUtils.addEventHandler error:', error);
                return false;
            }
        },
        
        safeGet(obj, path, defaultValue = '') {
            try {
                if (!obj || !path) return defaultValue;
                
                const keys = path.split('.');
                let current = obj;
                
                for (const key of keys) {
                    if (current === null || current === undefined || typeof current !== 'object') {
                        return defaultValue;
                    }
                    current = current[key];
                    if (current === undefined || current === null) {
                        return defaultValue;
                    }
                }
                
                return current;
            } catch (error) {
                if (window.logger) logger.error('SafeUtils.safeGet error:', error);
                return defaultValue;
            }
        },
        
        safeJsonParse(str, defaultValue = null) {
            try {
                if (typeof str !== 'string') return defaultValue;
                return JSON.parse(str);
            } catch (error) {
                if (window.logger) logger.warn('SafeUtils.safeJsonParse failed:', error.message);
                return defaultValue;
            }
        },
        
        safeJsonStringify(obj, defaultValue = '{}') {
            try {
                if (obj === undefined || obj === null) return defaultValue;
                return JSON.stringify(obj, this.getCircularReplacer());
            } catch (error) {
                if (window.logger) logger.warn('SafeUtils.safeJsonStringify failed:', error.message);
                return defaultValue;
            }
        },
        
        getCircularReplacer() {
            const seen = new WeakSet();
            return (key, value) => {
                if (typeof value === 'object' && value !== null) {
                    if (seen.has(value)) {
                        return '[Circular]';
                    }
                    seen.add(value);
                }
                return value;
            };
        },
        
        safeKeys(obj) {
            try {
                if (!obj || typeof obj !== 'object') return [];
                return Object.keys(obj);
            } catch (error) {
                if (window.logger) logger.error('SafeUtils.safeKeys error:', error);
                return [];
            }
        },
        
        safeValues(obj) {
            try {
                if (!obj || typeof obj !== 'object') return [];
                return Object.values(obj);
            } catch (error) {
                if (window.logger) logger.error('SafeUtils.safeValues error:', error);
                return [];
            }
        },
        
        safeEntries(obj) {
            try {
                if (!obj || typeof obj !== 'object') return [];
                return Object.entries(obj);
            } catch (error) {
                if (window.logger) logger.error('SafeUtils.safeEntries error:', error);
                return [];
            }
        },
        
        isObject(value) {
            return value && typeof value === 'object' && !Array.isArray(value);
        },
        
        safeCall(fn, ...args) {
            try {
                if (typeof fn !== 'function') {
                    if (window.logger) logger.warn('SafeUtils.safeCall: not a function');
                    return undefined;
                }
                return fn(...args);
            } catch (error) {
                if (window.logger) logger.error('SafeUtils.safeCall error:', error);
                return undefined;
            }
        },
        
        async safeCallAsync(fn, ...args) {
            try {
                if (typeof fn !== 'function') {
                    if (window.logger) logger.warn('SafeUtils.safeCallAsync: not a function');
                    return undefined;
                }
                return await fn(...args);
            } catch (error) {
                if (window.logger) logger.error('SafeUtils.safeCallAsync error:', error);
                return undefined;
            }
        },
        
        createId(prefix = 'el') {
            return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        },
        
        updateState(state, updates) {
            try {
                if (!state || typeof state !== 'object') return state;
                if (!updates || typeof updates !== 'object') return state;
                
                return { ...state, ...updates };
            } catch (error) {
                if (window.logger) logger.error('SafeUtils.updateState error:', error);
                return state;
            }
        },
        
        debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    SafeUtils.safeCall(func, ...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        },
        
        throttle(func, limit) {
            let inThrottle;
            return function executedFunction(...args) {
                if (!inThrottle) {
                    SafeUtils.safeCall(func, ...args);
                    inThrottle = true;
                    setTimeout(() => {
                        inThrottle = false;
                    }, limit);
                }
            };
        },
        
        safeLocalStorageGet(key, defaultValue = null) {
            try {
                const value = localStorage.getItem(key);
                return value !== null ? value : defaultValue;
            } catch (error) {
                if (window.logger) logger.warn('SafeUtils.safeLocalStorageGet failed:', error);
                return defaultValue;
            }
        },
        
        safeLocalStorageSet(key, value) {
            try {
                localStorage.setItem(key, value);
                return true;
            } catch (error) {
                if (window.logger) logger.warn('SafeUtils.safeLocalStorageSet failed:', error);
                return false;
            }
        },
        
        safeLocalStorageRemove(key) {
            try {
                localStorage.removeItem(key);
                return true;
            } catch (error) {
                if (window.logger) logger.warn('SafeUtils.safeLocalStorageRemove failed:', error);
                return false;
            }
        }
    };

    window.SafeUtils = SafeUtils;

})();