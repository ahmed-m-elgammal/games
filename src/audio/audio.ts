/**
 * Moonpetal audio: 100% synthesized WebAudio. No assets, no downloads.
 * - Ambient: slow chord pads + filtered wind + sparse music-box notes
 * - SFX: soft taps (pitch rises with tier), bell merges, plant/bloom/dew/creature
 * - Lullaby: original gentle melody, fades in at wind-down
 * All gains are modest; attack envelopes >= 40ms to avoid sudden sounds.
 */

type OscType = OscillatorType;

const NOTE: Record<string, number> = {
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0, B5: 987.77, C6: 1046.5
};

/** Original lullaby melody (32 steps of 0.45s), pentatonic, 3/4 lilt. */
const LULLABY: Array<string | null> = [
  'E5', null, 'G5', null, 'A5', null, null,
  'G5', null, 'E5', null, 'D5', null, null,
  'C5', null, 'E5', null, 'G5', null, null,
  'A5', null, 'G5', null, 'E5', null, null,
  'D5', null, 'C5', null, null, null, null
];

const PENTA = ['C5', 'D5', 'E5', 'G5', 'A5'];
const CHORDS: number[][] = [
  ['C3', 'E3', 'G3', 'B3'],
  ['A2', 'C3', 'E3', 'G3'],
  ['F2', 'A2', 'C3', 'E3'],
  ['G2', 'D3', 'G3', 'B3']
].map((c) => c.map((n) => ((NOTE as any)[n] as number) ?? 220));

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private windGain: GainNode | null = null;
  private chordTimer: number | null = null;
  private boxTimer: number | null = null;
  private lullabyTimer: number | null = null;
  private chordIdx = 0;
  private lullabyStep = 0;
  private noiseBuf: AudioBuffer | null = null;
  private started = false;
  vol = { master: 0.85, music: 0.55, sfx: 0.7 };
  haptics = true;

  /** Must be called from a user gesture. */
  init(): void {
    if (this.started) return;
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.musicBus = this.ctx.createGain();
      this.sfxBus = this.ctx.createGain();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 4;
      this.musicBus.connect(this.master);
      this.sfxBus.connect(this.master);
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      this.applyVolumes();
      this.noiseBuf = this.makeNoise();
      this.started = true;
      this.startAmbient();
    } catch {
      /* audio unavailable — game stays silent, which is fine */
    }
  }

  setVolumes(master: number, music: number, sfx: number): void {
    this.vol = { master: master / 100, music: music / 100, sfx: sfx / 100 };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.master || !this.musicBus || !this.sfxBus || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master, t, 0.15);
    this.musicBus.gain.setTargetAtTime(this.vol.music * 0.6, t, 0.15);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx * 0.9, t, 0.15);
  }

  private makeNoise(): AudioBuffer | null {
    if (!this.ctx) return null;
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02; // pink-ish
      d[i] = last * 3.2;
    }
    return buf;
  }

  /* ---------- ambient layer ---------- */

  private startAmbient(): void {
    if (!this.ctx || !this.musicBus || !this.noiseBuf) return;
    // wind: looped pink noise through slow bandpass
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 420;
    bp.Q.value = 0.6;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoG = this.ctx.createGain();
    lfoG.gain.value = 160;
    lfo.connect(lfoG);
    lfoG.connect(bp.frequency);
    lfo.start();
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.05;
    src.connect(bp);
    bp.connect(this.windGain);
    this.windGain.connect(this.musicBus);
    src.start();
    // chord pad + music box
    this.scheduleChord();
    this.chordTimer = window.setInterval(() => this.scheduleChord(), 12000);
    this.scheduleBoxNote();
    this.boxTimer = window.setInterval(() => this.scheduleBoxNote(), 2600);
  }

  private scheduleChord(): void {
    if (!this.ctx || !this.musicBus) return;
    const t = this.ctx.currentTime;
    const freqs = CHORDS[this.chordIdx % CHORDS.length];
    this.chordIdx++;
    for (let i = 0; i < freqs.length; i++) {
      const f = freqs[i];
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * (1 + (i % 2 === 0 ? 0.0015 : -0.0015)); // soft detune
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.028, t + 3.5); // slow attack
      g.gain.setValueAtTime(0.028, t + 8.5);
      g.gain.linearRampToValueAtTime(0.0001, t + 13);
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 760;
      o.connect(lp);
      lp.connect(g);
      g.connect(this.musicBus);
      o.start(t);
      o.stop(t + 13.2);
    }
  }

  private scheduleBoxNote(): void {
    if (!this.ctx || !this.musicBus) return;
    const note = PENTA[Math.floor(Math.random() * PENTA.length)];
    this.musicBox(NOTE[note], 0.016, 2.8, (Math.random() * 0.5 - 0.25));
  }

  /** music-box pluck on the music bus */
  private musicBox(freq: number, gain: number, dur: number, pan = 0): void {
    if (!this.ctx || !this.musicBus) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const o2 = this.ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = freq * 2.01;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.045);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (p) p.pan.value = pan;
    o.connect(g);
    const g2 = this.ctx.createGain();
    g2.gain.value = 0.3;
    o2.connect(g2);
    g2.connect(g);
    if (p) {
      g.connect(p);
      p.connect(this.musicBus);
    } else {
      g.connect(this.musicBus);
    }
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.1);
    o2.stop(t + dur + 0.1);
  }

  /* ---------- sfx ---------- */

  private blip(freq: number, gain: number, dur: number, type: OscType = 'sine', dest?: GainNode, glideTo?: number): void {
    if (!this.ctx || !this.sfxBus) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest ?? this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private puff(gain = 0.05, dur = 0.22, freq = 1600): void {
    if (!this.ctx || !this.sfxBus || !this.noiseBuf) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.sfxBus);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  tap(tier: number): void {
    this.blip(420 + tier * 55, 0.1, 0.16);
    this.puff(0.02, 0.08, 2400);
  }

  merge(tier: number, extras: number): void {
    const f = 460 + tier * 70;
    this.blip(f, 0.14, 1.0);
    this.blip(f * 2.76, 0.045, 0.9);
    this.puff(0.035, 0.3, 900);
    if (extras >= 1) this.blip(f * 1.5, 0.1, 1.1);
    if (extras >= 3) this.blip(f * 2, 0.09, 1.3);
    if (extras >= 1) this.musicBox(f * 2, 0.02, 2.2);
  }

  plant(): void {
    this.blip(640, 0.09, 0.4, 'sine', undefined, 320);
    this.puff(0.03, 0.35, 1200);
  }

  bloom(): void {
    const seq = ['C5', 'E5', 'G5', 'C6'];
    seq.forEach((n, i) => {
      window.setTimeout(() => this.musicBox(NOTE[n], 0.03, 2.4), i * 130);
    });
  }

  dew(): void {
    ['E5', 'G5', 'B5'].forEach((n, i) => {
      window.setTimeout(() => this.musicBox(NOTE[n], 0.028, 1.8), i * 110);
    });
  }

  creature(): void {
    this.blip(NOTE.F5, 0.08, 0.5);
    window.setTimeout(() => this.blip(NOTE.A5, 0.08, 0.7), 220);
  }

  storyLine(): void {
    this.blip(880, 0.025, 0.09);
  }

  goodnight(): void {
    const seq = ['C6', 'G5', 'E5'];
    seq.forEach((n, i) => {
      window.setTimeout(() => this.blip(NOTE[n], 0.07, 1.2), i * 420);
    });
  }

  uiTick(): void {
    this.blip(520, 0.04, 0.1);
  }

  /* ---------- lullaby ---------- */

  lullaby(on: boolean): void {
    if (on) {
      if (this.lullabyTimer !== null) return;
      this.lullabyStep = 0;
      this.playLullabyStep();
      this.lullabyTimer = window.setInterval(() => this.playLullabyStep(), 450);
    } else {
      if (this.lullabyTimer !== null) {
        window.clearInterval(this.lullabyTimer);
        this.lullabyTimer = null;
      }
    }
  }

  private playLullabyStep(): void {
    const step = LULLABY[this.lullabyStep % LULLABY.length];
    this.lullabyStep++;
    if (step) this.musicBox(NOTE[step], 0.03, 2.6, -0.15);
  }

  haptic(ms: number): void {
    if (this.haptics && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(ms);
      } catch {
        /* unsupported */
      }
    }
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }
}

export const audio = new AudioEngine();

export function haptic(ms: number): void {
  audio.haptic(ms);
}
