/* Editor — sections with multi-phrase support. */

const CUE_TYPES = [
  { value: 'change', label: 'Cambio' },
  { value: 'fill',   label: 'Fill' },
  { value: 'stop',   label: 'Parada' },
];

const SUBDIV_OPTS = [
  { value: 1, label: '♩', sub: 'negras' },
  { value: 2, label: '♫', sub: 'corcheas' },
  { value: 3, label: '³', sub: 'tresillos' },
  { value: 4, label: '♬', sub: '16ths' },
];

const SECTION_COLORS = [
  'orange', 'coral', 'red', 'gold',
  'lime', 'emerald', 'teal', 'sky',
  'violet', 'magenta',
];

/** Onomatopoeia list editor — add/remove/reorder. */
function OnomaPicker({ ids, onChange, onomaItems, slotLabel }) {
  const total = ids.length;
  const remove = (i) => onChange(ids.filter((_, j) => j !== i));
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    const next = ids.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const setAt = (i, newId) => {
    const next = ids.slice(); next[i] = newId; onChange(next);
  };
  const add = (id) => onChange([...ids, id]);
  return (
    <div className="ed-onoma-list">
      {ids.map((id, i) => {
        const item = onomaItems.find((o) => o.id === id);
        return (
          <div key={i} className="ed-onoma-row">
            <span className="ed-onoma-pos">{slotLabel ? slotLabel(i, total) : `#${i + 1}`}</span>
            <select className="select" value={id} onChange={(e) => setAt(i, e.target.value)}>
              {!item && <option value={id}>— patrón eliminado —</option>}
              {onomaItems.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <button className="btn icon ghost" disabled={i === 0} onClick={() => move(i, -1)} title="Subir">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 15l-6-6-6 6"/></svg>
            </button>
            <button className="btn icon ghost" disabled={i === total - 1} onClick={() => move(i, 1)} title="Bajar">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
            </button>
            <button className="btn icon danger" onClick={() => remove(i)} title="Quitar">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        );
      })}
      <div className="ed-onoma-add">
        <select className="select" value=""
                onChange={(e) => { if (e.target.value) add(e.target.value); }}>
          <option value="">+ añadir groove…</option>
          {onomaItems.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </div>
    </div>
  );
}

/** Fill options — onoma list + voice/sing/mute toggles. */
function FillEditor({ fill, onChange, onomaItems }) {
  const set = (patch) => onChange({ ...fill, ...patch });
  const hasSay = fill.sayText !== undefined && fill.sayText !== '';
  return (
    <div className="ed-fill">
      <OnomaPicker ids={fill.onomatopoeiaIds || []}
                   onChange={(ids) => set({ onomatopoeiaIds: ids })}
                   onomaItems={onomaItems}
                   slotLabel={(i, total) => total > 1
                     ? `iter ${i + 1}, ${i + 1 + total}, ${i + 1 + total * 2}…`
                     : 'todas las iteraciones'} />
      <div className="ed-fill-options">
        <div className="ed-fill-opt-row">
          <label className="ed-fill-check">
            <input type="checkbox" checked={hasSay}
                   onChange={(e) => set({ sayText: e.target.checked ? (fill.sayText || 'fill') : '' })} />
            <span>Voz dice</span>
          </label>
          <input className="input" value={fill.sayText || ''}
                 placeholder='ej. "ataca", "redoble"'
                 disabled={!hasSay}
                 onChange={(e) => set({ sayText: e.target.value })} />
        </div>
        <label className="ed-fill-check">
          <input type="checkbox" checked={!!fill.singSyllables}
                 onChange={(e) => set({ singSyllables: e.target.checked })} />
          <span>Cantar el groove (TTS lee las sílabas)</span>
        </label>
        <label className="ed-fill-check">
          <input type="checkbox" checked={fill.muteClick !== false}
                 onChange={(e) => set({ muteClick: e.target.checked })} />
          <span>Silenciar metrónomo en el compás del fill</span>
        </label>
        <div className="ed-fill-opt-row">
          <label className="label" style={{ margin: 0, alignSelf: 'center' }}>Aviso previo</label>
          <div className="seg" style={{ maxWidth: 200 }}>
            {[1, 2].map((n) => (
              <button key={n} className={`seg-btn${(fill.leadBars || 1) === n ? ' on' : ''}`}
                      onClick={() => set({ leadBars: n })}>{n} compás{n > 1 ? 'es' : ''}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PhraseEditor({ phrase, index, total, onChange, onMove, onDuplicate, onDelete, onomaItems }) {
  const set = (patch) => onChange({ ...phrase, ...patch });
  const totalBars = phrase.bars * phrase.repeat;
  return (
    <div className="ed-phrase-card">
      <div className="ed-phrase-card-head">
        <span className="ed-phrase-letter">{String.fromCharCode(65 + index)}</span>
        <input className="input ed-phrase-name"
               placeholder="(sin nombre)"
               value={phrase.name || ''}
               onChange={(e) => set({ name: e.target.value })} />
        <div className="ed-phrase-card-tools">
          <button className="btn icon ghost" disabled={index === 0}
                  onClick={() => onMove(index, index - 1)} title="Subir">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 15l-6-6-6 6"/></svg>
          </button>
          <button className="btn icon ghost" disabled={index === total - 1}
                  onClick={() => onMove(index, index + 1)} title="Bajar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          <button className="btn icon ghost" onClick={onDuplicate} title="Duplicar frase">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="8" y="8" width="12" height="12"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>
          </button>
          <button className="btn icon danger" onClick={onDelete} title="Eliminar frase">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
        </div>
      </div>
      <div className="ed-phrase-card-row">
        <div className="ed-phrase-stat">
          <label className="label">Compases por frase</label>
          <input className="input num-mono" type="number" min="1" max="32"
                 value={phrase.bars}
                 onChange={(e) => set({ bars: Math.max(1, Math.min(32, Number(e.target.value) || 1)) })} />
        </div>
        <span className="ed-phrase-times num-mono">×</span>
        <div className="ed-phrase-stat">
          <label className="label">Repeticiones</label>
          <input className="input num-mono" type="number" min="1" max="32"
                 value={phrase.repeat}
                 onChange={(e) => set({ repeat: Math.max(1, Math.min(32, Number(e.target.value) || 1)) })} />
        </div>
        <span className="ed-phrase-eq">=</span>
        <div className="ed-phrase-stat">
          <label className="label">Total</label>
          <div className="num-mono ed-phrase-total">{totalBars} comp.</div>
        </div>
      </div>
      {totalBars <= 64 && (
        <div className="ed-phrase-preview" style={{ '--total': totalBars }}>
          {Array.from({ length: totalBars }).map((_, i) => {
            const inIter = i % phrase.bars;
            const isFill = phrase.fill && inIter === phrase.bars - 1;
            const isStart = inIter === 0;
            const iterNum = Math.floor(i / phrase.bars);
            return (
              <span key={i}
                    className={`ed-phrase-bar${isFill ? ' fill' : ''}${isStart ? ' start' : ''}`}
                    title={`Iteración ${iterNum + 1} · compás ${inIter + 1}/${phrase.bars}`}>
                {isStart && phrase.repeat > 1 && (
                  <span className="ed-phrase-bar-num num-mono">{iterNum + 1}</span>
                )}
              </span>
            );
          })}
        </div>
      )}
      <label className="ed-phrase-fill-toggle">
        <input type="checkbox" checked={!!phrase.fill}
               onChange={(e) => set({ fill: e.target.checked ? window.BBData.blankFill() : undefined })} />
        <span>Fill al final de cada repetición</span>
      </label>
      {phrase.fill && (
        <FillEditor fill={phrase.fill}
                    onChange={(f) => set({ fill: f })}
                    onomaItems={onomaItems} />
      )}
    </div>
  );
}

function SectionEditor({ section, index, total, collapsed, onToggleCollapse, onChange, onDelete, onMove, onDuplicate, onomaItems }) {
  const setSection = (patch) => onChange({ ...section, ...patch });
  const cue = section.endCue || {};
  const setCue = (patch) => setSection({ endCue: { ...cue, ...patch } });
  const color = window.BBData.getColor(section.color || 'orange');
  const phrases = section.phrases || [];
  const totalBars = window.BBData.sectionBars(section);
  const hasFill = phrases.some((p) => p.fill);

  const updatePhrase = (p) => setSection({
    phrases: phrases.map((x) => x.id === p.id ? p : x),
  });
  const movePhrase = (from, to) => {
    if (to < 0 || to >= phrases.length) return;
    const next = phrases.slice();
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    setSection({ phrases: next });
  };
  const duplicatePhrase = (i) => {
    const copy = JSON.parse(JSON.stringify(phrases[i]));
    copy.id = window.BBData.uid();
    if (copy.name) copy.name = copy.name + ' (copia)';
    const next = phrases.slice();
    next.splice(i + 1, 0, copy);
    setSection({ phrases: next });
  };
  const deletePhrase = (id) => {
    if (phrases.length <= 1) { alert('Una sección necesita al menos una frase'); return; }
    setSection({ phrases: phrases.filter((p) => p.id !== id) });
  };
  const addPhrase = () => setSection({
    phrases: [...phrases, { ...window.BBData.blankPhrase(), id: window.BBData.uid() }],
  });

  return (
    <div className={`ed-section${collapsed ? ' is-collapsed' : ''}`}
         style={{ '--c-ink': color.ink, '--c-tint': color.tint, '--c-border': color.border }}>
      <div className="ed-section-head">
        <button className="btn icon ghost ed-section-collapse"
                onClick={onToggleCollapse}
                title={collapsed ? 'Desplegar' : 'Plegar'}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2"
               style={{ transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform .15s' }}>
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>
        <span className="ed-section-num num-mono">{String(index + 1).padStart(2, '0')}</span>
        <input className="input ed-section-title" value={section.name}
               placeholder="Nombre de la sección"
               onChange={(e) => setSection({ name: e.target.value })} />
        <div className="ed-section-colors">
          {SECTION_COLORS.map((c) => (
            <button key={c} type="button" title={c}
                    className={`ed-color-dot${section.color === c ? ' on' : ''}`}
                    style={{ background: window.BBData.getColor(c).ink }}
                    onClick={() => setSection({ color: c })} />
          ))}
        </div>
        <div className="ed-section-tools">
          <button className="btn icon ghost" disabled={index === 0}
                  onClick={() => onMove(index, index - 1)} title="Subir">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 15l-6-6-6 6"/></svg>
          </button>
          <button className="btn icon ghost" disabled={index === total - 1}
                  onClick={() => onMove(index, index + 1)} title="Bajar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          <button className="btn icon ghost" onClick={onDuplicate} title="Duplicar sección">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="8" y="8" width="12" height="12"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>
          </button>
          <button className="btn icon danger" onClick={() => onDelete(section.id)} title="Eliminar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
        </div>
      </div>

      <div className="ed-section-stats">
        <span className="num-mono"><b>{totalBars}</b> compases totales</span>
        <span className="ed-dot" />
        <span className="num-mono">{phrases.length} {phrases.length === 1 ? 'frase' : 'frases'}</span>
        {hasFill && <><span className="ed-dot" /><span className="ed-section-stats-pill fill">FILL</span></>}
        {section.endCue?.type === 'stop' && <><span className="ed-dot" /><span className="ed-section-stats-pill stop">PARADA</span></>}
      </div>

      {!collapsed && (<>
      <div className="ed-section-subdiv">
        <label className="label">Subdivisión del metrónomo (override)</label>
        <div className="seg ed-subdiv">
          <button className={`seg-btn${!section.subdivision ? ' on' : ''}`}
                  onClick={() => setSection({ subdivision: undefined })}
                  title="Hereda el ajuste de la canción">
            <span className="ed-subdiv-glyph">—</span>
            <span className="ed-subdiv-name">canción</span>
          </button>
          {SUBDIV_OPTS.map((s) => (
            <button key={s.value} className={`seg-btn${section.subdivision === s.value ? ' on' : ''}`}
                    onClick={() => setSection({ subdivision: s.value })}>
              <span className="ed-subdiv-glyph">{s.label}</span>
              <span className="ed-subdiv-name">{s.sub}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="ed-phrases-head">
        <span className="label">Frases</span>
      </div>
      <div className="ed-phrase-list">
        {phrases.map((p, i) => (
          <PhraseEditor key={p.id} phrase={p} index={i} total={phrases.length}
                        onChange={updatePhrase}
                        onMove={movePhrase}
                        onDuplicate={() => duplicatePhrase(i)}
                        onDelete={() => deletePhrase(p.id)}
                        onomaItems={onomaItems} />
        ))}
      </div>
      <button className="btn ed-add ed-add-phrase" onClick={addPhrase}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
        Añadir frase
      </button>

      <div className="ed-endcue">
        <div className="ed-endcue-head">
          <span className="label">Aviso al final de la sección</span>
        </div>
        <div className="ed-endcue-grid">
          <div>
            <label className="label sub">Tipo</label>
            <div className="seg">
              {CUE_TYPES.map((t) => (
                <button key={t.value}
                        className={`seg-btn${cue.type === t.value ? ' on' : ''}`}
                        onClick={() => setCue({ type: t.value })}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label sub">Voz dice</label>
            <input className="input" value={cue.say || ''}
                   placeholder='ej. "estribillo"'
                   onChange={(e) => setCue({ say: e.target.value })} />
          </div>
          <div>
            <label className="label sub">Aviso previo</label>
            <div className="seg">
              {[1, 2, 4].map((n) => (
                <button key={n} className={`seg-btn${(cue.leadBars || 2) === n ? ' on' : ''}`}
                        onClick={() => setCue({ leadBars: n })}>{n}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
      </>)}
    </div>
  );
}

function Editor({ song, onChange, onDone, onCancel, onPlay, onomaItems }) {
  const set = (patch) => onChange({ ...song, ...patch });
  // Collapsed sections — Set of section IDs that are currently folded.
  // Lives in component state (not persisted) so it resets per editor session.
  const [collapsedIds, setCollapsedIds] = React.useState(() => new Set());
  const isCollapsed = (id) => collapsedIds.has(id);
  const toggleCollapsed = (id) => setCollapsedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allCollapsed = song.sections.length > 0
    && song.sections.every((s) => collapsedIds.has(s.id));
  const toggleAll = () => {
    if (allCollapsed) setCollapsedIds(new Set());
    else setCollapsedIds(new Set(song.sections.map((s) => s.id)));
  };
  const setSection = (sec) => set({
    sections: song.sections.map((s) => s.id === sec.id ? sec : s),
  });
  const deleteSection = (id) => {
    if (song.sections.length <= 1) { alert('Una canción necesita al menos una sección'); return; }
    set({ sections: song.sections.filter((s) => s.id !== id) });
  };
  const moveSection = (from, to) => {
    if (to < 0 || to >= song.sections.length) return;
    const next = song.sections.slice();
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    set({ sections: next });
  };
  const duplicateSection = (i) => {
    const copy = JSON.parse(JSON.stringify(song.sections[i]));
    copy.id = window.BBData.uid();
    if (copy.phrases) copy.phrases.forEach((p) => { p.id = window.BBData.uid(); });
    copy.name = (copy.name || 'Sección') + ' (copia)';
    const next = song.sections.slice();
    next.splice(i + 1, 0, copy);
    set({ sections: next });
  };
  const addSection = () => {
    const used = song.sections.map((s) => s.color);
    const nextColor = SECTION_COLORS.find((c) => !used.includes(c)) || 'orange';
    set({
      sections: [
        ...song.sections,
        { id: window.BBData.uid(), name: 'Nueva sección', color: nextColor,
          phrases: [{ id: window.BBData.uid(), bars: 4, repeat: 1 }],
          endCue: { type: 'change', say: '', leadBars: 2 } },
      ],
    });
  };

  const totalBars = window.BBData.totalBars(song);
  const minutes = Math.round((totalBars * song.beatsPerBar / song.bpm) * 10) / 10;

  return (
    <div className="page editor">
      <div className="page-head">
        <button className="btn ghost" onClick={onCancel}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Biblioteca
        </button>
        <div className="page-actions">
          <button className="btn" onClick={() => onPlay(song.id)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            Probar
          </button>
          <button className="btn primary" onClick={onDone}>Hecho</button>
        </div>
      </div>

      <div className="ed-head">
        <input className="input ed-title" value={song.title}
               onChange={(e) => set({ title: e.target.value })}
               placeholder="Título de la canción" />
        <input className="input ed-artist" value={song.artist || ''}
               onChange={(e) => set({ artist: e.target.value })}
               placeholder="Artista" />
      </div>

      <div className="ed-meta">
        <div className="ed-meta-field">
          <label className="label">BPM</label>
          <input className="input num-mono ed-bpm" type="number" min="20" max="300"
                 value={song.bpm}
                 onChange={(e) => set({ bpm: Math.max(20, Math.min(300, Number(e.target.value) || 100)) })} />
        </div>
        <div className="ed-meta-field">
          <label className="label">Compás</label>
          <div className="seg">
            {[3, 4, 6, 7].map((n) => (
              <button key={n} className={`seg-btn${song.beatsPerBar === n ? ' on' : ''}`}
                      onClick={() => set({ beatsPerBar: n })}>{n}/4</button>
            ))}
          </div>
        </div>
        <div className="ed-meta-field">
          <label className="label">Subdivisión por defecto</label>
          <div className="seg ed-subdiv">
            {SUBDIV_OPTS.map((s) => (
              <button key={s.value} className={`seg-btn${song.subdivision === s.value ? ' on' : ''}`}
                      onClick={() => set({ subdivision: s.value })}
                      title={s.sub}>
                <span className="ed-subdiv-glyph">{s.label}</span>
                <span className="ed-subdiv-name">{s.sub}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="ed-meta-summary">
          <span className="num-mono"><b>{totalBars}</b> compases</span>
          <span className="ed-dot" />
          <span className="num-mono">~{minutes} min</span>
          <span className="ed-dot" />
          <span className="num-mono">{song.sections.length} secciones</span>
          <button className="btn ghost ed-collapse-all" type="button" onClick={toggleAll}
                  title={allCollapsed ? 'Desplegar todas las secciones' : 'Plegar todas las secciones'}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2"
                 style={{ transform: allCollapsed ? 'rotate(-90deg)' : 'none' }}>
              <path d="M6 9l6 6 6-6"/>
            </svg>
            {allCollapsed ? 'Desplegar todas' : 'Plegar todas'}
          </button>
        </div>
      </div>

      <div className="ed-sections">
        {song.sections.map((s, i) => (
          <SectionEditor key={s.id} section={s} index={i} total={song.sections.length}
                         collapsed={isCollapsed(s.id)}
                         onToggleCollapse={() => toggleCollapsed(s.id)}
                         onChange={setSection}
                         onDelete={deleteSection}
                         onMove={moveSection}
                         onDuplicate={() => duplicateSection(i)}
                         onomaItems={onomaItems} />
        ))}
      </div>

      <button className="btn ed-add" onClick={addSection}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
        Añadir sección
      </button>
    </div>
  );
}

Object.assign(window, { Editor });
