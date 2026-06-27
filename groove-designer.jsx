/* Groove DESIGNER (rediseño, núcleo) — rejilla con subdivisión independiente
 * por voz + articulaciones + swing + sílabas/TTS + audio por-voz. Reemplaza al
 * OnomaEditorPanel como editor de grooves. Trabaja sobre el modelo `voices` y,
 * en cada cambio, persiste también el legacy derivado (player/práctica intactos).
 * window.GrooveDesigner */

const { Icon: DIcon, IC: DIC, RD_CH: DCH, useIsMobile: dUseIsMobile, TopBar: DTopBar } = window.RD;
const BB = window.BBData;

const FIG = { 1: '♩', 2: '♫', 3: '³', 4: '▦' };
const SIGS = [{ id: '4/4', bpb: 4 }, { id: '3/4', bpb: 3 }, { id: '6/8', bpb: 6 }];
const ART_LABEL = { normal: 'Normal', accent: 'Acento', ghost: 'Ghost', closed: 'Cerrado', open: 'Abierto', foot: 'Pie' };

/* layout walk: per beat → cells with their global voice index (matches cellPlacement order) */
function voiceLayout(voice) {
  let k = 0;
  return (voice.structure || []).map((beat) => {
    if (beat && beat.halves) {
      return { halves: beat.halves.map((h) => {
        const cells = []; const n = h.sub || 1;
        for (let i = 0; i < n; i++) cells.push(k++);
        return { sub: n, cells };
      }) };
    }
    const n = (beat && beat.sub) || 1; const cells = [];
    for (let i = 0; i < n; i++) cells.push(k++);
    return { sub: n, cells };
  });
}

/* ── Pad: one grid cell, rendered by articulation ─────────── */
function Pad({ on, color, art = 'normal', cymbal, padH = 30, current, onClick }) {
  const wrap = { flex: 1, minWidth: 9, height: padH, position: 'relative', cursor: onClick ? 'pointer' : 'default',
    display: 'flex', alignItems: 'center', justifyContent: 'center' };
  let inner;
  if (!on) {
    inner = (
      <div style={{ width: '78%', height: '70%', background: 'var(--rd-ink)', border: '1px solid var(--rd-hair)',
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {cymbal && <span style={{ color: 'var(--rd-text-faint)', fontSize: padH * 0.4, lineHeight: 1 }}>✕</span>}
      </div>
    );
  } else if (art === 'ghost') {
    inner = <div style={{ width: padH * 0.42, height: padH * 0.42, borderRadius: '50%', background: color, opacity: .45 }} />;
  } else if (art === 'open') {
    inner = <div style={{ width: padH * 0.62, height: padH * 0.62, borderRadius: '50%', border: `2px solid ${color}`,
      boxShadow: `0 0 8px ${color}, inset 0 0 5px ${color}` }} />;
  } else if (art === 'foot') {
    inner = <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color }}>
      <span style={{ fontSize: padH * 0.5, lineHeight: .8, textShadow: `0 0 6px ${color}` }}>✕</span>
      <span style={{ width: padH * 0.5, height: 2, background: color, marginTop: 1, boxShadow: `0 0 4px ${color}` }} />
    </div>;
  } else if (art === 'closed') {
    inner = <div style={{ width: '82%', height: '78%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: `0 0 8px ${color}, 0 0 2px ${color}` }}>
      <span style={{ color: '#160a02', fontSize: padH * 0.46, fontWeight: 800, lineHeight: 1 }}>✕</span>
    </div>;
  } else { // normal / accent
    inner = <div style={{ width: art === 'accent' ? padH * 0.7 : padH * 0.56, height: art === 'accent' ? padH * 0.7 : padH * 0.56,
      borderRadius: '50%', background: color, boxShadow: `0 0 9px ${color}, 0 0 2px ${color}`,
      border: art === 'accent' ? '2px solid #fff6' : 'none' }} />;
  }
  return (
    <div style={wrap} onClick={onClick}>
      {current && <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,122,26,.14)', boxShadow: 'inset 0 0 0 1px rgba(255,122,26,.45)' }} />}
      {art === 'accent' && on && <span style={{ position: 'absolute', top: -1, fontSize: 11, color, fontWeight: 800, lineHeight: 1 }}>›</span>}
      {inner}
    </div>
  );
}

/* ── One voice lane ───────────────────────────────────────── */
function VoiceLane({ voice, beatsPerBar, padH, active, currentCell, onCell, onSetSub, onSplit, onMerge, onSetHalfSub }) {
  const color = DCH[voice.color] || voice.color || 'var(--rd-led)';
  const layout = voiceLayout(voice);
  const lit = new Set(voice.lit || []);
  const SegFig = ({ value, onPick, opts = [1, 2, 3, 4] }) => (
    <div className="seg" style={{ padding: 2 }}>
      {opts.map((s) => (
        <button key={s} data-on={value === s ? '1' : '0'} onClick={() => onPick(s)} style={{ padding: '3px 6px', fontSize: 12 }}>{FIG[s]}</button>
      ))}
    </div>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', minHeight: padH + (active ? 34 : 18),
      background: active ? 'rgba(255,122,26,.07)' : 'transparent', boxShadow: active ? 'inset 0 0 0 1px rgba(255,122,26,.18)' : 'none' }}>
      <div style={{ width: 70, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, paddingRight: 8, justifyContent: 'flex-end' }}>
        <span className="eng" style={{ fontSize: 9, color, fontWeight: active ? 800 : 700, textAlign: 'right' }}>{voice.label}</span>
      </div>
      <div style={{ flex: 1, display: 'flex' }}>
        {layout.map((beat, bi) => (
          <div key={bi} style={{ flex: 1, borderLeft: '1px solid rgba(255,177,58,.18)', padding: '2px 4px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* control / figure row */}
            <div style={{ height: active ? 26 : 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              {active ? (
                beat.halves ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <SegFig value={beat.halves[0].sub} onPick={(s) => onSetHalfSub(bi, 0, s)} opts={[1, 2, 3]} />
                    <SegFig value={beat.halves[1].sub} onPick={(s) => onSetHalfSub(bi, 1, s)} opts={[1, 2, 3]} />
                    <button className="btn ghost" style={{ padding: '2px 5px', fontSize: 9 }} onClick={() => onMerge(bi)} title="Unir">↤</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <SegFig value={beat.sub} onPick={(s) => onSetSub(bi, s)} />
                    <button className="btn ghost" style={{ padding: '2px 6px', fontSize: 10, color: 'var(--ch-magenta)' }} onClick={() => onSplit(bi)} title="Dividir en ½">½</button>
                  </div>
                )
              ) : (
                <span className="mono" style={{ fontSize: 11, color: 'var(--rd-text-faint)' }}>
                  {beat.halves ? `${FIG[beat.halves[0].sub]}${FIG[beat.halves[1].sub]}` : FIG[beat.sub]}
                </span>
              )}
            </div>
            {/* pads */}
            <div style={{ display: 'flex', gap: 3 }}>
              {beat.halves ? beat.halves.map((h, hi) => (
                <div key={hi} style={{ flex: 1, display: 'flex', gap: 3, paddingLeft: hi === 1 ? 4 : 0,
                  boxShadow: hi === 1 ? 'inset 1px 0 0 rgba(255,108,192,.4)' : 'none' }}>
                  {h.cells.map((idx) => (
                    <Pad key={idx} on={lit.has(idx)} color={color} cymbal={voice.cymbal}
                      art={(voice.arts || {})[idx] || (voice.cymbal ? 'closed' : 'normal')} padH={padH}
                      current={currentCell === idx} onClick={active ? () => onCell(idx) : undefined} />
                  ))}
                </div>
              )) : beat.cells.map((idx) => (
                <Pad key={idx} on={lit.has(idx)} color={color} cymbal={voice.cymbal}
                  art={(voice.arts || {})[idx] || (voice.cymbal ? 'closed' : 'normal')} padH={padH}
                  current={currentCell === idx} onClick={active ? () => onCell(idx) : undefined} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── BPM input ────────────────────────────────────────────── */
function BpmInput({ bpm, onChange, size = 20 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button className="key" style={{ width: 30, height: 30 }} onClick={() => onChange(Math.max(20, bpm - 1))}>−</button>
      <div className="lcd" style={{ padding: '4px 10px' }}>
        <span className="digits mono" style={{ fontSize: size }}>{bpm}</span>
      </div>
      <button className="key" style={{ width: 30, height: 30 }} onClick={() => onChange(Math.min(300, bpm + 1))}>+</button>
    </div>
  );
}

function GrooveDesigner({ groove, onChange, onDelete, onBack, bpm, onBpmChange }) {
  const isMobile = dUseIsMobile();
  const [g, setG] = React.useState(() => BB.grooveToVoices(groove));
  const [activeId, setActiveId] = React.useState(() => (BB.grooveToVoices(groove).voices[0] || {}).id);
  const [playing, setPlaying] = React.useState(false);
  const [curByVoice, setCurByVoice] = React.useState({});
  const [loop, setLoop] = React.useState(true);
  const [metroClick, setMetroClick] = React.useState(true);
  const [sayS, setSayS] = React.useState(false);
  const metroRef = React.useRef(null);
  const tokenRef = React.useRef(0);
  const barRef = React.useRef({ start: 0, dur: 0 });
  const gRef = React.useRef(g);
  gRef.current = g;

  const bpb = g.beatsPerBar || 4;
  const voices = g.voices || [];
  const active = voices.find((v) => v.id === activeId) || voices[0];

  const commit = (next) => { setG(next); onChange(BB.withDerivedLegacy(next)); };
  const mutVoice = (id, fn) => commit({ ...g, voices: voices.map((v) => v.id === id ? fn({ ...v }) : v) });

  // ── cell cycle ──
  const onCell = (idx) => {
    mutVoice(activeId, (v) => {
      const lit = new Set(v.lit || []); const arts = { ...(v.arts || {}) };
      const has = lit.has(idx); const art = arts[idx];
      if (v.cymbal) {
        if (!has) { lit.add(idx); }                       // closed (default)
        else if (!art) { arts[idx] = 'open'; }
        else if (art === 'open') { arts[idx] = 'foot'; }
        else { lit.delete(idx); delete arts[idx]; }
      } else {
        if (!has) { lit.add(idx); }                       // normal
        else if (!art) { arts[idx] = 'accent'; }
        else if (art === 'accent') { arts[idx] = 'ghost'; }
        else { lit.delete(idx); delete arts[idx]; }
      }
      return { ...v, lit: Array.from(lit).sort((a, b) => a - b), arts };
    });
  };

  // ── structure edits (clear that beat's lit/arts to avoid mis-placement) ──
  const remapBeat = (v, bi, newBeat) => {
    const layout = voiceLayout(v);
    const before = layout.slice(0, bi).reduce((n, b) => n + (b.halves ? b.halves.reduce((m, h) => m + h.cells.length, 0) : b.cells.length), 0);
    const oldCount = (() => { const b = layout[bi]; return b.halves ? b.halves.reduce((m, h) => m + h.cells.length, 0) : b.cells.length; })();
    const lit = (v.lit || []).filter((i) => i < before || i >= before + oldCount);
    const arts = {}; Object.keys(v.arts || {}).forEach((k) => { const i = +k; if (i < before || i >= before + oldCount) arts[i] = v.arts[k]; });
    const syll = {}; Object.keys(v.syll || {}).forEach((k) => { const i = +k; if (i < before || i >= before + oldCount) syll[i] = v.syll[k]; });
    const newCount = newBeat.halves ? newBeat.halves.reduce((m, h) => m + (h.sub || 1), 0) : (newBeat.sub || 1);
    const delta = newCount - oldCount;
    const shift = (i) => i >= before + oldCount ? i + delta : i;
    const structure = v.structure.map((b, j) => j === bi ? newBeat : b);
    const reLit = lit.map(shift);
    const reArts = {}; Object.keys(arts).forEach((k) => { reArts[shift(+k)] = arts[k]; });
    const reSyll = {}; Object.keys(syll).forEach((k) => { reSyll[shift(+k)] = syll[k]; });
    return { ...v, structure, lit: reLit, arts: reArts, syll: reSyll };
  };
  const onSetSub = (bi, sub) => mutVoice(activeId, (v) => remapBeat(v, bi, { sub }));
  const onSplit = (bi) => mutVoice(activeId, (v) => remapBeat(v, bi, { halves: [{ sub: 1 }, { sub: 1 }] }));
  const onMerge = (bi) => mutVoice(activeId, (v) => remapBeat(v, bi, { sub: 2 }));
  const onSetHalfSub = (bi, hi, sub) => mutVoice(activeId, (v) => {
    const beat = v.structure[bi];
    const halves = beat.halves.map((h, j) => j === hi ? { sub } : h);
    return remapBeat(v, bi, { halves });
  });

  // ── name / sig / swing ──
  const setName = (name) => commit({ ...g, name });
  const setSig = (sigId) => {
    const sig = SIGS.find((s) => s.id === sigId); if (!sig) return;
    const nb = sig.bpb;
    const voices2 = voices.map((v) => {
      const st = (v.structure || []).slice(0, nb);
      while (st.length < nb) st.push({ sub: 2 });
      // dropping/adding beats invalidates indices → reset hits for safety
      return { ...v, structure: st, lit: [], arts: {}, syll: {} };
    });
    commit({ ...g, sig: sigId, beatsPerBar: nb, voices: voices2 });
  };
  const setSwing = (swing) => commit({ ...g, swing });

  // ── add / remove instrument ──
  const present = new Set(voices.map((v) => v.id));
  const available = BB.KIT_VOICES.filter((v) => !present.has(v.id));
  const addVoice = (def) => {
    const v = { ...def, structure: Array.from({ length: bpb }, () => ({ sub: 2 })), lit: [], arts: {}, syll: {} };
    commit({ ...g, voices: [...voices, v].sort((a, b) => BB.KIT_VOICES.findIndex((k) => k.id === a.id) - BB.KIT_VOICES.findIndex((k) => k.id === b.id)) });
    setActiveId(v.id);
  };
  const removeVoice = (id) => {
    if (voices.length <= 1) return;
    const next = voices.filter((v) => v.id !== id);
    commit({ ...g, voices: next });
    if (activeId === id) setActiveId(next[0].id);
  };

  // ── syllables (active voice) ──
  const setSyll = (idx) => {
    const cur = (active.syll || {})[idx] || '';
    const text = window.prompt('Sílaba para este golpe', cur);
    if (text == null) return;
    mutVoice(activeId, (v) => { const syll = { ...(v.syll || {}) }; if (text.trim()) syll[idx] = text.trim(); else delete syll[idx]; return { ...v, syll }; });
  };

  // ── audio ──
  const stop = React.useCallback(() => {
    const m = metroRef.current; if (m) m.stop();
    setPlaying(false); setCurByVoice({}); barRef.current = { start: 0, dur: 0 }; tokenRef.current++;
  }, []);
  React.useEffect(() => () => stop(), [stop]);

  const play = async () => {
    const m = metroRef.current || (metroRef.current = new window.Metronome());
    await m.init();
    m.setBpm(bpm); m.setBeatsPerBar(bpb); m.setSilent(!metroClick);
    m.setSubdivision(1); m.setClickQuartersOnly(false);
    const token = ++tokenRef.current; setPlaying(true);
    const SW = BB.SWING_AMOUNT;
    const unsub = m.subscribe((ev) => {
      if (tokenRef.current !== token || ev.type !== 'beat') return;
      if (ev.beat % bpb !== 0) return;
      const cg = gRef.current; const barDur = (60 / m.bpm) * bpb;
      barRef.current = { start: ev.time, dur: barDur };
      (cg.voices || []).forEach((v) => {
        const cells = BB.voiceCellCount(v);
        for (let idx = 0; idx < cells; idx++) {
          if (!(v.lit || []).includes(idx)) continue;
          const place = BB.cellPlacement(v, idx);
          const frac = (place.beat + place.fwb) / bpb;
          const sw = (place.fwb >= 0.5 ? (SW[cg.swing] || 0) * (0.5 / bpb) : 0) * barDur;
          const art = (v.arts || {})[idx] || (v.cymbal ? 'closed' : 'normal');
          m.schedulePerc(ev.time + frac * barDur + sw, v.sound, BB.ART_VELOCITY[art] || .85);
        }
      });
      if (sayS) {
        const av = (cg.voices || []).find((x) => x.id === activeId);
        if (av) {
          const text = Object.keys(av.syll || {}).map(Number).sort((a, b) => a - b).map((k) => av.syll[k]).join(' ');
          if (text) m.say(text);
        }
      }
      if (!loop && ev.beat >= bpb) setTimeout(() => { if (tokenRef.current === token) stop(); }, barDur * 1000 + 200);
    });
    await m.start({ bpm, beatsPerBar: bpb, subdivision: 1 });
    const chk = setInterval(() => { if (!m.running || tokenRef.current !== token) { unsub(); clearInterval(chk); } }, 120);
  };

  // rAF viz: light the current cell per voice
  React.useEffect(() => {
    if (!playing) return; let raf;
    const tick = () => {
      const m = metroRef.current; const { start, dur } = barRef.current;
      if (m && m.ctx && dur > 0 && start > 0) {
        const elapsed = m.ctx.currentTime - start;
        if (elapsed >= 0) {
          const f = (elapsed % dur) / dur; const cur = {};
          (gRef.current.voices || []).forEach((v) => {
            const cells = BB.voiceCellCount(v); let best = -1, bestF = -1;
            for (let idx = 0; idx < cells; idx++) {
              const cf = BB.voiceCellFraction(v, bpb, idx);
              if (cf <= f + 1e-6 && cf > bestF) { bestF = cf; best = idx; }
            }
            cur[v.id] = best;
          });
          setCurByVoice(cur);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, bpb]);

  const padH = isMobile ? 26 : 34;

  // ── hardware strip ──
  const hardware = (
    <div className="panel brushed" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <button className={'key' + (playing ? ' play' : '')} style={{ width: 46, height: 46 }} onClick={() => playing ? stop() : play()}>
        <DIcon d={playing ? DIC.pause : DIC.play} size={20} fill={playing ? 'none' : 'currentColor'} />
      </button>
      <button className="key" style={{ width: 38, height: 38, opacity: metroClick ? 1 : .5 }} onClick={() => setMetroClick((x) => !x)} title="Click metrónomo">
        <DIcon d={DIC.metronome} size={18} />
      </button>
      <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--rd-hair)' }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="eng" style={{ fontSize: 8.5 }}>Preview BPM</span>
        <BpmInput bpm={bpm} onChange={onBpmChange} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="eng" style={{ fontSize: 8.5 }}>Swing</span>
        <div className="seg">
          {['straight', 'medium', 'shuffle'].map((s) => (
            <button key={s} data-on={g.swing === s ? '1' : '0'} onClick={() => setSwing(s)}>
              {s === 'straight' ? 'Recto' : s === 'medium' ? 'Medio' : 'Shuffle'}
            </button>
          ))}
        </div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', cursor: 'pointer' }}>
        <span className={'led' + (loop ? ' on' : '')} style={{ width: 8, height: 8 }} />
        <span className="eng" style={{ fontSize: 9 }} onClick={() => setLoop((x) => !x)}>Loop</span>
        <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} style={{ display: 'none' }} />
        <span onClick={() => setLoop((x) => !x)} style={{ cursor: 'pointer' }} />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} onClick={() => setSayS((x) => !x)}>
        <span className={'led' + (sayS ? ' on' : '')} style={{ width: 8, height: 8, '--c': 'var(--rd-cyan)' }} />
        <span className="eng" style={{ fontSize: 9 }}>Decir sílabas</span>
      </label>
    </div>
  );

  // ── grid ──
  const grid = (
    <div className="staff" style={{ padding: 12, overflowX: 'auto' }}>
      <div style={{ minWidth: 70 + bpb * 120 }}>
        {/* beat ruler */}
        <div style={{ display: 'flex', marginBottom: 4 }}>
          <div style={{ width: 70, flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex' }}>
            {Array.from({ length: bpb }).map((_, b) => (
              <div key={b} className="mono" style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--rd-text-mut)', borderLeft: '1px solid rgba(255,177,58,.18)' }}>{b + 1}</div>
            ))}
          </div>
        </div>
        {voices.map((v) => (
          <VoiceLane key={v.id} voice={v} beatsPerBar={bpb} padH={padH} active={v.id === activeId}
            currentCell={curByVoice[v.id]} onCell={onCell}
            onSetSub={onSetSub} onSplit={onSplit} onMerge={onMerge} onSetHalfSub={onSetHalfSub} />
        ))}
      </div>
    </div>
  );

  // ── voice selector ──
  const voiceSelector = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span className="eng" style={{ fontSize: 9 }}>Voz activa</span>
      <div className="seg" style={{ flexWrap: 'wrap' }}>
        {voices.map((v) => (
          <button key={v.id} data-on={v.id === activeId ? '1' : '0'} onClick={() => setActiveId(v.id)}
            style={{ color: v.id === activeId ? (DCH[v.color] || 'var(--rd-text)') : undefined }}>{v.label}</button>
        ))}
      </div>
      {voices.length > 1 && (
        <button className="btn ghost" style={{ padding: '5px 9px', fontSize: 10, color: 'var(--rd-danger)' }} onClick={() => removeVoice(activeId)}>
          <DIcon d={DIC.trash} size={12} /> Quitar {active && active.label}
        </button>
      )}
    </div>
  );

  // ── add instrument ──
  const addInstrument = available.length > 0 && (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span className="eng" style={{ fontSize: 9 }}>Añadir instrumento</span>
      {available.map((v) => (
        <button key={v.id} className="chip" style={{ cursor: 'pointer', color: DCH[v.color] }} onClick={() => addVoice(v)}>
          <DIcon d={DIC.plus} size={11} /> {v.label}
        </button>
      ))}
    </div>
  );

  // ── syllables (active voice) ──
  const litSorted = (active ? (active.lit || []).slice().sort((a, b) => a - b) : []);
  const syllables = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span className="eng" style={{ fontSize: 9 }}>Voz por golpe ({active && active.label})</span>
      {litSorted.length === 0 && <span className="eng" style={{ fontSize: 9, color: 'var(--rd-text-faint)' }}>enciende golpes para asignar sílabas</span>}
      {litSorted.map((idx) => (
        <button key={idx} className="chip mono" style={{ cursor: 'pointer', color: 'var(--rd-led-soft)' }} onClick={() => setSyll(idx)}>
          {(active.syll || {})[idx] || '·'}
        </button>
      ))}
    </div>
  );

  return (
    <React.Fragment>
      <DTopBar title={g.name || 'Groove'} sub={`Diseñador · ${g.sig || '4/4'} · subdivisión por voz`} back onBack={onBack}
        right={onDelete ? <button className="btn ghost icon" title="Eliminar" onClick={() => onDelete(g.id)}><DIcon d={DIC.trash} size={16} /></button> : null} />
      <div className="rd-scroll" style={{ padding: isMobile ? 12 : 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <input value={g.name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del groove"
            style={{ flex: 1, minWidth: 160, background: 'var(--rd-ink)', border: '1px solid var(--rd-hair-strong)', color: 'var(--rd-text)',
              padding: '9px 12px', fontFamily: 'var(--rd-font)', fontSize: 16, fontWeight: 700 }} />
          <div className="seg">
            {SIGS.map((s) => <button key={s.id} data-on={(g.sig || '4/4') === s.id ? '1' : '0'} onClick={() => setSig(s.id)}>{s.id}</button>)}
          </div>
        </div>
        {hardware}
        {voiceSelector}
        {grid}
        <div className="eng" style={{ fontSize: 9, color: 'var(--rd-text-faint)' }}>
          Editas la voz activa. Click en una celda: encender → {active && active.cymbal ? 'cerrado → abierto → pie' : 'acento → ghost'} → apagar. ♩♫³▦ fija la figura del tiempo; ½ lo parte en dos mitades.
        </div>
        {addInstrument}
        {syllables}
      </div>
    </React.Fragment>
  );
}

Object.assign(window, { GrooveDesigner });
