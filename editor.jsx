/* Editor — form for sections + cues. */

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

const SECTION_COLORS = ['orange', 'coral', 'gold', 'magenta', 'lime', 'violet'];

function SectionEditor({ section, index, total, onChange, onDelete, onMove, onomaItems }) {
  const cue = section.endCue || {};
  const set = (patch) => onChange({ ...section, ...patch });
  const setCue = (patch) => onChange({ ...section, endCue: { ...cue, ...patch } });
  const color = window.BBData.getColor(section.color || 'orange');

  return (
    <div className="ed-section" style={{ '--c-ink': color.ink, '--c-tint': color.tint, '--c-border': color.border }}>
      <div className="ed-section-head">
        <span className="ed-section-num num-mono">{String(index + 1).padStart(2, '0')}</span>
        <input className="input ed-section-title" value={section.name}
               placeholder="Nombre de la sección"
               onChange={(e) => set({ name: e.target.value })} />
        <div className="ed-section-colors">
          {SECTION_COLORS.map((c) => (
            <button key={c} type="button" title={c}
                    className={`ed-color-dot${section.color === c ? ' on' : ''}`}
                    style={{ background: window.BBData.getColor(c).ink }}
                    onClick={() => set({ color: c })} />
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
          <button className="btn icon danger" onClick={() => onDelete(section.id)} title="Eliminar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
        </div>
      </div>

      <div className="ed-section-grid">
        <div>
          <label className="label">Compases</label>
          <input className="input num-mono" type="number" min="1" max="64"
                 value={section.bars}
                 onChange={(e) => set({ bars: Math.max(1, Number(e.target.value) || 1) })} />
        </div>
        <div>
          <label className="label">Aviso · tipo</label>
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
          <label className="label">Voz dice…</label>
          <input className="input" value={cue.say || ''}
                 placeholder='ej. "estribillo"'
                 onChange={(e) => setCue({ say: e.target.value })} />
        </div>
        <div>
          <label className="label">Compases de aviso</label>
          <div className="seg">
            {[1, 2, 4].map((n) => (
              <button key={n} className={`seg-btn${(cue.leadBars || 2) === n ? ' on' : ''}`}
                      onClick={() => setCue({ leadBars: n })}>{n}</button>
            ))}
          </div>
        </div>
      </div>

      {cue.type === 'fill' && (
        <div className="ed-section-fill">
          <label className="label">Onomatopeya (opcional)</label>
          <select className="select" value={cue.onomatopoeiaId || ''}
                  onChange={(e) => setCue({ onomatopoeiaId: e.target.value || undefined })}>
            <option value="">— ninguno (solo voz) —</option>
            {onomaItems.map((o) => (
              <option key={o.id} value={o.id}>{o.name} ({o.hits.length} golpes)</option>
            ))}
          </select>
        </div>
      )}

      <div className="ed-section-subdiv">
        <label className="label">Subdivisión (override en esta sección)</label>
        <div className="seg ed-subdiv">
          <button className={`seg-btn${!section.subdivision ? ' on' : ''}`}
                  onClick={() => set({ subdivision: undefined })}
                  title="Hereda el ajuste de la canción">
            <span className="ed-subdiv-glyph">—</span>
            <span className="ed-subdiv-name">canción</span>
          </button>
          {SUBDIV_OPTS.map((s) => (
            <button key={s.value} className={`seg-btn${section.subdivision === s.value ? ' on' : ''}`}
                    onClick={() => set({ subdivision: s.value })}>
              <span className="ed-subdiv-glyph">{s.label}</span>
              <span className="ed-subdiv-name">{s.sub}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Editor({ song, onChange, onDone, onCancel, onPlay, onomaItems }) {
  const set = (patch) => onChange({ ...song, ...patch });
  const setSection = (sec) => set({
    sections: song.sections.map((s) => s.id === sec.id ? sec : s),
  });
  const deleteSection = (id) => set({
    sections: song.sections.filter((s) => s.id !== id),
  });
  const moveSection = (from, to) => {
    if (to < 0 || to >= song.sections.length) return;
    const next = song.sections.slice();
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    set({ sections: next });
  };
  const addSection = () => {
    const usedColors = song.sections.map((s) => s.color);
    const nextColor = SECTION_COLORS.find((c) => !usedColors.includes(c)) || 'orange';
    set({
      sections: [
        ...song.sections,
        { id: window.BBData.uid(), name: 'Nueva sección', bars: 8, color: nextColor,
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
          <label className="label">Subdivisión del metrónomo</label>
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
        </div>
      </div>

      <div className="ed-sections">
        {song.sections.map((s, i) => (
          <SectionEditor key={s.id} section={s} index={i} total={song.sections.length}
                         onChange={setSection} onDelete={deleteSection} onMove={moveSection}
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
