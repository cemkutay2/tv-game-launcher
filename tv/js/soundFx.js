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
}

if (typeof window !== 'undefined') {
    window.soundFx = new SoundFx();
}

if (typeof module !== 'undefined') {
    module.exports = SoundFx;
}
