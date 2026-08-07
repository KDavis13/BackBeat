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
    // Demo: rhythmic ladder — 6 bars of 4/4, each bar a different subdivision
    // (negras, corcheas, tresillos, semicorcheas, seisillos, fusas). A groove
    // is a single looping "bar", so the 6 bars live as one 24-beat groove
    // (6 × 4 beats). Snare (caja) plays every subdivision; kick marks every beat.
    {
      id: 'ladder', name: 'Escalera 4/4 · 6 compases (demo)',
      beatsPerBar: 24,
      beatSubdivisions: [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 6, 6, 6, 6, 8, 8, 8, 8],
      resolution: 96,
      hits: (function () {
        const barSubs = [1, 2, 3, 4, 6, 8];
        const names = ['negras', 'corcheas', 'tresillos', 'semis', 'seisillos', 'fusas'];
        const out = [];
        let idx = 0;
        barSubs.forEach((s, bar) => {
          for (let bt = 0; bt < 4; bt++) {
            const start = idx;
            for (let i = 0; i < s; i++) {
              out.push({ step: idx, sound: 'snare', velocity: 0.8, text: (bt === 0 && i === 0) ? names[bar] : '' });
              idx++;
            }
            out.push({ step: start, sound: 'kick', velocity: bt === 0 ? 1.0 : 0.9, text: '' });
          }
        });
        return out;
      })(),
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
  // Groove schema v2: per-beat subdivisions. `beatsPerBar` and
  // `beatSubdivisions` replace the implicit uniform `resolution`.
  //   beatSubdivisions[i] ∈ {1, 2, 3, 4, 6} — quarter / 8th / triplet /
  //   16th / sextuplet. Fine grid uses lcm(1..6) = 12.
  // `hits[i].step` stays as a linear cell index 0..sum(beatSubdivisions)-1.
  const GROOVE_FINE_RES = 12;
  // Allowed per-beat subdivisions. Anything in 1..9 is supported by the
  // schedule-on-downbeat + rAF playback path (see onoma.jsx / practice.jsx).
  const GROOVE_SUBS_ALLOWED = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  function migrateGrooveShape(p) {
    if (!p || !Array.isArray(p.hits)) return p;
    if (Array.isArray(p.beatSubdivisions) && p.beatSubdivisions.length > 0) return p;
    const beatsPerBar = p.beatsPerBar || 4;
    const r = p.resolution || 16;
    const subsPerBeat = Math.max(1, Math.round(r / beatsPerBar));
    return {
      ...p,
      beatsPerBar,
      beatSubdivisions: Array.from({ length: beatsPerBar }, () => subsPerBeat),
    };
  }
  function migrateGroove(p) {
    if (!p || !Array.isArray(p.hits)) return p;
    let changed = false;
    const hits = p.hits.map((h) => {
      const renamed = SOUND_ALIASES[h.sound];
      if (renamed) { changed = true; return { ...h, sound: renamed }; }
      return h;
    });
    const sounded = changed ? { ...p, hits } : p;
    return migrateGrooveShape(sounded);
  }

  // ── Groove helpers (per-beat subdivisions) ──────────────────────────
  function grooveBeatsPerBar(g) { return (g && g.beatsPerBar) || 4; }
  function grooveBeatSubs(g) {
    if (g && Array.isArray(g.beatSubdivisions) && g.beatSubdivisions.length > 0) return g.beatSubdivisions;
    const bpb = grooveBeatsPerBar(g);
    const r = (g && g.resolution) || 16;
    const each = Math.max(1, Math.round(r / bpb));
    return Array.from({ length: bpb }, () => each);
  }
  function grooveTotalCells(g) {
    return grooveBeatSubs(g).reduce((a, b) => a + b, 0);
  }
  /** {beat, subInBeat} for a flat cell index. */
  function grooveCellPosition(g, cellIdx) {
    const subs = grooveBeatSubs(g);
    let cum = 0;
    for (let b = 0; b < subs.length; b++) {
      if (cum + subs[b] > cellIdx) return { beat: b, subInBeat: cellIdx - cum };
      cum += subs[b];
    }
    return { beat: subs.length - 1, subInBeat: subs[subs.length - 1] - 1 };
  }
  /** Fraction of the groove's bar (0..1) where this cell lives. */
  function grooveOffsetInBar(g, cellIdx) {
    const subs = grooveBeatSubs(g);
    const bpb = subs.length;
    const pos = grooveCellPosition(g, cellIdx);
    const beatFraction = 1 / bpb;
    const subDen = Math.max(1, subs[pos.beat]);
    return pos.beat * beatFraction + (pos.subInBeat / subDen) * beatFraction;
  }
  /** Fine step (0..fineRes*beatsPerBar) inside the bar where this cell
   *  falls. `fineRes` should be divisible by every entry of beatSubdivisions
   *  for this to be exact. With fineRes=12 it's exact for {1,2,3,4,6}. */
  function grooveFineStepForCell(g, cellIdx, fineRes) {
    const subs = grooveBeatSubs(g);
    const pos = grooveCellPosition(g, cellIdx);
    return pos.beat * fineRes
      + Math.round((pos.subInBeat / Math.max(1, subs[pos.beat])) * fineRes);
  }
  /** Reverse lookup from a 0..1 fraction of the bar to the cell that owns
   *  it. Used by the rAF viz: works for any subdivisions, no fine grid. */
  function grooveCellAtFraction(g, fraction) {
    const subs = grooveBeatSubs(g);
    const bpb = subs.length;
    let f = Number.isFinite(fraction) ? fraction : 0;
    if (f < 0) f = 0;
    if (f >= 1) f = ((f % 1) + 1) % 1;
    const beatIdx = Math.min(bpb - 1, Math.floor(f * bpb));
    const beatFraction = 1 / bpb;
    const local = (f - beatIdx * beatFraction) / beatFraction;
    const n = Math.max(1, subs[beatIdx]);
    const subInBeat = Math.min(n - 1, Math.max(0, Math.floor(local * n)));
    let acc = 0;
    for (let i = 0; i < beatIdx; i++) acc += subs[i];
    return acc + subInBeat;
  }
  /** Reverse lookup: which cellIdx (if any) starts at this fine step.
   *  Only exact for subdivisions that divide `fineRes` evenly — kept for
   *  back-compat with the {1,2,3,4,6} fast path. */
  function grooveCellAtFineStep(g, fineStep, fineRes) {
    const subs = grooveBeatSubs(g);
    if (fineStep < 0 || fineStep >= fineRes * subs.length) return -1;
    const beatIdx = Math.floor(fineStep / fineRes);
    const fineInBeat = fineStep % fineRes;
    const n = Math.max(1, subs[beatIdx]);
    const cellWidth = fineRes / n;
    if (Math.abs(fineInBeat / cellWidth - Math.round(fineInBeat / cellWidth)) > 0.001) return -1;
    const subInBeat = Math.round(fineInBeat / cellWidth);
    if (subInBeat >= n) return -1;
    let acc = 0;
    for (let i = 0; i < beatIdx; i++) acc += subs[i];
    return acc + subInBeat;
  }
  // One-time injection of newly-shipped demo grooves, even for devices that
  // already have a stored onoma list. Guarded by a per-seed flag so it runs
  // once and does NOT come back if the user later deletes the groove.
  // v2 = ladder now uses snare (caja) instead of hi-hat. Bumping the flag makes
  // this run once more on devices that already have the old hi-hat version and
  // REPLACE it with the fresh seed (also injects it if missing).
  const SEED_FLAG = 'backbeat.seed.ladder.v2';
  function ensureSeedGrooves(list) {
    try {
      if (localStorage.getItem(SEED_FLAG)) return list;
      localStorage.setItem(SEED_FLAG, '1');
      const seed = ONOMATOPOEIAS.find((g) => g.id === 'ladder');
      if (!seed) return list;
      const fresh = JSON.parse(JSON.stringify(seed));
      if (list.some((g) => g && g.id === 'ladder')) {
        return list.map((g) => (g && g.id === 'ladder') ? fresh : g);
      }
      return [fresh, ...list];
    } catch (e) {}
    return list;
  }
  function loadOnoma() {
    try {
      const raw = localStorage.getItem(KEY_ONOMA);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return ensureSeedGrooves(parsed.map(migrateGroove));
      }
      for (const key of ['backbeat.onoma.v4', 'backbeat.onoma.v3', 'backbeat.onoma.v2']) {
        const v = localStorage.getItem(key);
        if (v) {
          try {
            const p = JSON.parse(v);
            if (Array.isArray(p)) return ensureSeedGrooves(p.map(migrateGroove));
          } catch (e) {}
        }
      }
      return ONOMATOPOEIAS.slice();
    } catch (e) { return ONOMATOPOEIAS.slice(); }
  }
  function saveOnoma(items) {
    try { localStorage.setItem(KEY_ONOMA, JSON.stringify(items)); } catch (e) {}
  }

  // ── Groove folders ──────────────────────────────────────────────────
  // folders = [{ id, name, color, grooveIds: string[] }]. A groove lives in
  // at most one folder; grooves in none show under a virtual "Sin clasificar"
  // view (not stored). Older data simply has no folders → all unclassified.
  const KEY_FOLDERS = 'backbeat.folders.v1';
  const FOLDER_COLOR_CYCLE = ['gold', 'coral', 'lime', 'violet', 'teal', 'magenta', 'orange'];

  function loadFolders() {
    try {
      const raw = localStorage.getItem(KEY_FOLDERS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.map((f) => ({
            id: f.id || uid(), name: f.name || 'Carpeta',
            color: f.color || 'orange',
            grooveIds: Array.isArray(f.grooveIds) ? f.grooveIds.filter(Boolean) : [],
          }));
        }
      }
    } catch (e) {}
    return [];
  }
  function saveFolders(folders) {
    try { localStorage.setItem(KEY_FOLDERS, JSON.stringify(folders)); } catch (e) {}
  }
  function blankFolder(folders) {
    const i = Array.isArray(folders) ? folders.length : 0;
    return {
      id: uid(), name: 'Nueva carpeta',
      color: FOLDER_COLOR_CYCLE[i % FOLDER_COLOR_CYCLE.length],
      grooveIds: [],
    };
  }
  /** Folder id that owns this groove, or null. */
  function folderOf(folders, grooveId) {
    if (!Array.isArray(folders)) return null;
    const f = folders.find((x) => (x.grooveIds || []).includes(grooveId));
    return f ? f.id : null;
  }
  /** Grooves not assigned to any folder. */
  function unclassified(folders, grooves) {
    if (!Array.isArray(grooves)) return [];
    const assigned = new Set();
    (folders || []).forEach((f) => (f.grooveIds || []).forEach((id) => assigned.add(id)));
    return grooves.filter((g) => !assigned.has(g.id));
  }

  // ── Per-voice groove model (designer) ──────────────────────────────
  // A groove gains an optional `voices[]` layer for the redesigned designer:
  //   voice = { id, sound, label, color, cymbal,
  //             structure:[ {sub:N} | {halves:[{sub},{sub}]} ],  // len = beatsPerBar
  //             lit:[cellIdx…], arts:{[idx]:art}, syll:{[idx]:text} }
  // The flat legacy shape (beatSubdivisions/hits) is DERIVED from voices on
  // every save, so player.jsx + practice.jsx keep working unchanged.
  const KIT_VOICES = [
    { id: 'crash', sound: 'crash', label: 'Crash',  color: 'teal',    cymbal: true },
    { id: 'hat',   sound: 'hat',   label: 'Hi-hat', color: 'lime',    cymbal: true },
    { id: 'ride',  sound: 'ride',  label: 'Ride',   color: 'teal',    cymbal: true },
    { id: 'tom1',  sound: 'tom1',  label: 'Tom 1',  color: 'violet',  cymbal: false },
    { id: 'tom2',  sound: 'tom2',  label: 'Tom 2',  color: 'magenta', cymbal: false },
    { id: 'tom3',  sound: 'tom3',  label: 'Tom 3',  color: 'coral',   cymbal: false },
    { id: 'snare', sound: 'snare', label: 'Caja',   color: 'gold',    cymbal: false },
    { id: 'kick',  sound: 'kick',  label: 'Bombo',  color: 'orange',  cymbal: false },
  ];
  const KIT_ORDER = KIT_VOICES.map((v) => v.id);
  const ART_VELOCITY = { normal: .85, accent: 1.0, ghost: .4, closed: .85, open: .9, foot: .5 };
  const SWING_AMOUNT = { straight: 0, medium: .3, shuffle: .6 };

  function kitVoiceDef(id) {
    return KIT_VOICES.find((v) => v.id === id || v.sound === id)
      || { id, sound: id, label: id, color: 'orange', cymbal: false };
  }
  function _gcd(a, b) { return b ? _gcd(b, a % b) : a; }
  function _lcm(a, b) { return a && b ? Math.abs(a * b) / _gcd(a, b) : (a || b); }

  function beatCellCount(beat) {
    if (beat && beat.halves) return beat.halves.reduce((n, h) => n + (h.sub || 1), 0);
    return (beat && beat.sub) || 1;
  }
  function voiceCellCount(voice) {
    return (voice.structure || []).reduce((n, b) => n + beatCellCount(b), 0);
  }
  /** {beat, fwb} (fraction within the beat, 0..1) for a voice cell index. */
  function cellPlacement(voice, idx) {
    const st = voice.structure || [];
    let k = 0;
    for (let b = 0; b < st.length; b++) {
      const beat = st[b];
      if (beat && beat.halves) {
        const [h0, h1] = beat.halves;
        const a = h0.sub || 1, c = h1.sub || 1;
        for (let i = 0; i < a; i++, k++) if (k === idx) return { beat: b, fwb: (i / a) * 0.5 };
        for (let j = 0; j < c; j++, k++) if (k === idx) return { beat: b, fwb: 0.5 + (j / c) * 0.5 };
      } else {
        const n = (beat && beat.sub) || 1;
        for (let i = 0; i < n; i++, k++) if (k === idx) return { beat: b, fwb: i / n };
      }
    }
    return { beat: Math.max(0, st.length - 1), fwb: 0 };
  }
  /** Fraction of the bar (0..1) where a voice cell falls. */
  function voiceCellFraction(voice, beatsPerBar, idx) {
    const bpb = beatsPerBar || (voice.structure || []).length || 4;
    const { beat, fwb } = cellPlacement(voice, idx);
    return (beat + fwb) / bpb;
  }
  /** Effective subdivision denominators a beat contributes to the legacy grid. */
  function beatDenoms(beat) {
    if (beat && beat.halves) return beat.halves.map((h) => 2 * (h.sub || 1));
    return [(beat && beat.sub) || 1];
  }

  /** Build the per-voice layer from a legacy groove (one voice per sound). */
  function grooveToVoices(g) {
    const bpb = grooveBeatsPerBar(g);
    const sig = g.sig || (bpb + '/4');
    const swing = g.swing || 'straight';
    if (Array.isArray(g.voices) && g.voices.length) {
      const voices = g.voices.map((v) => ({
        ...kitVoiceDef(v.id || v.sound), ...v,
        structure: Array.isArray(v.structure) && v.structure.length ? v.structure
          : grooveBeatSubs(g).map((s) => ({ sub: s })),
        lit: Array.isArray(v.lit) ? v.lit.slice() : [],
        arts: v.arts ? { ...v.arts } : {},
        syll: v.syll ? { ...v.syll } : {},
      }));
      return { ...g, beatsPerBar: bpb, sig, swing, voices };
    }
    const subs = grooveBeatSubs(g);
    const structure = subs.map((s) => ({ sub: s }));
    const bySound = {};
    (g.hits || []).forEach((h) => { (bySound[h.sound] = bySound[h.sound] || []).push(h); });
    const ids = Object.keys(bySound).sort((a, b) => {
      const ia = KIT_ORDER.indexOf(a), ib = KIT_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    const voices = ids.map((sound) => {
      const def = kitVoiceDef(sound);
      const lit = [], arts = {}, syll = {};
      bySound[sound].forEach((h) => {
        lit.push(h.step);
        const v = h.velocity == null ? .85 : h.velocity;
        if (def.cymbal) { if (v <= .5) arts[h.step] = 'foot'; }
        else if (v >= .95) arts[h.step] = 'accent';
        else if (v <= .5) arts[h.step] = 'ghost';
        if (h.text) syll[h.step] = h.text;
      });
      return { ...def, structure: structure.map((b) => ({ ...b })), lit, arts, syll };
    });
    return { ...g, beatsPerBar: bpb, sig, swing, voices };
  }

  /** Flatten the per-voice layer back to the legacy {beatSubdivisions, hits}
   *  shape consumed by player.jsx + practice.jsx. */
  function grooveDerivedLegacy(groove) {
    const voices = groove.voices || [];
    const bpb = groove.beatsPerBar || (voices[0] && voices[0].structure.length) || 4;
    const beatSubdivisions = [];
    for (let b = 0; b < bpb; b++) {
      let l = 1;
      voices.forEach((v) => { beatDenoms((v.structure || [])[b]).forEach((d) => { l = _lcm(l, d); }); });
      if (l > 24) l = 24;            // cap exotic subdivisions; quantize below
      beatSubdivisions.push(l || 1);
    }
    const starts = []; let acc = 0;
    for (let b = 0; b < bpb; b++) { starts.push(acc); acc += beatSubdivisions[b]; }
    const seen = new Set(); const hits = [];
    voices.forEach((v) => {
      const cells = voiceCellCount(v);
      for (let idx = 0; idx < cells; idx++) {
        if (!(v.lit || []).includes(idx)) continue;
        const { beat, fwb } = cellPlacement(v, idx);
        const step = starts[beat] + Math.round(fwb * beatSubdivisions[beat]);
        const key = v.sound + '@' + step;
        if (seen.has(key)) continue;
        seen.add(key);
        const art = (v.arts || {})[idx] || (v.cymbal ? 'closed' : 'normal');
        hits.push({ step, sound: v.sound, velocity: ART_VELOCITY[art] != null ? ART_VELOCITY[art] : .85,
          text: (v.syll || {})[idx] || '' });
      }
    });
    return { beatsPerBar: bpb, beatSubdivisions, resolution: acc, hits };
  }
  function withDerivedLegacy(groove) {
    return { ...groove, ...grooveDerivedLegacy(groove) };
  }

  // Performance view preference (sweep/falling) — shared by Práctica + Canción.
  const KEY_VIEWMODE = 'backbeat.perfview.v1';
  function loadViewMode() {
    try { const v = localStorage.getItem(KEY_VIEWMODE); return v === 'falling' ? 'falling' : 'sweep'; }
    catch (e) { return 'sweep'; }
  }
  function saveViewMode(m) {
    try { localStorage.setItem(KEY_VIEWMODE, m === 'falling' ? 'falling' : 'sweep'); } catch (e) {}
  }

  function blankGroove() {
    const ids = ['hat', 'snare', 'kick'];
    const voices = ids.map((id) => ({
      ...kitVoiceDef(id),
      structure: [{ sub: 2 }, { sub: 2 }, { sub: 2 }, { sub: 2 }],
      lit: [], arts: {}, syll: {},
    }));
    return withDerivedLegacy({
      id: uid(), name: 'Nuevo groove', beatsPerBar: 4, sig: '4/4', swing: 'straight', voices,
    });
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
    return {
      id: uid(), name: 'Nuevo groove',
      beatsPerBar: 4,
      beatSubdivisions: [4, 4, 4, 4],
      resolution: 16, // kept for back-compat with code that still reads it
      hits: [],
    };
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
    sky:     { ink: '#38bdf8', tint: 'rgba(56,189,248,.14)',  border: 'rgba(56,189,248,.4)' },
    emerald: { ink: '#34d399', tint: 'rgba(52,211,153,.14)',  border: 'rgba(52,211,153,.4)' },
    red:     { ink: '#ef4444', tint: 'rgba(239,68,68,.14)',   border: 'rgba(239,68,68,.4)' },
    teal:    { ink: '#2dd4bf', tint: 'rgba(45,212,191,.14)',  border: 'rgba(45,212,191,.4)' },
  };
  function getColor(key) { return COLORS[key] || COLORS.orange; }

  window.BBData = {
    loadSongs, saveSongs, loadOnoma, saveOnoma,
    loadFolders, saveFolders, blankFolder, folderOf, unclassified,
    KIT_VOICES, ART_VELOCITY, SWING_AMOUNT, kitVoiceDef,
    voiceCellCount, voiceCellFraction, cellPlacement,
    grooveToVoices, grooveDerivedLegacy, withDerivedLegacy, blankGroove,
    loadViewMode, saveViewMode,
    uid, blankSong, blankOnoma, blankPhrase, blankFill,
    cloneWithIds,
    sectionBars, totalBars, locate, sectionStartBar, buildSchedule,
    cueOnomaIds,
    GROOVE_FINE_RES, GROOVE_SUBS_ALLOWED,
    grooveBeatsPerBar, grooveBeatSubs, grooveTotalCells,
    grooveCellPosition, grooveOffsetInBar,
    grooveFineStepForCell, grooveCellAtFineStep,
    grooveCellAtFraction,
    COLORS, getColor, SAMPLE: SONGS, SAMPLE_ONOMA: ONOMATOPOEIAS,
  };
})();
