/* BackBeat — data + storage + schedule helpers
 *
 * Schema v5 (current):
 *   song.sections[i] = {
 *     id, name, color, subdivision?,
 *     phrases: [
 *       {
 *         id, name?,
 *         bars: number,           // bars per iteration
 *         repeat: number,         // how many times the phrase repeats
 *         fill?: {                // optional fill on LAST bar of each iteration
 *           onomatopoeiaIds: string[],   // rotates per iteration
 *           sayText?: string,            // TTS at start of fill bar
 *           singSyllables?: boolean,     // TTS joins the onoma's syllables
 *           muteClick?: boolean,         // silence metronome on fill bar
 *           leadBars?: number,           // visual countdown
 *         }
 *       }
 *     ],
 *     endCue?: { type, say, leadBars }   // transition voice/banner only
 *   }
 *   section.bars (legacy) is replaced by sum of phrase.bars * phrase.repeat.
 */
(function () {
  'use strict';

  const ONOMATOPOEIAS = [
    {
      id: 'taka', name: 'ta-ka-tum-pá', resolution: 16,
      hits: [
        { step: 0,  text: 'ta',  sound: 'tom1',  velocity: 0.9 },
        { step: 2,  text: 'ka',  sound: 'tom1',  velocity: 0.7 },
        { step: 4,  text: 'tum', sound: 'tom2',  velocity: 1.0 },
        { step: 8,  text: 'pa',  sound: 'snare', velocity: 0.85 },
        { step: 12, text: 'tum', sound: 'kick',  velocity: 1.0 },
        { step: 14, text: 'pá',  sound: 'snare', velocity: 1.0 },
      ],
    },
    {
      id: 'roll', name: 'redoble 16th', resolution: 16,
      hits: Array.from({ length: 16 }).map((_, i) => ({
        step: i,
        text: i % 4 === 0 ? 'TA' : 'ta',
        sound: 'snare',
        velocity: i % 4 === 0 ? 1.0 : 0.55,
      })),
    },
    {
      id: 'tripA', name: 'tum-pa-tá (tresillos)', resolution: 12,
      hits: [
        { step: 0,  text: 'tum', sound: 'kick',  velocity: 1.0 },
        { step: 4,  text: 'pa',  sound: 'tom1',  velocity: 0.7 },
        { step: 5,  text: 'tá',  sound: 'snare', velocity: 1.0 },
        { step: 8,  text: 'tum', sound: 'kick',  velocity: 0.95 },
        { step: 11, text: 'pá',  sound: 'snare', velocity: 1.0 },
      ],
    },
    {
      id: 'pumpum', name: 'pum-pum-pa', resolution: 16,
      hits: [
        { step: 0,  text: 'pum', sound: 'kick',  velocity: 1.0 },
        { step: 4,  text: 'pum', sound: 'kick',  velocity: 1.0 },
        { step: 8,  text: 'pa',  sound: 'snare', velocity: 1.0 },
      ],
    },
  ];

  function uid() { return 's_' + Math.random().toString(36).slice(2, 9); }

  const SONGS = [
    {
      id: 'smoke', title: 'Smoke on the Water', artist: 'Deep Purple',
      bpm: 112, beatsPerBar: 4, subdivision: 1,
      sections: [
        {
          id: 's1', name: 'Intro riff', color: 'orange',
          phrases: [{ id: 'p1', bars: 4, repeat: 1 }],
          endCue: { type: 'change', say: 'estrofa', leadBars: 2 },
        },
        {
          id: 's2', name: 'Estrofa', color: 'gold',
          phrases: [
            { id: 'p1', name: 'pregunta', bars: 4, repeat: 3,
              fill: { onomatopoeiaIds: ['taka'], sayText: '',
                      singSyllables: false, muteClick: true, leadBars: 1 } },
            { id: 'p2', name: 'respuesta', bars: 4, repeat: 1,
              fill: { onomatopoeiaIds: ['roll'], sayText: 'ataca',
                      singSyllables: false, muteClick: true, leadBars: 1 } },
          ],
          endCue: { type: 'change', say: 'estribillo', leadBars: 2 },
        },
        {
          id: 's3', name: 'Estribillo', color: 'coral', subdivision: 2,
          phrases: [
            { id: 'p1', bars: 8, repeat: 1,
              fill: { onomatopoeiaIds: ['taka'], sayText: '',
                      singSyllables: true, muteClick: true, leadBars: 1 } },
          ],
          endCue: { type: 'change', say: 'solo', leadBars: 2 },
        },
        {
          id: 's4', name: 'Solo', color: 'magenta', subdivision: 4,
          phrases: [
            { id: 'p1', bars: 8, repeat: 2,
              fill: { onomatopoeiaIds: ['pumpum', 'roll'], sayText: '',
                      singSyllables: false, muteClick: true, leadBars: 1 } },
          ],
          endCue: { type: 'change', say: 'outro', leadBars: 2 },
        },
        {
          id: 's5', name: 'Outro', color: 'lime',
          phrases: [{ id: 'p1', bars: 4, repeat: 1 }],
          endCue: { type: 'stop', say: 'para', leadBars: 1 },
        },
      ],
    },
    {
      id: 'seven', title: 'Seven Nation Army', artist: 'The White Stripes',
      bpm: 124, beatsPerBar: 4, subdivision: 1,
      sections: [
        { id: 's1', name: 'Intro', color: 'orange',
          phrases: [{ id: 'p1', bars: 8, repeat: 1 }],
          endCue: { type: 'change', say: 'estrofa', leadBars: 2 } },
        { id: 's2', name: 'Estrofa', color: 'gold', subdivision: 2,
          phrases: [
            { id: 'p1', bars: 4, repeat: 4,
              fill: { onomatopoeiaIds: ['pumpum'], sayText: '',
                      singSyllables: false, muteClick: true, leadBars: 1 } },
          ],
          endCue: { type: 'change', say: 'puente', leadBars: 2 } },
        { id: 's3', name: 'Puente', color: 'magenta',
          phrases: [{ id: 'p1', bars: 8, repeat: 1 }],
          endCue: { type: 'change', say: 'estribillo', leadBars: 2 } },
        { id: 's4', name: 'Estribillo', color: 'coral',
          phrases: [{ id: 'p1', bars: 16, repeat: 1 }],
          endCue: { type: 'stop', say: 'corta', leadBars: 1 } },
      ],
    },
    {
      id: 'beat', title: 'Practice — 100 BPM', artist: 'Rutina',
      bpm: 100, beatsPerBar: 4, subdivision: 2,
      sections: [
        { id: 's1', name: 'Calentamiento', color: 'orange', subdivision: 1,
          phrases: [{ id: 'p1', bars: 8, repeat: 1 }],
          endCue: { type: 'change', say: 'sube tempo', leadBars: 2 } },
        { id: 's2', name: 'Groove A', color: 'gold', subdivision: 2,
          phrases: [
            { id: 'p1', bars: 4, repeat: 4,
              fill: { onomatopoeiaIds: ['tripA'], sayText: 'fill',
                      singSyllables: false, muteClick: true, leadBars: 1 } },
          ],
          endCue: { type: 'change', say: 'groove b', leadBars: 2 } },
        { id: 's3', name: 'Groove B', color: 'coral', subdivision: 4,
          phrases: [
            { id: 'p1', bars: 4, repeat: 4,
              fill: { onomatopoeiaIds: ['taka', 'roll'], sayText: '',
                      singSyllables: false, muteClick: true, leadBars: 1 } },
          ],
          endCue: { type: 'stop', say: 'fin', leadBars: 1 } },
      ],
    },
  ];

  const KEY_SONGS = 'backbeat.songs.v5';
  const KEY_ONOMA = 'backbeat.onoma.v5';

  function cueOnomaIds(cue) {
    if (!cue) return [];
    if (Array.isArray(cue.onomatopoeiaIds)) return cue.onomatopoeiaIds.filter(Boolean);
    if (cue.onomatopoeiaId) return [cue.onomatopoeiaId];
    return [];
  }

  /** Migrate a legacy section (v3/v4 schema with `bars` + optional `phrase`)
   *  into the v5 schema with `phrases`. */
  function migrateSection(s) {
    if (s.phrases) return s;
    const phrases = [];
    const sb = s.bars || 4;
    if (s.phrase) {
      const phraseBars = s.phrase.bars;
      const fullReps = Math.floor(sb / phraseBars);
      const remainder = sb % phraseBars;
      if (fullReps > 0) {
        const oldCue = s.phrase.cue || {};
        const fillIds = cueOnomaIds(oldCue);
        phrases.push({
          id: uid(),
          bars: phraseBars,
          repeat: fullReps,
          fill: (fillIds.length || oldCue.say) ? {
            onomatopoeiaIds: fillIds,
            sayText: oldCue.say || '',
            singSyllables: false,
            muteClick: true,
            leadBars: oldCue.leadBars || 1,
          } : undefined,
        });
      }
      if (remainder > 0) phrases.push({ id: uid(), bars: remainder, repeat: 1 });
    } else {
      phrases.push({ id: uid(), bars: sb, repeat: 1 });
    }
    // Legacy endCue with onomatopoeiaIds → merge into last phrase's fill.
    const endIds = cueOnomaIds(s.endCue);
    if (endIds.length > 0 && phrases.length) {
      const last = phrases[phrases.length - 1];
      const existing = last.fill?.onomatopoeiaIds || [];
      last.fill = {
        ...(last.fill || { singSyllables: false, muteClick: true, leadBars: 1 }),
        onomatopoeiaIds: Array.from(new Set([...existing, ...endIds])),
      };
    }
    return {
      id: s.id, name: s.name, color: s.color, subdivision: s.subdivision,
      phrases,
      endCue: s.endCue ? {
        type: s.endCue.type || 'change',
        say: s.endCue.say || '',
        leadBars: s.endCue.leadBars || 2,
      } : undefined,
    };
  }
  function migrateSong(s) {
    if (!s || !s.sections) return s;
    return { ...s, sections: s.sections.map(migrateSection) };
  }

  function loadSongs() {
    try {
      const raw = localStorage.getItem(KEY_SONGS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed.map(migrateSong);
      }
      // Try migrating from any previous version
      for (const key of ['backbeat.songs.v4', 'backbeat.songs.v3', 'backbeat.songs.v2', 'backbeat.songs.v1']) {
        const v = localStorage.getItem(key);
        if (v) {
          try {
            const parsed = JSON.parse(v);
            if (Array.isArray(parsed) && parsed.length) return parsed.map(migrateSong);
          } catch (e) {}
        }
      }
      return SONGS.slice();
    } catch (e) { return SONGS.slice(); }
  }
  function saveSongs(songs) {
    try { localStorage.setItem(KEY_SONGS, JSON.stringify(songs)); } catch (e) {}
  }

  // Legacy drum-sound IDs ("tom-hi" / "tom-low") get rewritten on load to
  // the new kit naming, so existing patterns render their hits on the right
  // editor row.
  const SOUND_ALIASES = { 'tom-hi': 'tom1', 'tom-low': 'tom2' };
  function migrateGroove(p) {
    if (!p || !Array.isArray(p.hits)) return p;
    let changed = false;
    const hits = p.hits.map((h) => {
      const renamed = SOUND_ALIASES[h.sound];
      if (renamed) { changed = true; return { ...h, sound: renamed }; }
      return h;
    });
    return changed ? { ...p, hits } : p;
  }
  function loadOnoma() {
    try {
      const raw = localStorage.getItem(KEY_ONOMA);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.map(migrateGroove);
      }
      for (const key of ['backbeat.onoma.v4', 'backbeat.onoma.v3', 'backbeat.onoma.v2']) {
        const v = localStorage.getItem(key);
        if (v) {
          try {
            const p = JSON.parse(v);
            if (Array.isArray(p)) return p.map(migrateGroove);
          } catch (e) {}
        }
      }
      return ONOMATOPOEIAS.slice();
    } catch (e) { return ONOMATOPOEIAS.slice(); }
  }
  function saveOnoma(items) {
    try { localStorage.setItem(KEY_ONOMA, JSON.stringify(items)); } catch (e) {}
  }

  function sectionBars(s) {
    if (!s) return 0;
    if (s.phrases) return s.phrases.reduce((n, p) => n + p.bars * p.repeat, 0);
    return s.bars || 0;
  }
  function totalBars(song) {
    return song.sections.reduce((n, s) => n + sectionBars(s), 0);
  }

  function locate(song, totalBarIdx) {
    let acc = 0;
    for (let i = 0; i < song.sections.length; i++) {
      const sb = sectionBars(song.sections[i]);
      if (totalBarIdx < acc + sb) return { sectionIdx: i, barInSection: totalBarIdx - acc };
      acc += sb;
    }
    return { sectionIdx: song.sections.length - 1, barInSection: 0 };
  }
  function sectionStartBar(song, sectionIdx) {
    let acc = 0;
    for (let i = 0; i < sectionIdx; i++) acc += sectionBars(song.sections[i]);
    return acc;
  }

  /** Build a flat per-bar schedule. Each entry describes one bar of the song. */
  function buildSchedule(song) {
    const arr = [];
    song.sections.forEach((s, sIdx) => {
      let barInSection = 0;
      const phrases = s.phrases || [{ id: 'legacy', bars: s.bars || 0, repeat: 1 }];
      phrases.forEach((p, pIdx) => {
        for (let iter = 0; iter < p.repeat; iter++) {
          for (let b = 0; b < p.bars; b++) {
            const isFillBar = (b === p.bars - 1) && !!p.fill;
            arr.push({
              sectionIdx: sIdx,
              barInSection: barInSection++,
              phraseIdx: pIdx,
              phraseId: p.id,
              iterationIdx: iter,
              iterationCount: p.repeat,
              barInIteration: b,
              iterationBars: p.bars,
              isFillBar,
              fill: isFillBar ? p.fill : null,
              // For the cue zone (leadBars before fill)
              fillLeadActive: !!p.fill
                && (b >= p.bars - (p.fill.leadBars || 1)),
              fillBarsLeft: !p.fill ? -1 : (p.bars - 1 - b),
            });
          }
        }
      });
    });
    return arr;
  }

  function blankFill() {
    return {
      onomatopoeiaIds: [], sayText: '',
      singSyllables: false, muteClick: true, leadBars: 1,
    };
  }
  function blankPhrase() {
    return { id: uid(), bars: 4, repeat: 4 };
  }
  function blankSong() {
    return {
      id: uid(), title: 'Nueva canción', artist: '',
      bpm: 100, beatsPerBar: 4, subdivision: 1,
      sections: [
        { id: uid(), name: 'Intro', color: 'orange',
          phrases: [{ id: uid(), bars: 4, repeat: 1 }],
          endCue: { type: 'change', say: 'estrofa', leadBars: 2 } },
      ],
    };
  }
  function blankOnoma() {
    return { id: uid(), name: 'Nuevo patrón', resolution: 16, hits: [] };
  }

  /** Deep clone with regenerated ids (for duplicate). */
  function cloneWithIds(obj) {
    const copy = JSON.parse(JSON.stringify(obj));
    copy.id = uid();
    if (copy.sections) copy.sections.forEach((s) => {
      s.id = uid();
      if (s.phrases) s.phrases.forEach((p) => { p.id = uid(); });
    });
    if (copy.phrases) copy.phrases.forEach((p) => { p.id = uid(); });
    return copy;
  }

  const COLORS = {
    orange:  { ink: '#fb923c', tint: 'rgba(251,146,60,.14)',  border: 'rgba(251,146,60,.4)' },
    coral:   { ink: '#fb7185', tint: 'rgba(251,113,133,.14)', border: 'rgba(251,113,133,.4)' },
    gold:    { ink: '#fbbf24', tint: 'rgba(251,191,36,.14)',  border: 'rgba(251,191,36,.4)' },
    magenta: { ink: '#f472b6', tint: 'rgba(244,114,182,.14)', border: 'rgba(244,114,182,.4)' },
    lime:    { ink: '#a3e635', tint: 'rgba(163,230,53,.14)',  border: 'rgba(163,230,53,.4)' },
    violet:  { ink: '#c084fc', tint: 'rgba(192,132,252,.14)', border: 'rgba(192,132,252,.4)' },
  };
  function getColor(key) { return COLORS[key] || COLORS.orange; }

  window.BBData = {
    loadSongs, saveSongs, loadOnoma, saveOnoma,
    uid, blankSong, blankOnoma, blankPhrase, blankFill,
    cloneWithIds,
    sectionBars, totalBars, locate, sectionStartBar, buildSchedule,
    cueOnomaIds,
    COLORS, getColor, SAMPLE: SONGS, SAMPLE_ONOMA: ONOMATOPOEIAS,
  };
})();
