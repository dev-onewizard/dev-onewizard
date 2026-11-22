(() => {
    const files = {
        copy: 'click.ogg',
        click: 'click.ogg',
        error: 'error.ogg',
        hover: 'hover.ogg',
        notification: 'modal.ogg',
        toggle: 'select.ogg',
        select: 'select.ogg'
    };
    const players = new Map();
    let lastHover = -Infinity;

    window.SoundManager = {
        enabled: true,
        volume: 70,
        initialized: false,

        init() {
            if (this.initialized) return;
            this.initialized = true;
            document.addEventListener('pointerover', event => {
                const control = event.target.closest('button, .link-icon');
                if (!control || control.disabled || control.contains(event.relatedTarget)) return;

                const now = performance.now();
                if (now - lastHover < 140 || !navigator.userActivation.hasBeenActive) return;
                lastHover = now;
                this.play('hover');
            }, { passive: true });
        },

        play(type) {
            const file = files[type];
            if (!file || !this.enabled || this.volume === 0) return;
            if (!players.has(file)) players.set(file, new Audio('../assets/sounds/' + file));

            const audio = players.get(file);
            audio.volume = this.volume / 100;
            audio.currentTime = 0;
            audio.play().catch(() => {});
        },

        preview(type) {
            this.play(type);
        },

        setEnabled(enabled) {
            this.enabled = enabled;
            if (!enabled) for (const audio of players.values()) audio.pause();
        },

        setVolume(volume) {
            this.volume = Math.max(0, Math.min(100, volume));
            for (const audio of players.values()) audio.volume = this.volume / 100;
        }
    };
})();
