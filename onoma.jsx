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

const RESOLUTIONS = [
  { value: 8,  label: '8 — corcheas' },
  { value: 12, label: '12 — tresillos' },
  { value: 16, label: '16 — semicorcheas' },
  { value: 24, label: '24 — sextillos' },
];

/** Single Web Audio Metronome used for preview across the page. */
const useOnomaMetro = () => {
  const ref = React.useRef(null);
  if (!ref.current) ref.current = new window.Metronome();
  React.useEffect(() => () => { try { ref.current.stop(); } catch (e) {} }, []);
  return ref.current;
};

function OnomaGrid({ pattern, onChange, currentStep, onSyllableEdit, editingStep, setEditingStep }) {
  const stepsPerBeat = pattern.resolution / 4;
  const hitsByCell = React.useMemo(() => {
    const m = new Map();
    pattern.hits.forEach((h, i) => {
      const k = `${h.sound}|${h.step}`;
      m.set(k, { ...h, idx: i });
    });
    return m;
  }, [pattern.hits]);

  // Get the "primary" syllable per step (loudest hit's text)
  const syllableByStep = React.useMemo(() => {
    const m = new Map();
    pattern.hits.forEach((h) => {
      const cur = m.get(h.step);
      if (!cur || (h.velocity || 0) > (cur.velocity || 0)) m.set(h.step, h);
    });
    return m;
  }, [pattern.hits]);

  const toggleCell = (sound, step) => {
    const k = `${sound}|${step}`;
    if (hitsByCell.has(k)) {
      onChange({ ...pattern, hits: pattern.hits.filter((_, i) => i !== hitsByCell.get(k).idx) });
    } else {
      const existingText = syllableByStep.get(step)?.text || '';
      onChange({
        ...pattern,
        hits: [...pattern.hits, { step, sound, velocity: 0.85, text: existingText }],
      });
    }
  };

  const editSyllable = (step, text) => {
    onChange({
      ...pattern,
      hits: pattern.hits.map((h) => h.step === step ? { ...h, text } : h),
    });
  };

  return (
    <div className="onoma-grid-wrap">
      {/* beat headers */}
      <div className="onoma-grid-head" style={{ '--steps': pattern.resolution }}>
        <div className="onoma-grid-head-spacer" />
        {Array.from({ length: pattern.resolution }).map((_, i) => {
          const isBeat = i % stepsPerBeat === 0;
          const beatNum = Math.floor(i / stepsPerBeat) + 1;
          return (
            <div key={i} className={`onoma-grid-step-head${isBeat ? ' beat' : ''}${i === currentStep ? ' on' : ''}`}>
              {isBeat && <span className="num-mono">{beatNum}</span>}
            </div>
          );
        })}
      </div>

      {/* sound rows */}
      {SOUNDS.map((s) => (
        <div key={s.id} className="onoma-grid-row" style={{ '--steps': pattern.resolution }}>
          <div className="onoma-grid-label" style={{ color: s.color }}>
            <span className="onoma-grid-dot" style={{ background: s.color }} />
            {s.label}
          </div>
          {Array.from({ length: pattern.resolution }).map((_, step) => {
            const k = `${s.id}|${step}`;
            const hit = hitsByCell.get(k);
            const isBeat = step % stepsPerBeat === 0;
            return (
              <button key={step}
                      className={`onoma-cell${hit ? ' on' : ''}${isBeat ? ' beat-col' : ''}${step === currentStep ? ' play' : ''}`}
                      style={hit ? { '--c': s.color } : undefined}
                      onClick={() => toggleCell(s.id, step)}
                      aria-pressed={!!hit}>
                {hit && <span className="onoma-cell-fill" />}
              </button>
            );
          })}
        </div>
      ))}

      {/* syllable row */}
      <div className="onoma-grid-syll" style={{ '--steps': pattern.resolution }}>
        <div className="onoma-grid-label muted">sílabas</div>
        {Array.from({ length: pattern.resolution }).map((_, step) => {
          const syl = syllableByStep.get(step);
          const isBeat = step % stepsPerBeat === 0;
          const hasAny = !!syl;
          const editing = editingStep === step;
          return (
            <div key={step}
                 className={`onoma-syll${isBeat ? ' beat-col' : ''}${step === currentStep ? ' play' : ''}${hasAny ? ' has' : ''}`}>
              {editing ? (
                <input className="onoma-syll-input num-mono"
                       autoFocus
                       value={syl?.text || ''}
                       onChange={(e) => editSyllable(step, e.target.value)}
                       onBlur={() => setEditingStep(null)}
                       onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); setEditingStep(null); } }} />
              ) : hasAny ? (
                <button className="onoma-syll-btn" onClick={() => setEditingStep(step)}>
                  {syl.text || '—'}
                </button>
              ) : <span className="onoma-syll-empty">·</span>}
            </div>
          );
        })}
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
    const subMap = { 8: 2, 12: 3, 16: 4, 24: 6 };
    const subdivision = subMap[pattern.resolution] || 4;
    metro.setBeatsPerBar(4);
    // Audible metronome click underneath the pattern — quarter clicks only.
    metro.setSilent(!metroClick);
    metro.setSubdivision(subdivision);

    const myToken = ++playTokenRef.current;
    setPlaying(true);
    const hitMap = new Map();
    pattern.hits.forEach((h) => {
      const arr = hitMap.get(h.step) || [];
      arr.push(h);
      hitMap.set(h.step, arr);
    });

    const unsub = metro.subscribe((ev) => {
      if (playTokenRef.current !== myToken) return;
      if (ev.type !== 'beat') return;
      const stepWithinBar = ev.sub % pattern.resolution;
      // Schedule percussion at the exact audio time of this sub-event
      const hits = hitMap.get(stepWithinBar);
      if (hits) hits.forEach((h) => metro.schedulePerc(ev.time, h.sound, h.velocity));
      setCurrentStep(stepWithinBar);
      if (!loop && ev.sub >= pattern.resolution - 1) {
        // Stop after one bar; wait for last hit
        setTimeout(() => { if (playTokenRef.current === myToken) stop(); }, 200);
      }
    });

    await metro.start({ bpm, beatsPerBar: 4, subdivision });
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
          <label className="label">Resolución</label>
          <select className="select" value={pattern.resolution}
                  onChange={(e) => onChange({ ...pattern, resolution: Number(e.target.value),
                                              hits: pattern.hits.filter((h) => h.step < Number(e.target.value)) })}>
            {RESOLUTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
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
                <span className="num-mono">{p.resolution}/bar</span>
              </div>
              <div className="onoma-list-preview">
                {Array.from({ length: Math.min(p.resolution, 16) }).map((_, i) => {
                  const has = p.hits.some((h) => h.step === i);
                  return <span key={i} className={`onoma-mini${has ? ' on' : ''}`} />;
                })}
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
