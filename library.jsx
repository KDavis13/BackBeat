/* Library — "Canciones" home, redesigned as a SongCard grid (drum-machine
 * cockpit). Keeps the existing play/edit/delete/import/export wiring. */

const { Icon: RDIcon, IC: RDIC, RD_CH, RD_CH_KEYS, Avatar: RDAvatar, SyncBadge } = window.RD;

/* Derive a per-song channel color: first section's color if it maps to a
 * channel hue, otherwise cycle the palette so the grid stays varied. */
function songColor(song, idx) {
  const c = song.sections?.[0]?.color;
  if (c && RD_CH[c]) return RD_CH[c];
  return RD_CH[RD_CH_KEYS[idx % RD_CH_KEYS.length]];
}

function SongCard({ song, idx, onPlay, onEdit, onDelete }) {
  const [menu, setMenu] = React.useState(false);
  const c = songColor(song, idx);
  const totalBars = window.BBData.totalBars(song);
  const minutes = Math.round((totalBars * song.beatsPerBar / song.bpm) * 10) / 10;
  const nSec = song.sections.length;

  return (
    <div className="panel brushed" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ width: 4, alignSelf: 'stretch', background: c, boxShadow: `0 0 8px ${c}` }} />
        <button onClick={() => onPlay(song.id)}
          style={{ appearance: 'none', border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit', minWidth: 0, flex: 1, padding: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.title || 'Sin título'}</div>
          <div style={{ fontSize: 11.5, color: 'var(--rd-text-mut)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.artist || '—'}</div>
        </button>
        <button className="btn icon ghost" style={{ width: 30, height: 30, flexShrink: 0 }}
          onClick={() => setMenu((m) => !m)} title="Más">
          <RDIcon d={RDIC.dots} size={16} />
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="chip mono" style={{ fontSize: 10 }}>{song.bpm} BPM</span>
        <span className="chip" style={{ fontSize: 10 }}>{nSec} {nSec === 1 ? 'sección' : 'secciones'}</span>
        <span className="chip mono" style={{ fontSize: 10 }}>~{minutes} min</span>
        <button className="btn primary" style={{ marginLeft: 'auto', padding: '6px 12px', fontSize: 11 }}
          onClick={() => onPlay(song.id)}>
          <RDIcon d={RDIC.play} size={13} fill="currentColor" /> Tocar
        </button>
      </div>

      {menu && (
        <React.Fragment>
          <div onClick={() => setMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
          <div className="panel" style={{ position: 'absolute', top: 44, right: 12, zIndex: 31, padding: 6, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 150 }}>
            <button className="btn ghost" style={{ justifyContent: 'flex-start', border: 0, boxShadow: 'none' }}
              onClick={() => { setMenu(false); onEdit(song.id); }}>
              <RDIcon d={RDIC.edit} size={14} /> Editar
            </button>
            <button className="btn ghost" style={{ justifyContent: 'flex-start', border: 0, boxShadow: 'none', color: 'var(--rd-danger)' }}
              onClick={() => { setMenu(false); onDelete(song.id); }}>
              <RDIcon d={RDIC.trash} size={14} /> Eliminar
            </button>
          </div>
        </React.Fragment>
      )}
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
    <React.Fragment>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '20px 24px',
        borderBottom: '1px solid #000', boxShadow: '0 1px 0 var(--rd-edge-hi)', flexShrink: 0,
        background: 'linear-gradient(180deg,var(--rd-panel-2),var(--rd-panel))' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.025em' }}>Canciones</div>
          <div className="eng" style={{ marginTop: 3 }}>Tu repertorio para el ensayo</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={handleImport} />
          <button className="btn ghost icon" onClick={() => fileRef.current?.click()} title="Importar JSON">
            <RDIcon d={RDIC.upload} size={16} />
          </button>
          <button className="btn ghost icon" onClick={onExport} title="Exportar JSON">
            <RDIcon d={RDIC.download} size={16} />
          </button>
          <button className="btn primary" onClick={onNew}>
            <RDIcon d={RDIC.plus} size={16} /> Nueva canción
          </button>
          <span className="chip sync"><span className="led on" style={{ '--c': 'var(--rd-cyan)', width: 7, height: 7 }} /> Sincronizado · hace 2 min</span>
          <RDAvatar />
        </div>
      </div>

      {/* Grid */}
      <div className="rd-scroll" style={{ padding: 24 }}>
        <div className="rd-song-grid">
          {songs.map((s, i) => (
            <SongCard key={s.id} song={s} idx={i}
                      onPlay={onPlay} onEdit={onEdit} onDelete={onDelete} />
          ))}
          <button onClick={onNew} className="panel" style={{ appearance: 'none', cursor: 'pointer', font: 'inherit',
            padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
            border: '1px dashed var(--rd-hair-strong)', color: 'var(--rd-text-mut)', minHeight: 120 }}>
            <RDIcon d={RDIC.plus} size={22} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Crear canción con tus grooves</span>
          </button>
        </div>
        {songs.length === 0 && (
          <div className="eng" style={{ marginTop: 20, textAlign: 'center' }}>Sin canciones aún · crea una o importa un JSON</div>
        )}
      </div>
    </React.Fragment>
  );
}

Object.assign(window, { Library });
