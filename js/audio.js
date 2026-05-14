// Web Audio metronome engine.
// Uses the lookahead-scheduler pattern: a setInterval refills a queue of
// notes scheduled at exact AudioContext timestamps, so timing is not
// affected by JS event-loop jitter.

(function (global) {
  'use strict';

  const LOOKAHEAD_MS = 25;         // how often the scheduler runs
  const SCHEDULE_AHEAD_S = 0.1;    // how far ahead notes are queued

  class Metronome {
    constructor() {
      this.ctx = null;
      this.bpm = 100;
      this.beatsPerBar = 4;
      this.isRunning = false;
      this.currentBeat = 0;           // 0-based, within bar
      this.nextNoteTime = 0;          // AudioContext time of next beat
      this.schedulerTimer = null;
      this.notesInQueue = [];         // {beat, time, accent}
      this.onBeat = null;             // callback({beat, beatsPerBar, accent, time})
    }

    setBpm(bpm) {
      this.bpm = Math.max(20, Math.min(300, Number(bpm) || 100));
    }

    setBeatsPerBar(n) {
      this.beatsPerBar = Math.max(1, Math.min(16, Number(n) || 4));
    }

    async start() {
      if (this.isRunning) return;
      if (!this.ctx) {
        const AC = global.AudioContext || global.webkitAudioContext;
        this.ctx = new AC();
      }
      if (this.ctx.state === 'suspended') await this.ctx.resume();

      this.currentBeat = 0;
      this.nextNoteTime = this.ctx.currentTime + 0.05;
      this.isRunning = true;
      this._scheduler();
      this.schedulerTimer = setInterval(() => this._scheduler(), LOOKAHEAD_MS);
    }

    stop() {
      this.isRunning = false;
      if (this.schedulerTimer) {
        clearInterval(this.schedulerTimer);
        this.schedulerTimer = null;
      }
      this.notesInQueue = [];
    }

    toggle() {
      return this.isRunning ? (this.stop(), false) : (this.start(), true);
    }

    _scheduler() {
      while (this.nextNoteTime < this.ctx.currentTime + SCHEDULE_AHEAD_S) {
        const accent = this.currentBeat === 0 ? 'down' : 'normal';
        this._scheduleClick(this.nextNoteTime, accent);
        this.notesInQueue.push({
          beat: this.currentBeat,
          time: this.nextNoteTime,
          accent,
        });
        this._advance();
      }
      this._flushPastBeats();
    }

    _advance() {
      const secondsPerBeat = 60.0 / this.bpm;
      this.nextNoteTime += secondsPerBeat;
      this.currentBeat = (this.currentBeat + 1) % this.beatsPerBar;
    }

    _scheduleClick(time, accent) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // Downbeat: brighter and slightly louder.
      osc.frequency.value = accent === 'down' ? 1500 : 900;
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(accent === 'down' ? 0.5 : 0.35, time + 0.001);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);

      osc.connect(gain).connect(ctx.destination);
      osc.start(time);
      osc.stop(time + 0.06);
    }

    // Fire onBeat callback as queued beats reach the present, so visuals
    // stay in sync with the audio.
    _flushPastBeats() {
      if (!this.onBeat) return;
      const now = this.ctx.currentTime;
      while (this.notesInQueue.length && this.notesInQueue[0].time <= now) {
        const note = this.notesInQueue.shift();
        this.onBeat({
          beat: note.beat,
          beatsPerBar: this.beatsPerBar,
          accent: note.accent,
          time: note.time,
        });
      }
    }
  }

  global.BackBeat = global.BackBeat || {};
  global.BackBeat.Metronome = Metronome;
})(window);
