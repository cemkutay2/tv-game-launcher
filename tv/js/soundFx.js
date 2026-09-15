/**
 * Web Audio API Sound Synthesizer for TV Host
 * Generates arcade-style game sounds procedurally with no external audio file downloads.
 */

class SoundFx {
    constructor() {
        this.ctx = null;
        this.enabled = true;
    }

    init() {
        if (!this.ctx && typeof window !== 'undefined') {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.ctx = new AudioContext();
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    playTone(frequency, duration, type = 'sine', startGain = 0.2, endGain = 0.001) {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = type;
            osc.frequency.setValueAtTime(frequency, this.ctx.currentTime);

            gain.gain.setValueAtTime(startGain, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(endGain, this.ctx.currentTime + duration);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start();
            osc.stop(this.ctx.currentTime + duration);
        } catch (e) {
            console.warn('[Audio] Error playing tone:', e);
        }
    }

    // Player joined chime (C5 -> G5 upward chime)
    joinChime() {
        this.playTone(523.25, 0.15, 'triangle', 0.25);
        setTimeout(() => this.playTone(783.99, 0.25, 'triangle', 0.25), 120);
    }

    // Player ready beep (crisp high tone)
    readyBeep() {
        this.playTone(880, 0.12, 'sine', 0.2);
    }

    // Countdown pips (3-2-1 pips and GO!)
    countdownPip(isFinal = false) {
        if (isFinal) {
            this.playTone(1046.5, 0.4, 'square', 0.3); // High C6
        } else {
            this.playTone(523.25, 0.18, 'sine', 0.25); // Mid C5
        }
    }

    // Buzzer hit sound (electric sawtooth chord)
    buzzerHit() {
        this.playTone(440, 0.25, 'sawtooth', 0.35);
        this.playTone(554.37, 0.25, 'sawtooth', 0.25);
    }

    // Game over / victory fanfare
    victoryFanfare() {
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((freq, idx) => {
            setTimeout(() => {
                this.playTone(freq, 0.35, 'triangle', 0.3);
            }, idx * 120);
        });
    }

    // Laser fire sound (rapid downward frequency sweep)
    laserShot() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(880, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(160, this.ctx.currentTime + 0.12);
            gain.gain.setValueAtTime(0.22, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.12);
        } catch (e) {}
    }

    // Shell ricochet / wall bounce chirp
    ricochet() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1400, this.ctx.currentTime);
            osc.frequency.linearRampToValueAtTime(1900, this.ctx.currentTime + 0.04);
            osc.frequency.exponentialRampToValueAtTime(900, this.ctx.currentTime + 0.08);
            gain.gain.setValueAtTime(0.18, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.08);
        } catch (e) {}
    }

    // Tank damaged / shield impact
    tankHit() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        try {
            this.playTone(220, 0.1, 'square', 0.25);
            this.playTone(110, 0.15, 'sawtooth', 0.3);
        } catch (e) {}
    }

    // Tank explosion sound (low rumble explosion)
    tankExplosion() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(180, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(32, this.ctx.currentTime + 0.45);
            gain.gain.setValueAtTime(0.35, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.45);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.45);

            // Add secondary crackle
            setTimeout(() => this.playTone(85, 0.2, 'square', 0.25), 80);
        } catch (e) {}
    }

    // Nitro boost whoosh sound
    boostSound() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(220, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(580, this.ctx.currentTime + 0.22);
            gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.22);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.22);
        } catch (e) {}
    }
}

if (typeof window !== 'undefined') {
    window.soundFx = new SoundFx();
}

if (typeof module !== 'undefined') {
    module.exports = SoundFx;
}
