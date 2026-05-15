/* Library — songs list, import/export, new. */

function LibraryRow({ song, onPlay, onEdit, onDelete }) {
  const totalBars = window.BBData.totalBars(song);
  const minutes = Math.round((totalBars * song.beatsPerBar / song.bpm) * 10) / 10;
  return (
    <div className="lib-row">
      <button className="lib-row-main" onClick={() => onPlay(song.id)}>
        <div className="lib-row-title">
          <span className="lib-row-name">{song.title}</span>
          {song.artist && <span className="lib-row-artist">{song.artist}</span>}
        </div>
        <div className="lib-row-meta">
          <span className="num-mono"><b>{song.bpm}</b> BPM</span>
          <span className="lib-dot" />
          <span className="num-mono">{song.sections.length} sec.</span>
          <span className="lib-dot" />
          <span className="num-mono">~{minutes} min</span>
        </div>
        <div className="lib-row-sections">
          {song.sections.map((s, i) => (
            <span key={s.id} className="lib-chip" style={{ '--w': `${s.bars}` }}>
              <span className="lib-chip-name">{s.name}</span>
              <span className="lib-chip-bars num-mono">{s.bars}</span>
            </span>
          ))}
        </div>
      </button>
      <div className="lib-row-actions">
        <button className="btn icon" onClick={() => onEdit(song.id)} title="Editar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
        </button>
        <button className="btn icon danger" onClick={() => onDelete(song.id)} title="Eliminar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        </button>
        <button className="btn primary" onClick={() => onPlay(song.id)}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          Tocar
        </button>
      </div>
    </div>
  );
}

function Library({ songs, onPlay, onEdit, onNew, onDelete, onImport, onExport }) {
  const fileRef = React.useRef(null);
  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const parsed = JSON.parse(r.result);
        onImport(parsed);
      } catch (err) { alert('JSON inválido'); }
    };
    r.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="page lib">
      <div className="page-head">
        <div>
          <h1 className="page-title">Biblioteca</h1>
          <p className="page-sub">{songs.length} {songs.length === 1 ? 'canción' : 'canciones'} guardadas</p>
        </div>
        <div className="page-actions">
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={handleImport} />
          <button className="btn ghost" onClick={() => fileRef.current?.click()}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
            Importar JSON
          </button>
          <button className="btn ghost" onClick={onExport}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            Exportar
          </button>
          <button className="btn primary" onClick={onNew}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
            Nueva
          </button>
        </div>
      </div>

      <div className="lib-list">
        {songs.length === 0 && (
          <div className="empty-state">Sin canciones aún. Crea una o importa un JSON.</div>
        )}
        {songs.map((s) => (
          <LibraryRow key={s.id} song={s}
                      onPlay={onPlay} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { Library });
