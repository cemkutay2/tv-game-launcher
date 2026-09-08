/**
 * Screen Wake Lock API Wrapper
 * Prevents mobile screens from dimming or going to sleep during party game sessions.
 */
class WakeLockManager {
    constructor() {
        this.wakeLock = null;
        this.isSupported = 'wakeLock' in navigator;
        this.initVisibilityListener();
    }

    async requestLock() {
        if (!this.isSupported) {
            console.log('[WakeLock] Screen Wake Lock API not supported on this browser.');
            return false;
        }

        try {
            this.wakeLock = await navigator.wakeLock.request('screen');
            console.log('[WakeLock] Screen Wake Lock acquired.');

            this.wakeLock.addEventListener('release', () => {
                console.log('[WakeLock] Screen Wake Lock was released.');
                this.wakeLock = null;
            });
            return true;
        } catch (err) {
            console.warn(`[WakeLock] Failed to acquire lock: ${err.name}, ${err.message}`);
            return false;
        }
    }

    async releaseLock() {
        if (this.wakeLock !== null) {
            try {
                await this.wakeLock.release();
                this.wakeLock = null;
                console.log('[WakeLock] Manually released.');
            } catch (err) {
                console.warn('[WakeLock] Error releasing lock:', err);
            }
        }
    }

    initVisibilityListener() {
        document.addEventListener('visibilitychange', async () => {
            if (this.wakeLock !== null && document.visibilityState === 'visible') {
                // Re-acquire lock after returning from background
                await this.requestLock();
            }
        });
    }
}

window.wakeLockManager = new WakeLockManager();
