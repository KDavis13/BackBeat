/* BackBeat — metronome engine
 * Web Audio scheduler with look-ahead. Emits beat events to subscribers.
 *
 * Why not setInterval / setTimeout? They drift and stutter on mobile when the
 * tab is busy. Pattern from chris wilson's classic article: a lookahead worker
 * enqueues clicks ~25ms ahead on the audio context timeline, and we publish
 * "beat" events keyed to those audio times.
 *
 * The scheduler emits one event per SUBDIVISION (not per quarter-note beat).
 * Subdivision = 1 → one event per beat (quarter notes).
 *              = 2 → two events per beat (eighth notes).
 *              = 3 → triplets.
 *              = 4 → sixteenth notes.
 * Subscribers receive { type: 'beat', beat, sub, subOfBeat, accent, accentStrong, time }
 * where `beat` is the quarter-note beat index and `sub` is the subdivision index
 * within that beat (0 = downbeat).
 */

(function () {
  'use strict';

  class Metronome {
    constructor() {
      this.ctx = null;
      this.bpm = 100;
      this.beatsPerBar = 4;
      this.subdivision = 1;           // 1, 2, 3, 4
      this.running = false;
      this.nextTime = 0;              // AudioContext time of next sub-event
      this.subIndex = 0;              // absolute sub-event index since start
      this.lookahead = 25;            // ms
      this.scheduleAhead = 0.12;      // seconds
      this.subscribers = new Set();
      this._tickId = null;
      this._queue = [];               // events scheduled but not yet fired to subs
      this._accentBeats = new Set();  // quarter-beat indices that should accent
      this._silent = false;
      this._subVolume = 0.55;         // weak subdivisions are quieter
    }

    async init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }

    setBpm(bpm) { this.bpm = Math.max(20, Math.min(300, Number(bpm) || 100)); }
    setBeatsPerBar(n) { this.beatsPerBar = Math.max(1, Math.min(16, Number(n) || 4)); }
    setSubdivision(s) { this.subdivision = [1,2,3,4].includes(Number(s)) ? Number(s) : 1; }
    setSilent(v) { this._silent = !!v; }
    setAccentBeats(indices) { this._accentBeats = new Set(indices || []); }

    subscribe(fn) { this.subscribers.add(fn); return () => this.subscribers.delete(fn); }
    _emit(payload) {
      this.subscribers.forEach((fn) => { try { fn(payload); } catch (e) {} });
    }

    async start({ bpm, beatsPerBar, subdivision, startBeat = 0 } = {}) {
      await this.init();
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      if (bpm) this.setBpm(bpm);
      if (beatsPerBar) this.setBeatsPerBar(beatsPerBar);
      if (subdivision) this.setSubdivision(subdivision);
      // startBeat = absolute quarter-note beat index to begin at.
      this.subIndex = startBeat * this.subdivision;
      this.nextTime = this.ctx.currentTime + 0.05;
      this.running = true;
      this._queue = [];
      this._tick();
    }

    stop() {
      this.running = false;
      if (this._tickId) { clearTimeout(this._tickId); this._tickId = null; }
      this._queue = [];
    }

    _subDuration() { return 60.0 / this.bpm / this.subdivision; }

    /** Schedule any sub-events due within the lookahead window. */
    _tick() {
      if (!this.running) return;
      while (this.nextTime < this.ctx.currentTime + this.scheduleAhead) {
        const t = this.nextTime;
        const sub = this.subIndex;
        const subOfBeat = sub % this.subdivision;
        const beat = Math.floor(sub / this.subdivision);
        const isDownbeat = subOfBeat === 0;
        const isQuarter = isDownbeat;
        const accent = isDownbeat && (this._accentBeats.has(beat) || (beat % this.beatsPerBar === 0));
        const accentStrong = isDownbeat && this._accentBeats.has(beat);
        if (!this._silent) this._click(t, { isQuarter, accent, accentStrong, subOfBeat });
        this._queue.push({ time: t, beat, sub, subOfBeat, accent, accentStrong, isQuarter });
        this.subIndex++;
        this.nextTime += this._subDuration();
      }
      const now = this.ctx.currentTime;
      while (this._queue.length && this._queue[0].time <= now) {
        const ev = this._queue.shift();
        this._emit({ type: 'beat', ...ev, now });
      }
      this._tickId = setTimeout(() => this._tick(), this.lookahead);
    }

    _click(when, { isQuarter, accent, accentStrong, subOfBeat }) {
      const ctx = this.ctx;
      const dur = 0.04;

      // Tone — louder on quarter, softer on subdivisions
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      // Pitch hierarchy:
      //  strong-accent > regular-accent > downbeat-of-bar > weak-subdivision
      osc.frequency.value = accentStrong ? 2000 : accent ? 1500 :
                            isQuarter ? 1000 : 700;
      const base = isQuarter ? (accentStrong ? 0.75 : accent ? 0.6 : 0.4)
                             : (0.12 + 0.04 * (this.subdivision === 3 ? (subOfBeat === 1 ? 0.5 : 1) : 1));
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(base, when + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      osc.connect(gain).connect(this.master);
      osc.start(when);
      osc.stop(when + dur + 0.02);

      // Noise transient — only on quarter-note beats; subdivisions are pure tone
      if (isQuarter) {
        const src = ctx.createBufferSource();
        src.buffer = this._noiseBuffer();
        const filt = ctx.createBiquadFilter();
        filt.type = 'highpass';
        filt.frequency.value = accentStrong ? 4500 : accent ? 3200 : 2400;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.001, when);
        ng.gain.exponentialRampToValueAtTime(accentStrong ? 0.28 : 0.16, when + 0.001);
        ng.gain.exponentialRampToValueAtTime(0.0001, when + 0.025);
        src.connect(filt).connect(ng).connect(this.master);
        src.start(when);
        src.stop(when + 0.05);
      }
    }

    _noiseBuffer() {
      if (this._noise) return this._noise;
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.3, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this._noise = buf;
      return buf;
    }

    /** TTS through the browser's speechSynthesis API. */
    say(text, { rate = 1.1, lang = 'es-ES' } = {}) {
      if (!('speechSynthesis' in window)) return;
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = lang; u.rate = rate; u.pitch = 1; u.volume = 1;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      } catch (e) {}
    }

    /** Schedule a single percussion hit at audio time `when`.
     * sound ∈ "kick" | "snare" | "tom-hi" | "tom-low" | "hat" | "click"
     * Returns the AudioContext time of the hit (for sync). */
    schedulePerc(when, sound = 'snare', velocity = 1) {
      this.init().then(() => {
        const ctx = this.ctx;
        const t = Math.max(when, ctx.currentTime + 0.005);
        const v = Math.max(0.05, Math.min(1, velocity));
        if (sound === 'kick')      this._synthKick(t, v);
        else if (sound === 'snare') this._synthSnare(t, v);
        else if (sound === 'tom-hi') this._synthTom(t, v, 280);
        else if (sound === 'tom-low') this._synthTom(t, v, 140);
        else if (sound === 'hat')   this._synthHat(t, v);
        else                        this._click(t, { isQuarter: true, accent: false, accentStrong: false, subOfBeat: 0 });
      });
      return when;
    }

    _synthKick(t, v) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.exponentialRampToValueAtTime(45, t + 0.08);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(v * 0.9, t + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      osc.connect(gain).connect(this.master);
      osc.start(t); osc.stop(t + 0.3);
    }
    _synthSnare(t, v) {
      const ctx = this.ctx;
      // tone body
      const osc = ctx.createOscillator();
      const og = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(150, t + 0.08);
      og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(v * 0.4, t + 0.003);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      osc.connect(og).connect(this.master);
      osc.start(t); osc.stop(t + 0.15);
      // noise
      const src = ctx.createBufferSource();
      src.buffer = this._noiseBuffer();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 0.7;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.exponentialRampToValueAtTime(v * 0.6, t + 0.002);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      src.connect(bp).connect(ng).connect(this.master);
      src.start(t); src.stop(t + 0.2);
    }
    _synthTom(t, v, freq) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.55, t + 0.15);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(v * 0.7, t + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      osc.connect(gain).connect(this.master);
      osc.start(t); osc.stop(t + 0.35);
    }
    _synthHat(t, v) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this._noiseBuffer();
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 7000;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(v * 0.35, t + 0.001);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      src.connect(hp).connect(gain).connect(this.master);
      src.start(t); src.stop(t + 0.08);
    }
  }

  window.Metronome = Metronome;
})();
