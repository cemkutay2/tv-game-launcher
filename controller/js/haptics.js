/**
 * Mobile Haptic Vibration Helper
 */
window.haptics = {
    isSupported: typeof navigator !== 'undefined' && 'vibrate' in navigator,

    // Short tactile tap for button presses
    tap: function() {
        if (this.isSupported) {
            try {
                navigator.vibrate(30);
            } catch (e) {}
        }
    },

    // Heavy thud for buzzers
    buzz: function() {
        if (this.isSupported) {
            try {
                navigator.vibrate([60, 40, 60]);
            } catch (e) {}
        }
    },

    // Success rumble
    success: function() {
        if (this.isSupported) {
            try {
                navigator.vibrate([40, 60, 80]);
            } catch (e) {}
        }
    }
};
