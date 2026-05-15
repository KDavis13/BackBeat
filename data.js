/* BackBeat — sample data + storage */
(function () {
  'use strict';

  // An onomatopoeia is a 1-bar percussion pattern with synced syllables.
  // - resolution: how many steps the bar is divided into (8, 12, 16, 24).
  //   12 = triplets on 4/4. 16 = sixteenths on 4/4. 24 = 24th notes.
  // - hits: array of { step (0..resolution-1), text, sound, velocity }
  // Played at the song's BPM; spans exactly one bar of the song.
  const ONOMATOPOEIAS = [
    {
      id: 'taka',
      name: 'ta-ka-tum-pá',
      resolution: 16,
      hits: [
        { step: 0,  text: 'ta',  sound: 'tom-hi', velocity: 0.9 },
        { step: 2,  text: 'ka',  sound: 'tom-hi', velocity: 0.7 },
        { step: 4,  text: 'tum', sound: 'tom-low', velocity: 1.0 },
        { step: 8,  text: 'pa',  sound: 'snare',  velocity: 0.85 },
        { step: 12, text: 'tum', sound: 'kick',   velocity: 1.0 },
        { step: 14, text: 'pá',  sound: 'snare',  velocity: 1.0 },
      ],
    },
    {
      id: 'roll',
      name: 'redoble 16th',
      resolution: 16,
      hits: Array.from({ length: 16 }).map((_, i) => ({
        step: i,
        text: i % 4 === 0 ? 'TA' : 'ta',
        sound: 'snare',
        velocity: i % 4 === 0 ? 1.0 : 0.55,
      })),
    },
    {
      id: 'tripA',
      name: 'tum-pa-tá (tresillos)',
      resolution: 12,
      hits: [
        { step: 0,  text: 'tum', sound: 'kick',  velocity: 1.0 },
        { step: 4,  text: 'pa',  sound: 'tom-hi', velocity: 0.7 },
        { step: 5,  text: 'tá',  sound: 'snare', velocity: 1.0 },
        { step: 8,  text: 'tum', sound: 'kick',  velocity: 0.95 },
        { step: 11, text: 'pá',  sound: 'snare', velocity: 1.0 },
      ],
    },
    {
      id: 'pumpum',
      name: 'pum-pum-pa',
      resolution: 16,
      hits: [
        { step: 0,  text: 'pum', sound: 'kick',  velocity: 1.0 },
        { step: 4,  text: 'pum', sound: 'kick',  velocity: 1.0 },
        { step: 8,  text: 'pa',  sound: 'snare', velocity: 1.0 },
        { step: 12, text: '', sound: '', velocity: 0 },
      ].filter((h) => h.sound),
    },
  ];

  const SONGS = [
    {
      id: 'smoke',
      title: 'Smoke on the Water',
      artist: 'Deep Purple',
      bpm: 112,
      beatsPerBar: 4,
      subdivision: 1,
      sections: [
        { id: 's1', name: 'Intro riff',  bars: 4, color: 'orange',
          endCue: { type: 'change', say: 'estrofa', leadBars: 2 } },
        { id: 's2', name: 'Estrofa',     bars: 8, color: 'gold',
          endCue: { type: 'change', say: 'estribillo', leadBars: 2 } },
        { id: 's3', name: 'Estribillo',  bars: 8, color: 'coral', subdivision: 2,
          endCue: { type: 'fill', say: 'ta-ka-tum-pá', onomatopoeiaId: 'taka', leadBars: 1 } },
        { id: 's4', name: 'Solo',        bars: 16, color: 'magenta', subdivision: 4,
          endCue: { type: 'change', say: 'outro', leadBars: 2 } },
        { id: 's5', name: 'Outro',       bars: 4, color: 'lime',
          endCue: { type: 'stop', say: 'para', leadBars: 1 } },
      ],
    },
    {
      id: 'seven',
      title: 'Seven Nation Army',
      artist: 'The White Stripes',
      bpm: 124,
      beatsPerBar: 4,
      subdivision: 1,
      sections: [
        { id: 's1', name: 'Intro', bars: 8, color: 'orange',
          endCue: { type: 'change', say: 'estrofa', leadBars: 2 } },
        { id: 's2', name: 'Estrofa', bars: 16, color: 'gold', subdivision: 2,
          endCue: { type: 'fill', say: 'pum-pum-pa', onomatopoeiaId: 'pumpum', leadBars: 1 } },
        { id: 's3', name: 'Puente', bars: 8, color: 'magenta',
          endCue: { type: 'change', say: 'estribillo', leadBars: 2 } },
        { id: 's4', name: 'Estribillo', bars: 16, color: 'coral',
          endCue: { type: 'stop', say: 'corta', leadBars: 1 } },
      ],
    },
    {
      id: 'beat',
      title: 'Practice — 100 BPM',
      artist: 'Rutina',
      bpm: 100,
      beatsPerBar: 4,
      subdivision: 2,
      sections: [
        { id: 's1', name: 'Calentamiento', bars: 8, color: 'orange', subdivision: 1,
          endCue: { type: 'change', say: 'sube tempo', leadBars: 2 } },
        { id: 's2', name: 'Groove A', bars: 16, color: 'gold', subdivision: 2,
          endCue: { type: 'fill', say: 'tum-pa-tá', onomatopoeiaId: 'tripA', leadBars: 1 } },
        { id: 's3', name: 'Groove B', bars: 16, color: 'coral', subdivision: 4,
          endCue: { type: 'stop', say: 'fin', leadBars: 1 } },
      ],
    },
  ];

  const KEY_SONGS = 'backbeat.songs.v3';
  const KEY_ONOMA = 'backbeat.onoma.v3';

  function loadSongs() {
    try {
      const raw = localStorage.getItem(KEY_SONGS);
      if (!raw) return SONGS.slice();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || !parsed.length) return SONGS.slice();
      // ensure backwards-compat fields
      return parsed.map((s) => ({ subdivision: 1, ...s }));
    } catch (e) { return SONGS.slice(); }
  }
  function saveSongs(songs) {
    try { localStorage.setItem(KEY_SONGS, JSON.stringify(songs)); } catch (e) {}
  }

  function loadOnoma() {
    try {
      const raw = localStorage.getItem(KEY_ONOMA);
      if (!raw) return ONOMATOPOEIAS.slice();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return ONOMATOPOEIAS.slice();
      return parsed;
    } catch (e) { return ONOMATOPOEIAS.slice(); }
  }
  function saveOnoma(items) {
    try { localStorage.setItem(KEY_ONOMA, JSON.stringify(items)); } catch (e) {}
  }

  function uid() { return 's_' + Math.random().toString(36).slice(2, 9); }

  function blankSong() {
    return {
      id: uid(), title: 'Nueva canción', artist: '',
      bpm: 100, beatsPerBar: 4, subdivision: 1,
      sections: [
        { id: uid(), name: 'Intro', bars: 4, color: 'orange',
          endCue: { type: 'change', say: 'estrofa', leadBars: 2 } },
      ],
    };
  }

  function blankOnoma() {
    return { id: uid(), name: 'Nuevo patrón', resolution: 16, hits: [] };
  }

  function totalBars(song) { return song.sections.reduce((n, s) => n + s.bars, 0); }

  // For a given total bar index, what's the section + bar in section?
  function locate(song, totalBarIdx) {
    let acc = 0;
    for (let i = 0; i < song.sections.length; i++) {
      const s = song.sections[i];
      if (totalBarIdx < acc + s.bars) return { sectionIdx: i, barInSection: totalBarIdx - acc };
      acc += s.bars;
    }
    return { sectionIdx: song.sections.length - 1, barInSection: 0 };
  }
  // Reverse: section idx → first total bar number.
  function sectionStartBar(song, sectionIdx) {
    let acc = 0;
    for (let i = 0; i < sectionIdx; i++) acc += song.sections[i].bars;
    return acc;
  }

  // List of palette colors a section can be tinted with. Orange-led warm set.
  const COLORS = {
    orange:  { ink: '#fb923c', tint: 'rgba(251,146,60,.14)',  border: 'rgba(251,146,60,.4)' },
    coral:   { ink: '#fb7185', tint: 'rgba(251,113,133,.14)', border: 'rgba(251,113,133,.4)' },
    gold:    { ink: '#fbbf24', tint: 'rgba(251,191,36,.14)',  border: 'rgba(251,191,36,.4)' },
    magenta: { ink: '#f472b6', tint: 'rgba(244,114,182,.14)', border: 'rgba(244,114,182,.4)' },
    lime:    { ink: '#a3e635', tint: 'rgba(163,230,53,.14)',  border: 'rgba(163,230,53,.4)' },
    violet:  { ink: '#c084fc', tint: 'rgba(192,132,252,.14)', border: 'rgba(192,132,252,.4)' },
  };
  // Tolerant lookup — old-data color keys (cyan/indigo/etc.) fall back to orange.
  function getColor(key) { return COLORS[key] || COLORS.orange; }

  window.BBData = {
    loadSongs, saveSongs, loadOnoma, saveOnoma,
    uid, blankSong, blankOnoma, totalBars, locate, sectionStartBar,
    COLORS, getColor, SAMPLE: SONGS, SAMPLE_ONOMA: ONOMATOPOEIAS,
  };
})();
