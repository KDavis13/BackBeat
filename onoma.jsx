/* Groove editor — grid-based pattern builder with audio preview. */

const SOUNDS = [
  { id: 'kick',  label: 'Kick',   color: '#fb923c' },
  { id: 'snare', label: 'Snare',  color: '#fbbf24' },
  { id: 'tom1',  label: 'Tom 1',  color: '#fb7185' },
  { id: 'tom2',  label: 'Tom 2',  color: '#f472b6' },
  { id: 'tom3',  label: 'Tom 3',  color: '#c084fc' },
  { id: 'hat',   label: 'Hi-hat', color: '#a3e635' },
  { id: 'crash', label: 'Crash',  color: '#facc15' },
  { id: 'ride',  label: 'Ride',   color: '#38bdf8' },
];

const BEATS_PER_BAR_OPTIONS = [3, 4, 5, 6, 7];
const BEAT_SUB_GLYPHS = {
  1: '♩', // negra
  2: '♫', // corchea
  3: '³', // tresillo
  4: '♬', // semicorchea
  6: '⁶', // sextillo
};

/** Single Web Audio Metronome used for preview across the page. */
const useOnomaMetro = () => {
  const ref = React.useRef(null);
  if (!ref.current) ref.current = new window.Metronome();
  React.useEffect(() => () => { try { ref.current.stop(); } catch (e) {} }, []);
  return ref.current;
};

function OnomaGrid({ pattern, onChange, currentStep, editingStep, setEditingStep }) {
  const beatsPerBar = window.BBData.grooveBeatsPerBar(pattern);
  const beatSubs = window.BBData.grooveBeatSubs(pattern);
  // Flat cell index where each beat starts.
  const beatStart = [0];
  beatSubs.forEach((n) => beatStart.push(beatStart[beatStart.length - 1] + n));
  const totalCells = beatStart[beatStart.length - 1];

  const hitsByCell = React.useMemo(() => {
    const m = new Map();
    pattern.hits.forEach((h, i) => {
      const k = `${h.sound}|${h.step}`;
      m.set(k, { ...h, idx: i });
    });
    return m;
  }, [pattern.hits]);

  // "Primary" syllable per cell (loudest hit's text).
  const syllableByStep = React.useMemo(() => {
    const m = new Map();
    pattern.hits.forEach((h) => {
      const cur = m.get(h.step);
      if (!cur || (h.velocity || 0) > (cur.velocity || 0)) m.set(h.step, h);
    });
    return m;
  }, [pattern.hits]);

  const toggleCell = (sound, cellIdx) => {
    const k = `${sound}|${cellIdx}`;
    if (hitsByCell.has(k)) {
      onChange({ ...pattern, hits: pattern.hits.filter((_, i) => i !== hitsByCell.get(k).idx) });
    } else {
      const existingText = syllableByStep.get(cellIdx)?.text || '';
      onChange({
        ...pattern,
        hits: [...pattern.hits, { step: cellIdx, sound, velocity: 0.85, text: existingText }],
      });
    }
  };

  const editSyllable = (cellIdx, text) => {
    onChange({
      ...pattern,
      hits: pattern.hits.map((h) => h.step === cellIdx ? { ...h, text } : h),
    });
  };

  // Changing the subdivision of a beat shifts the cell numbering of every
  // beat after it. Hits in the changed beat that no longer fit are dropped;
  // hits in later beats keep playing at their (now-renumbered) cellIdx.
  const setBeatSubs = (beatIdx, nextSubs) => {
    const subs = beatSubs.slice();
    const oldStart = beatStart[beatIdx];
    const oldEnd = beatStart[beatIdx + 1];
    const delta = nextSubs - subs[beatIdx];
    subs[beatIdx] = nextSubs;
    const nextHits = pattern.hits
      .map((h) => {
        if (h.step < oldStart) return h;             // beats before — untouched
        if (h.step >= oldEnd)  return { ...h, step: h.step + delta }; // shift later beats
        // Hit was inside the resized beat: keep only if it still fits.
        const subInBeat = h.step - oldStart;
        if (subInBeat < nextSubs) return h;
        return null;
      })
      .filter(Boolean);
    onChange({
      ...pattern,
      beatsPerBar: subs.length,
      beatSubdivisions: subs,
      hits: nextHits,
    });
  };

  return (
    <div className="onoma-grid-wrap">
      {/* Beat headers + per-beat subdivision selector */}
      <div className="onoma-grid-head">
        <div className="onoma-grid-head-spacer" />
        <div className="onoma-grid-beats" style={{ '--bpb': beatsPerBar }}>
          {beatSubs.map((subs, b) => (
            <div key={b}
                 className={`onoma-grid-beat-head${
                   currentStep >= beatStart[b] && currentStep < beatStart[b + 1] ? ' on' : ''
                 }`}>
              <span className="num-mono onoma-beat-num">{b + 1}</span>
              <select className="select onoma-beat-sub"
                      value={subs}
                      onChange={(e) => setBeatSubs(b, Number(e.target.value))}
                      title="Subdivisión del tiempo">
                {window.BBData.GROOVE_SUBS_ALLOWED.map((n) => (
                  <option key={n} value={n}>{BEAT_SUB_GLYPHS[n] || n}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Sound rows */}
      {SOUNDS.map((s) => (
        <div key={s.id} className="onoma-grid-row">
          <div className="onoma-grid-label" style={{ color: s.color }}>
            <span className="onoma-grid-dot" style={{ background: s.color }} />
            {s.label}
          </div>
          <div className="onoma-grid-cells" style={{ '--bpb': beatsPerBar }}>
            {beatSubs.map((subs, b) => (
              <div key={b} className="onoma-grid-beat-col" style={{ '--subs': subs }}>
                {Array.from({ length: subs }).map((_, sub) => {
                  const cellIdx = beatStart[b] + sub;
                  const k = `${s.id}|${cellIdx}`;
                  const hit = hitsByCell.get(k);
                  return (
                    <button key={sub}
                            className={`onoma-cell${hit ? ' on' : ''}${sub === 0 ? ' beat-col' : ''}${cellIdx === currentStep ? ' play' : ''}`}
                            style={hit ? { '--c': s.color } : undefined}
                            onClick={() => toggleCell(s.id, cellIdx)}
                            aria-pressed={!!hit}>
                      {hit && <span className="onoma-cell-fill" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Syllable row */}
      <div className="onoma-grid-row onoma-grid-syll-row">
        <div className="onoma-grid-label muted">sílabas</div>
        <div className="onoma-grid-cells" style={{ '--bpb': beatsPerBar }}>
          {beatSubs.map((subs, b) => (
            <div key={b} className="onoma-grid-beat-col" style={{ '--subs': subs }}>
              {Array.from({ length: subs }).map((_, sub) => {
                const cellIdx = beatStart[b] + sub;
                const syl = syllableByStep.get(cellIdx);
                const hasAny = !!syl;
                const editing = editingStep === cellIdx;
                return (
                  <div key={sub}
                       className={`onoma-syll${sub === 0 ? ' beat-col' : ''}${cellIdx === currentStep ? ' play' : ''}${hasAny ? ' has' : ''}`}>
                    {editing ? (
                      <input className="onoma-syll-input num-mono"
                             autoFocus
                             value={syl?.text || ''}
                             onChange={(e) => editSyllable(cellIdx, e.target.value)}
                             onBlur={() => setEditingStep(null)}
                             onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); setEditingStep(null); } }} />
                    ) : hasAny ? (
                      <button className="onoma-syll-btn" onClick={() => setEditingStep(cellIdx)}>
                        {syl.text || '—'}
                      </button>
                    ) : <span className="onoma-syll-empty">·</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function OnomaEditorPanel({ pattern, onChange, onDelete, bpm, onBpmChange }) {
  const metro = useOnomaMetro();
  const [playing, setPlaying] = React.useState(false);
  const [loop, setLoop] = React.useState(true);
  const [metroClick, setMetroClick] = React.useState(true);
  const [currentStep, setCurrentStep] = React.useState(-1);
  const [editingStep, setEditingStep] = React.useState(null);
  const playTokenRef = React.useRef(0);

  const stop = React.useCallback(() => {
    metro.stop();
    setPlaying(false);
    setCurrentStep(-1);
    playTokenRef.current++;
  }, [metro]);

  React.useEffect(() => () => stop(), [stop]);
  React.useEffect(() => { metro.setSilent(!metroClick); }, [metroClick, metro]);

  const play = async () => {
    await metro.init();
    metro.setBpm(bpm);
    const beatsPerBar = window.BBData.grooveBeatsPerBar(pattern);
    const fineRes = window.BBData.GROOVE_FINE_RES;
    metro.setBeatsPerBar(beatsPerBar);
    metro.setSilent(!metroClick);
    metro.setSubdivision(fineRes);

    const myToken = ++playTokenRef.current;
    setPlaying(true);
    // Map each cell hit to a fine step inside the bar.
    const fineToHits = new Map();
    pattern.hits.forEach((h) => {
      const fineStep = window.BBData.grooveFineStepForCell(pattern, h.step, fineRes);
      const arr = fineToHits.get(fineStep) || [];
      arr.push(h);
      fineToHits.set(fineStep, arr);
    });
    const fineInBar = fineRes * beatsPerBar;

    const unsub = metro.subscribe((ev) => {
      if (playTokenRef.current !== myToken) return;
      if (ev.type !== 'beat') return;
      const fine = ((ev.sub % fineInBar) + fineInBar) % fineInBar;
      const hits = fineToHits.get(fine);
      if (hits) hits.forEach((h) => metro.schedulePerc(ev.time, h.sound, h.velocity));
      const cellIdx = window.BBData.grooveCellAtFineStep(pattern, fine, fineRes);
      if (cellIdx >= 0) setCurrentStep(cellIdx);
      if (!loop && ev.sub >= fineInBar - 1) {
        setTimeout(() => { if (playTokenRef.current === myToken) stop(); }, 200);
      }
    });

    await metro.start({ bpm, beatsPerBar, subdivision: fineRes });
    // teardown when stopped externally
    const checkStop = setInterval(() => {
      if (!metro.running || playTokenRef.current !== myToken) {
        unsub(); clearInterval(checkStop);
        setPlaying(false); setCurrentStep(-1);
      }
    }, 100);
  };

  const playOrStop = () => playing ? stop() : play();

  return (
    <div className="onoma-editor">
      <div className="onoma-editor-head">
        <input className="input onoma-name" value={pattern.name}
               onChange={(e) => onChange({ ...pattern, name: e.target.value })} />
        <button className="btn icon danger" onClick={onDelete} title="Eliminar groove">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        </button>
      </div>

      <div className="onoma-toolbar">
        <div className="onoma-tool-field">
          <label className="label">Compás</label>
          <select className="select"
                  value={window.BBData.grooveBeatsPerBar(pattern)}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    const subs = window.BBData.grooveBeatSubs(pattern).slice();
                    const cur = subs.length;
                    if (next > cur) {
                      const def = subs[cur - 1] || 4;
                      while (subs.length < next) subs.push(def);
                    } else if (next < cur) {
                      subs.length = next;
                    }
                    const newTotal = subs.reduce((a, b) => a + b, 0);
                    onChange({ ...pattern, beatsPerBar: next, beatSubdivisions: subs,
                               hits: pattern.hits.filter((h) => h.step < newTotal) });
                  }}>
            {BEATS_PER_BAR_OPTIONS.map((n) => <option key={n} value={n}>{n}/4</option>)}
          </select>
        </div>
        <div className="onoma-tool-field">
          <label className="label">Preview BPM</label>
          <input type="number" className="input num-mono" style={{ width: 90 }}
                 min={40} max={220} value={bpm}
                 onChange={(e) => onBpmChange(Number(e.target.value) || 100)} />
        </div>
        <label className="onoma-loop">
          <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
          <span>Loop</span>
        </label>
        <label className="onoma-loop">
          <input type="checkbox" checked={metroClick} onChange={(e) => setMetroClick(e.target.checked)} />
          <span>Click metrónomo</span>
        </label>
        <div style={{ flex: 1 }} />
        <button className={`btn ${playing ? 'play-on' : 'primary'}`} onClick={playOrStop}>
          {playing ? (
            <><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg> Detener</>
          ) : (
            <><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Probar</>
          )}
        </button>
      </div>

      <OnomaGrid pattern={pattern} onChange={onChange}
                 currentStep={currentStep}
                 editingStep={editingStep} setEditingStep={setEditingStep} />

      <div className="onoma-hint">
        <strong>Click</strong> en una celda para añadir o quitar un golpe ·{' '}
        <strong>Click</strong> en la sílaba para editar su texto ·{' '}
        Los golpes en la misma columna comparten sílaba.
      </div>
    </div>
  );
}

function OnomaScreen({ items, onChange, onAdd, onDelete }) {
  const [selectedId, setSelectedId] = React.useState(items[0]?.id || null);
  const [bpm, setBpm] = React.useState(100);

  React.useEffect(() => {
    if (!selectedId && items.length) setSelectedId(items[0].id);
    if (selectedId && !items.find((p) => p.id === selectedId)) {
      setSelectedId(items[0]?.id || null);
    }
  }, [items, selectedId]);

  const current = items.find((p) => p.id === selectedId);

  return (
    <div className="page onoma-page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Grooves</h1>
          <p className="page-sub">Patrones de batería para los fills — kick, snare, toms, hi-hat, crash y ride</p>
        </div>
        <div className="page-actions">
          <button className="btn primary" onClick={onAdd}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
            Nueva
          </button>
        </div>
      </div>

      <div className="onoma-layout">
        <aside className="onoma-list">
          {items.map((p) => (
            <button key={p.id}
                    className={`onoma-list-item${p.id === selectedId ? ' on' : ''}`}
                    onClick={() => setSelectedId(p.id)}>
              <div className="onoma-list-name">{p.name}</div>
              <div className="onoma-list-meta">
                <span className="num-mono">{p.hits.length} golpes</span>
                <span className="lib-dot" />
                <span className="num-mono">{window.BBData.grooveBeatsPerBar(p)}/4</span>
              </div>
              <div className="onoma-list-preview">
                {(() => {
                  const total = window.BBData.grooveTotalCells(p);
                  return Array.from({ length: Math.min(total, 16) }).map((_, i) => {
                    const has = p.hits.some((h) => h.step === i);
                    return <span key={i} className={`onoma-mini${has ? ' on' : ''}`} />;
                  });
                })()}
              </div>
            </button>
          ))}
          {items.length === 0 && (
            <div className="empty-state">Crea tu primer groove.</div>
          )}
        </aside>

        <div className="onoma-main">
          {current ? (
            <OnomaEditorPanel pattern={current}
                              onChange={(p) => onChange(p)}
                              onDelete={() => onDelete(current.id)}
                              bpm={bpm} onBpmChange={setBpm} />
          ) : (
            <div className="empty-state">Sin grooves todavía.</div>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { OnomaScreen, SOUNDS });
