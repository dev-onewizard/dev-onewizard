// error-boundary.js
(function() {
    'use strict';

    const ErrorBoundary = {
        errors: [],
        maxErrors: 50,
        recoveryAttempts: 0,
        maxRecoveryAttempts: 3,
        initialized: false,
        performanceMetrics: {
            fps: 60,
            lastFrameTime: performance.now(),
            frames: 0,
            lowFpsCount: 0
        },
        
        init() {
            if (this.initialized) return;
            
            if (window.logger) logger.info('ErrorBoundary initializing...');
            
            window.addEventListener('error', (event) => {
                this.handleError({
                    type: 'uncaught',
                    message: event.message,
                    filename: event.filename,
                    lineno: event.lineno,
                    colno: event.colno,
                    error: event.error,
                    stack: event.error ? event.error.stack : null
                });
                event.preventDefault();
            });
            
            window.addEventListener('unhandledrejection', (event) => {
                this.handleError({
                    type: 'unhandledrejection',
                    message: event.reason ? (event.reason.message || String(event.reason)) : 'Unknown rejection',
                    error: event.reason,
                    stack: event.reason ? event.reason.stack : null
                });
                event.preventDefault();
            });
            
            this.startPerformanceMonitoring();
            setInterval(() => this.checkHealth(), 30000);
            
            this.initialized = true;
            if (window.logger) logger.info('ErrorBoundary ready');
        },
        
        startPerformanceMonitoring() {
            const measureFPS = () => {
                const now = performance.now();
                const delta = now - this.performanceMetrics.lastFrameTime;
                this.performanceMetrics.frames++;
                
                if (delta >= 1000) {
                    const fps = Math.round((this.performanceMetrics.frames * 1000) / delta);
                    this.performanceMetrics.fps = fps;
                    this.performanceMetrics.frames = 0;
                    this.performanceMetrics.lastFrameTime = now;
                    
                    if (fps < 30) {
                        this.performanceMetrics.lowFpsCount++;
                        if (window.logger) logger.warn(`Low FPS detected: ${fps}`);
                        
                        if (this.performanceMetrics.lowFpsCount > 5) {
                            this.optimizePerformance();
                        }
                    } else {
                        this.performanceMetrics.lowFpsCount = 0;
                    }
                }
                
                requestAnimationFrame(measureFPS);
            };
            
            requestAnimationFrame(measureFPS);
        },
        
        optimizePerformance() {
            if (window.logger) logger.info('Running performance optimization');
            
            try {
                if (window.SearchState && window.SearchState.lawsCache) {
                    if (window.SearchState.lawsCache.size > 100) {
                        const keysToKeep = Array.from(window.SearchState.lawsCache.keys()).slice(-50);
                        const newCache = new Map();
                        keysToKeep.forEach(key => {
                            newCache.set(key, window.SearchState.lawsCache.get(key));
                        });
                        window.SearchState.lawsCache = newCache;
                        if (window.logger) logger.info('Laws cache optimized');
                    }
                }
                
                this.performanceMetrics.lowFpsCount = 0;
                
            } catch (error) {
                if (window.logger) logger.error('Performance optimization failed:', error);
            }
        },
        
        handleError(errorInfo) {
            this.errors.unshift({
                ...errorInfo,
                timestamp: Date.now(),
                id: this.generateErrorId()
            });
            
            if (this.errors.length > this.maxErrors) {
                this.errors.pop();
            }
            
            if (window.logger) logger.error('ErrorBoundary caught:', errorInfo);
            
            this.attemptRecovery(errorInfo);
            
            if (this.isCritical(errorInfo)) {
                this.showUserError(errorInfo);
            }
        },
        
        generateErrorId() {
            return 'err-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        },
        
        isCritical(errorInfo) {
            const criticalPatterns = [
                /cannot read property/i,
                /undefined is not/i,
                /null is not/i,
                /failed to fetch/i,
                /network error/i,
                /disconnected/i,
                /out of memory/i,
                /cannot allocate/i,
                /stack overflow/i
            ];
            
            return criticalPatterns.some(pattern => 
                pattern.test(errorInfo.message || '')
            );
        },
        
        attemptRecovery(errorInfo) {
            this.recoveryAttempts++;
            
            if (this.recoveryAttempts > this.maxRecoveryAttempts) {
                if (window.logger) logger.fatal('Max recovery attempts reached, giving up');
                return;
            }
            
            if (window.logger) logger.info(`Recovery attempt ${this.recoveryAttempts}/${this.maxRecoveryAttempts}`);
            
            try {
                if (window.SearchState) {
                    if (typeof SearchState === 'object') {
                        SearchState.isLoading = false;
                        SearchState.initializing = false;
                        SearchState.loadError = null;
                    }
                }
                
                if (window.MainState) {
                    if (typeof MainState === 'object') {
                        MainState.isEditing = false;
                    }
                }
                
                document.querySelectorAll('.modal.show, .modal:not(.hidden)').forEach(modal => {
                    modal.classList.remove('show');
                    modal.classList.add('hidden');
                });
                
                const loadingElements = document.querySelectorAll('.loading-message, .loading-screen, [class*="loading"]');
                loadingElements.forEach(el => {
                    if (el.style.display !== 'none') {
                        el.style.display = 'none';
                    }
                });
                
                const timers = ['inactivityTimer', 'searchTimer', 'updateTimer'];
                timers.forEach(timer => {
                    if (window[timer]) {
                        clearTimeout(window[timer]);
                        window[timer] = null;
                    }
                });
                
            } catch (recoveryError) {
                if (window.logger) logger.error('Recovery failed:', recoveryError);
            }
        },
        
        showUserError(errorInfo) {
            const message = this.getUserFriendlyMessage(errorInfo);
            
            if (window.Notification && typeof Notification.show === 'function') {
                Notification.show(message);
            } else {
                const notification = document.createElement('div');
                notification.style.cssText = `
                    position: fixed;
                    top: 20px;
                    left: 50%;
                    transform: translateX(-50%) translateY(-100px);
                    background-color: var(--bg-secondary, #1A1A1A);
                    border: 1px solid var(--error-color, #CC3636);
                    color: var(--text-primary, #FFFFFF);
                    padding: 8px 20px;
                    border-radius: 30px;
                    font-family: 'Montserrat', sans-serif;
                    font-size: 13px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                    z-index: 10000;
                    opacity: 0;
                    transition: opacity 0.3s ease, transform 0.3s ease;
                    backdrop-filter: blur(10px);
                `;
                notification.textContent = message;
                
                document.body.appendChild(notification);
                
                setTimeout(() => {
                    notification.style.opacity = '1';
                    notification.style.transform = 'translateX(-50%) translateY(0)';
                }, 10);
                
                setTimeout(() => {
                    notification.style.opacity = '0';
                    notification.style.transform = 'translateX(-50%) translateY(-100px)';
                    setTimeout(() => {
                        if (notification.parentNode) {
                            notification.parentNode.removeChild(notification);
                        }
                    }, 300);
                }, 5000);
            }
        },
        
        getUserFriendlyMessage(errorInfo) {
            const message = errorInfo.message || '';
            
            if (message.includes('fetch') || message.includes('network')) {
                return 'Проблема с подключением к интернету. Проверьте соединение.';
            }
            if (message.includes('memory')) {
                return 'Недостаточно памяти. Перезапустите приложение.';
            }
            if (message.includes('undefined') || message.includes('null')) {
                return 'Произошла ошибка загрузки данных. Обновите страницу.';
            }
            
            return 'Произошла ошибка. Приложение продолжает работу.';
        },
        
        checkHealth() {
            if (window.logger) logger.debug('Health check...');
            
            try {
                const lastRender = window.lastRenderTime || 0;
                const now = Date.now();
                
                if (lastRender > 0 && now - lastRender > 60000) {
                    if (window.logger) logger.warn('Possible freeze detected, last render:', new Date(lastRender));
                    
                    if (window.SearchState) {
                        window.SearchState.isLoading = false;
                    }
                }
                
                if (window.performance && window.performance.memory) {
                    const memory = window.performance.memory;
                    const usedPercent = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;
                    
                    if (usedPercent > 90) {
                        if (window.logger) logger.warn('High memory usage:', usedPercent.toFixed(1) + '%');
                        this.optimizePerformance();
                    }
                }
                
                if (!window.CodexAPI) {
                    if (window.logger) logger.warn('CodexAPI missing!');
                }
                
                if (!window.Utils) {
                    if (window.logger) logger.warn('Utils missing!');
                }
                
            } catch (error) {
                if (window.logger) logger.error('Health check error:', error);
            }
        },
        
        getErrors() {
            return this.errors;
        },
        
        clearErrors() {
            this.errors = [];
            this.recoveryAttempts = 0;
        },
        
        forceReset() {
            try {
                if (window.logger) logger.info('Force reset requested');
                
                if (window.SearchState) {
                    window.SearchState.isLoading = false;
                    window.SearchState.initializing = false;
                    window.SearchState.loadError = null;
                    window.SearchState.lawsData = [];
                    window.SearchState.filteredLaws = [];
                }
                
                if (window.MainState) {
                    window.MainState.isEditing = false;
                }
                
                if (window.Utils && window.Utils.clearAllCache) {
                    window.Utils.clearAllCache();
                }
                
                if (window.forceReloadData) {
                    setTimeout(() => {
                        window.forceReloadData();
                    }, 500);
                }
                
                this.recoveryAttempts = 0;
                
                if (window.logger) logger.info('Force reset completed');
                
            } catch (error) {
                if (window.logger) logger.error('Force reset failed:', error);
            }
        },
        
        logPerformance() {
            return {
                fps: this.performanceMetrics.fps,
                memory: window.performance && window.performance.memory ? {
                    used: Math.round(window.performance.memory.usedJSHeapSize / 1048576) + 'MB',
                    total: Math.round(window.performance.memory.jsHeapSizeLimit / 1048576) + 'MB',
                    percent: ((window.performance.memory.usedJSHeapSize / window.performance.memory.jsHeapSizeLimit) * 100).toFixed(1) + '%'
                } : null,
                timestamp: new Date().toISOString()
            };
        }
    };

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                ErrorBoundary.init();
            });
        } else {
            setTimeout(() => {
                ErrorBoundary.init();
            }, 0);
        }
    }

    window.ErrorBoundary = ErrorBoundary;
    
    window.addEventListener('load', () => {
        if (window.requestIdleCallback) {
            requestIdleCallback(() => {
                console.log('[Performance]', ErrorBoundary.logPerformance());
            });
        }
    });

})();