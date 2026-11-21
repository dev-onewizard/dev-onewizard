(function() {
    'use strict';

    const LOG_LEVELS = {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3,
        FATAL: 4,
        PERFORMANCE: 5
    };

    const LOG_LEVEL_NAMES = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL', 'PERF'];

    class Logger {
        constructor(options = {}) {
            this.level = options.level || (typeof process !== 'undefined' && process.env.NODE_ENV === 'development' ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO);
            this.enableFileLogging = options.enableFileLogging || false;
            this.maxLogSize = options.maxLogSize || 5 * 1024 * 1024; // 5MB
            this.maxFiles = options.maxFiles || 5;
            this.logDir = options.logDir || 'logs';
            this.moduleName = options.moduleName || 'APP';
            this.buffer = [];
            this.bufferSize = options.bufferSize || 100;
            this.flushInterval = options.flushInterval || 5000; // 5 секунд
            this.performanceLogs = [];
            this.maxPerformanceLogs = 100;
            this.startTime = Date.now();
            
            if (this.enableFileLogging && typeof window !== 'undefined' && window.CodexAPI && window.CodexAPI.utils && window.CodexAPI.utils.log) {
                this.initFileLogging();
            }
            
            this.setupGlobalErrorHandling();
            
            // Автоматическое логирование производительности каждые 5 минут
            if (typeof window !== 'undefined') {
                setInterval(() => {
                    this.logPerformance();
                }, 5 * 60 * 1000);
            }
        }
        
        initFileLogging() {
            setInterval(() => {
                this.flushToFile();
            }, this.flushInterval);
            
            window.addEventListener('beforeunload', () => {
                this.flushToFile(true);
            });
        }
        
        flushToFile(sync = false) {
            if (this.buffer.length === 0) return;
            
            const logs = [...this.buffer];
            this.buffer = [];
            
            if (window.CodexAPI && window.CodexAPI.utils && window.CodexAPI.utils.log) {
                if (sync) {
                    window.CodexAPI.utils.log(logs).catch(() => {});
                } else {
                    window.CodexAPI.utils.log(logs).catch(() => {});
                }
            }
        }
        
        formatMessage(level, message, ...args) {
            const timestamp = new Date().toISOString();
            const levelName = LOG_LEVEL_NAMES[level] || 'UNKNOWN';
            let formattedMessage = message;
            
            if (args.length > 0) {
                try {
                    formattedMessage += ' ' + args.map(arg => {
                        if (arg instanceof Error) {
                            return arg.stack || arg.message;
                        }
                        if (typeof arg === 'object' && arg !== null) {
                            try {
                                return JSON.stringify(arg, this.getCircularReplacer());
                            } catch {
                                return String(arg);
                            }
                        }
                        return String(arg);
                    }).join(' ');
                } catch (e) {
                    formattedMessage += ' [Error formatting args]';
                }
            }
            
            return `[${timestamp}] [${this.moduleName}] [${levelName}] ${formattedMessage}`;
        }
        
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
        }
        
        log(level, message, ...args) {
            if (level < this.level) return;
            
            const formatted = this.formatMessage(level, message, ...args);
            
            switch (level) {
                case LOG_LEVELS.DEBUG:
                    console.debug(formatted);
                    break;
                case LOG_LEVELS.INFO:
                    console.info(formatted);
                    break;
                case LOG_LEVELS.WARN:
                    console.warn(formatted);
                    break;
                case LOG_LEVELS.ERROR:
                case LOG_LEVELS.FATAL:
                    console.error(formatted);
                    break;
                case LOG_LEVELS.PERFORMANCE:
                    console.log('%c' + formatted, 'color: #9b59b6; font-weight: bold;');
                    break;
                default:
                    console.log(formatted);
            }
            
            if (this.enableFileLogging) {
                this.buffer.push(formatted);
                if (this.buffer.length >= this.bufferSize) {
                    this.flushToFile();
                }
            }
        }
        
        debug(message, ...args) {
            this.log(LOG_LEVELS.DEBUG, message, ...args);
        }
        
        info(message, ...args) {
            this.log(LOG_LEVELS.INFO, message, ...args);
        }
        
        warn(message, ...args) {
            this.log(LOG_LEVELS.WARN, message, ...args);
        }
        
        error(message, ...args) {
            this.log(LOG_LEVELS.ERROR, message, ...args);
        }
        
        fatal(message, ...args) {
            this.log(LOG_LEVELS.FATAL, message, ...args);
        }
        
        perf(message, ...args) {
            this.log(LOG_LEVELS.PERFORMANCE, message, ...args);
        }
        
        // Новый метод для логирования производительности
        logPerformance() {
            const memory = window.performance && window.performance.memory ? {
                used: Math.round(window.performance.memory.usedJSHeapSize / 1048576) + 'MB',
                total: Math.round(window.performance.memory.jsHeapSizeLimit / 1048576) + 'MB',
                percent: ((window.performance.memory.usedJSHeapSize / window.performance.memory.jsHeapSizeLimit) * 100).toFixed(1) + '%'
            } : null;
            
            const uptime = Math.round((Date.now() - this.startTime) / 1000);
            
            const perfData = {
                timestamp: Date.now(),
                uptime: uptime + 's',
                memory: memory,
                fps: window.ErrorBoundary ? window.ErrorBoundary.performanceMetrics.fps : null,
                url: window.location.href
            };
            
            this.performanceLogs.unshift(perfData);
            if (this.performanceLogs.length > this.maxPerformanceLogs) {
                this.performanceLogs.pop();
            }
            
            this.perf('Performance metrics:', perfData);
            
            return perfData;
        }
        
        // Новый метод для измерения времени выполнения
        time(label) {
            if (this.level <= LOG_LEVELS.DEBUG) {
                console.time(label);
            }
        }
        
        timeEnd(label) {
            if (this.level <= LOG_LEVELS.DEBUG) {
                console.timeEnd(label);
                const duration = performance.now() - performance.getEntriesByName(label)[0]?.startTime;
                if (duration > 100) { // Логируем только если выполнение заняло больше 100мс
                    this.perf(`Slow operation: ${label} took ${duration.toFixed(2)}ms`);
                }
            }
        }
        
        // Новый метод для логирования с контекстом
        withContext(context) {
            return {
                debug: (message, ...args) => this.debug(`[${context}] ${message}`, ...args),
                info: (message, ...args) => this.info(`[${context}] ${message}`, ...args),
                warn: (message, ...args) => this.warn(`[${context}] ${message}`, ...args),
                error: (message, ...args) => this.error(`[${context}] ${message}`, ...args),
                perf: (message, ...args) => this.perf(`[${context}] ${message}`, ...args)
            };
        }
        
        child(moduleName) {
            return new Logger({
                level: this.level,
                enableFileLogging: this.enableFileLogging,
                maxLogSize: this.maxLogSize,
                maxFiles: this.maxFiles,
                logDir: this.logDir,
                moduleName: `${this.moduleName}:${moduleName}`,
                bufferSize: this.bufferSize,
                flushInterval: this.flushInterval
            });
        }
        
        setupGlobalErrorHandling() {
            if (typeof window === 'undefined') return;
            
            window.addEventListener('error', (event) => {
                this.error('Uncaught error:', {
                    message: event.message,
                    filename: event.filename,
                    lineno: event.lineno,
                    colno: event.colno,
                    error: event.error ? {
                        message: event.error.message,
                        stack: event.error.stack,
                        name: event.error.name
                    } : null
                });
            });
            
            window.addEventListener('unhandledrejection', (event) => {
                this.error('Unhandled promise rejection:', {
                    reason: event.reason ? {
                        message: event.reason.message || String(event.reason),
                        stack: event.reason.stack,
                        name: event.reason.name
                    } : 'Unknown reason'
                });
            });
            
            // Логирование загрузки ресурсов
            if (window.performance) {
                window.addEventListener('load', () => {
                    setTimeout(() => {
                        const resources = performance.getEntriesByType('resource');
                        const slowResources = resources.filter(r => r.duration > 1000);
                        
                        if (slowResources.length > 0) {
                            this.warn('Slow resources loaded:', slowResources.map(r => ({
                                name: r.name.split('/').pop(),
                                duration: r.duration.toFixed(0) + 'ms'
                            })));
                        }
                    }, 1000);
                });
            }
        }
        
        // Новый метод для получения истории производительности
        getPerformanceHistory() {
            return this.performanceLogs;
        }
        
        // Новый метод для экспорта логов
        exportLogs() {
            return {
                logs: this.buffer,
                performance: this.performanceLogs,
                timestamp: new Date().toISOString(),
                version: window.CodexAPI ? window.CodexAPI.app.getInfo() : null
            };
        }
        
        // Новый метод для очистки старых логов
        cleanup() {
            this.performanceLogs = this.performanceLogs.slice(0, 50);
            if (this.buffer.length > this.bufferSize * 2) {
                this.buffer = this.buffer.slice(-this.bufferSize);
            }
        }
    }

    // Создаём глобальный экземпляр логгера
    window.logger = new Logger({
        level: typeof process !== 'undefined' && process.env.NODE_ENV === 'development' ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO,
        enableFileLogging: true,
        moduleName: 'CORE'
    });

    window.LOG_LEVELS = LOG_LEVELS;

    // Добавляем удобные методы для отладки
    window.debug = {
        log: (...args) => window.logger.debug(...args),
        info: (...args) => window.logger.info(...args),
        warn: (...args) => window.logger.warn(...args),
        error: (...args) => window.logger.error(...args),
        perf: (...args) => window.logger.perf(...args),
        time: (label) => window.logger.time(label),
        timeEnd: (label) => window.logger.timeEnd(label),
        performance: () => window.logger.logPerformance(),
        export: () => window.logger.exportLogs()
    };

    // Автоматическая очистка каждые 10 минут
    setInterval(() => {
        if (window.logger) {
            window.logger.cleanup();
        }
    }, 10 * 60 * 1000);

})();