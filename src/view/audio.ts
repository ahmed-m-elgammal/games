// ─────────────────────────────────────────────────────────────────────────────
// VIEW / audio — all procedural WebAudio, zero asset files (spec §16).
// Default on; one always-visible mute control in the HUD. Reduced motion does
// not mute; mute does not reduce motion — independent controls.
// ─────────────────────────────────────────────────────────────────────────────

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambienceNodes: AudioNode[] = [];
  muted = false;

  constructor(private onMutedChange: (muted: boolean) => void) {}

  private ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
    this.onMutedChange(muted);
  }

  private noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02; // brown-ish
      data[i] = last * 3.5;
    }
    return buf;
  }

  // stamp: 90 Hz sine thump + lowpassed noise burst, 120 ms
  stamp(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.12);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    osc.connect(g).connect(this.master);
    osc.start(t); osc.stop(t + 0.14);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx, 0.15);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 900;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.5, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    src.connect(lp).connect(ng).connect(this.master);
    src.start(t);
  }

  // paper swish: bandpassed noise sweep 400→1200 Hz, 180 ms
  paper(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx, 0.2);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(1200, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t);
  }

  // ship bell: FM partials (1:2.7:5.4), 1.2 s decay
  bell(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const base = 520;
    [1, 2.7, 5.4].forEach((ratio, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.value = base * ratio;
      g.gain.setValueAtTime(0.28 / (i + 1), t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
      osc.connect(g).connect(this.master!);
      osc.start(t); osc.stop(t + 1.25);
    });
  }

  // strike: detuned minor-second dyad, 300 ms
  strike(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    [220, 233].forEach(f => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.16, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.connect(g).connect(this.master!);
      osc.start(t); osc.stop(t + 0.32);
    });
  }

  // ink bleed: highpassed hiss, 600 ms
  bleed(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx, 0.6);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 2600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.24, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    src.connect(hp).connect(g).connect(this.master);
    src.start(t);
  }

  // gull: two chirp envelopes, randomized pitch
  gull(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const base = 1700 + Math.random() * 500;
    [0, 0.22].forEach((off, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.setValueAtTime(base, t + off);
      osc.frequency.exponentialRampToValueAtTime(base * (i === 0 ? 1.35 : 0.8), t + off + 0.14);
      g.gain.setValueAtTime(0.001, t + off);
      g.gain.exponentialRampToValueAtTime(0.1, t + off + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + off + 0.16);
      osc.connect(g).connect(this.master!);
      osc.start(t + off); osc.stop(t + off + 0.2);
    });
  }

  // harbor ambience: looped brown noise through lowpass + water LFO on gain
  startAmbience(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master || this.ambienceNodes.length > 0) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx, 4);
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.value = 0.16;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.06;
    lfo.connect(lfoGain).connect(g.gain);
    src.connect(lp).connect(g).connect(this.master);
    src.start();
    lfo.start();
    this.ambienceNodes = [src, lp, g, lfo, lfoGain];
  }
}
