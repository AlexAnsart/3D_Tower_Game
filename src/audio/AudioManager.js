import { SETTINGS } from '../settings.js';

export class AudioManager {
    constructor() {
        this.context = null;
        this.masterGain = null;
        this.fileAudio = new Map();
    }

    ensureContext() {
        if (this.context) return;
        const ctx = window.AudioContext || window.webkitAudioContext;
        if (!ctx) return;
        this.context = new ctx();
        this.masterGain = this.context.createGain();
        this.masterGain.gain.value = SETTINGS.audio.masterVolume;
        this.masterGain.connect(this.context.destination);
    }

    async unlock() {
        this.ensureContext();
        if (this.context?.state === 'suspended') {
            await this.context.resume();
        }
    }

    play(eventName) {
        this.tryPlayFile(eventName);
        this.playProcedural(eventName);
    }

    tryPlayFile(eventName) {
        const map = {
            cannonShot: SETTINGS.audio.files.cannon,
            mortarShot: SETTINGS.audio.files.mortar,
            mageFire: SETTINGS.audio.files.mageFire,
            bossDeath: SETTINGS.audio.files.bossDeath,
            heavyImpact: SETTINGS.audio.files.heavyImpact
        };
        const fileName = map[eventName];
        if (!fileName) return;
        const key = `${SETTINGS.audio.optionalFilesPath}/${fileName}`;
        let audio = this.fileAudio.get(key);
        if (!audio) {
            audio = new Audio(key);
            audio.volume = 0.35 * SETTINGS.audio.masterVolume;
            audio.preload = 'auto';
            audio.onerror = () => {
                // Optional asset can be missing; ignore without crashing.
            };
            this.fileAudio.set(key, audio);
        }
        try {
            audio.currentTime = 0;
            audio.play().catch(() => {});
        } catch (_e) {}
    }

    playProcedural(eventName) {
        this.ensureContext();
        if (!this.context || !this.masterGain) return;
        const now = this.context.currentTime;
        const make = (freqA, freqB, duration, type = 'sine', gain = 0.16) => {
            const osc = this.context.createOscillator();
            const g = this.context.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freqA, now);
            osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqB), now + duration);
            g.gain.setValueAtTime(gain, now);
            g.gain.exponentialRampToValueAtTime(0.001, now + duration);
            osc.connect(g);
            g.connect(this.masterGain);
            osc.start(now);
            osc.stop(now + duration);
        };

        if (eventName === 'cannonShot') make(160, 45, 0.22, 'triangle', 0.22);
        if (eventName === 'mortarShot') make(90, 28, 0.45, 'sawtooth', 0.3);
        if (eventName === 'mageFire') make(520, 180, 0.2, 'square', 0.08);
        if (eventName === 'bossDeath') make(140, 30, 0.9, 'triangle', 0.22);
        if (eventName === 'heavyImpact') make(75, 24, 0.35, 'sawtooth', 0.25);
    }
}
