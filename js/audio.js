// Web Audio API による効果音・シンセサウンド生成
class SoundManager {
    constructor() {
        this.ctx = null;
        this.muted = false;
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
            this.initialized = true;
        } catch (e) {
            console.warn("Web Audio API not supported", e);
        }
    }

    toggleMute() {
        this.muted = !this.muted;
        return this.muted;
    }

    playTone(freq, type = 'sine', duration = 0.15, gainVal = 0.2, pitchBend = 0) {
        if (this.muted || !this.ctx) return;
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        if (pitchBend !== 0) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(10, freq + pitchBend), this.ctx.currentTime + duration);
        }

        gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    // ゲート通過音（キラキラ上昇音）
    playGatePass(isPositive = true) {
        if (this.muted || !this.ctx) return;
        if (isPositive) {
            // 明るいチャイム
            const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
            notes.forEach((f, i) => {
                setTimeout(() => {
                    this.playTone(f, 'triangle', 0.12, 0.15);
                }, i * 40);
            });
        } else {
            // マイナスゲート（下降音）
            this.playTone(400, 'sawtooth', 0.25, 0.18, -250);
        }
    }

    // 棒人間がポコポコ増える音
    playSpawnPop() {
        if (this.muted || !this.ctx) return;
        const freq = 450 + Math.random() * 250;
        this.playTone(freq, 'sine', 0.08, 0.12, 100);
    }

    // 敵との衝突・クラッシュ音
    playClash() {
        if (this.muted || !this.ctx) return;
        // ノイズバースト風
        const bufferSize = this.ctx.sampleRate * 0.05;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, this.ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.05);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.05);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        noise.start();
    }

    // 障害物激突音
    playHitObstacle() {
        if (this.muted || !this.ctx) return;
        this.playTone(180, 'square', 0.15, 0.2, -80);
    }

    // 勝利ファンファーレ
    playVictory() {
        if (this.muted || !this.ctx) return;
        const fanfare = [
            { f: 523.25, d: 0.12, delay: 0 },
            { f: 523.25, d: 0.12, delay: 120 },
            { f: 523.25, d: 0.12, delay: 240 },
            { f: 659.25, d: 0.25, delay: 360 },
            { f: 587.33, d: 0.15, delay: 620 },
            { f: 659.25, d: 0.15, delay: 770 },
            { f: 783.99, d: 0.45, delay: 920 }
        ];

        fanfare.forEach(item => {
            setTimeout(() => {
                this.playTone(item.f, 'triangle', item.d, 0.22);
            }, item.delay);
        });
    }

    // ゲームオーバー音
    playGameOver() {
        if (this.muted || !this.ctx) return;
        const notes = [440, 415.3, 392, 369.99];
        notes.forEach((f, i) => {
            setTimeout(() => {
                this.playTone(f, 'sawtooth', 0.25, 0.2, -40);
            }, i * 180);
        });
    }

    // 階段登り音
    playStairStep(stepIndex) {
        if (this.muted || !this.ctx) return;
        const baseFreq = 440 * Math.pow(1.05946, stepIndex * 2);
        this.playTone(Math.min(baseFreq, 1400), 'triangle', 0.1, 0.15);
    }
}

window.sounds = new SoundManager();
