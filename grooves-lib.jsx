/* Grooves · biblioteca con carpetas (rediseño). Reemplaza a OnomaScreen como
 * destino "Grooves". Lista grooves reales agrupados en carpetas + preview del
 * patrón; editar reutiliza el OnomaEditorPanel existente (con su audio). */

const { Icon, IC, RD_CH, RD_CH_KEYS, chColor, useIsMobile, NavTabs, TopBar, Logo } = window.RD;

const FOLDER = 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z';
const FOLDER_OPEN = ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2', 'M3 9h18l-2 9a2 2 0 0 1-2 1.7H5A2 2 0 0 1 3 18z'];

/* stable accent color per groove id */
function grooveColor(id) {
  let h = 0;
  for (let i = 0; i < (id || '').length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return RD_CH[RD_CH_KEYS[h % RD_CH_KEYS.length]];
}

const CYMBALS = new Set(['hat', 'crash', 'ride']);
const KICKS = new Set(['kick']);
/* bucket a groove's hits into 3 rows (cymbals / snare+toms / kick) × 8 cols */
function grooveRows(groove) {
  const rows = [Array(8).fill(0), Array(8).fill(0), Array(8).fill(0)];
  (groove.hits || []).forEach((h) => {
    const frac = window.BBData.grooveOffsetInBar(groove, h.step);
    const col = Math.min(7, Math.max(0, Math.floor(frac * 8)));
    const row = CYMBALS.has(h.sound) ? 0 : KICKS.has(h.sound) ? 2 : 1;
    rows[row][col] = 1;
  });
  return rows;
}

function GroovePreview({ groove, w = 'auto' }) {
  const colors = ['var(--ch-lime)', 'var(--ch-gold)', 'var(--ch-orange)'];
  const rows = grooveRows(groove);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, width: w }}>
      {rows.map((r, ri) => (
        <div key={ri} style={{ display: 'flex', gap: 2 }}>
          {r.map((on, i) => (
            <span key={i} style={{ flex: 1, height: 7, minWidth: 4,
              background: on ? colors[ri] : 'var(--rd-ink)',
              boxShadow: on ? `0 0 5px ${colors[ri]}` : 'inset 0 1px 1px rgba(0,0,0,.6)' }} />
          ))}
        </div>
      ))}
    </div>
  );
}

function grooveMeta(groove) {
  const voices = new Set((groove.hits || []).map((h) => h.sound)).size;
  const cells = window.BBData.grooveTotalCells(groove);
  return `${voices} ${voices === 1 ? 'voz' : 'voces'} · ${cells}`;
}

/* ── Groove card with dots menu (Editar / Mover a… / Eliminar) ── */
function GrooveCard({ groove, folders, currentFolderId, onEdit, onMove, onDelete }) {
  const [menu, setMenu] = React.useState(false);
  const [moveOpen, setMoveOpen] = React.useState(false);
  const c = grooveColor(groove.id);
  const close = () => { setMenu(false); setMoveOpen(false); };
  const moveTargets = [{ id: null, name: 'Sin clasificar' },
    ...folders.map((f) => ({ id: f.id, name: f.name }))]
    .filter((t) => t.id !== currentFolderId);

  return (
    <div className="panel brushed" style={{ padding: 13, display: 'flex', flexDirection: 'column', gap: 10, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 4, height: 18, background: c, boxShadow: `0 0 6px ${c}` }} />
        <button onClick={() => onEdit(groove.id)}
          style={{ appearance: 'none', border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit', color: 'inherit', textAlign: 'left',
          fontWeight: 700, fontSize: 14, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: 0 }}>
          {groove.name || 'Sin nombre'}
        </button>
        <button onClick={() => setMenu((m) => !m)} title="Más"
          style={{ appearance: 'none', border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--rd-text-faint)', padding: 2, lineHeight: 0 }}>
          <Icon d={IC.dots} size={15} />
        </button>
      </div>
      <button onClick={() => onEdit(groove.id)} style={{ appearance: 'none', border: 0, background: 'transparent', cursor: 'pointer', padding: 0, display: 'block', width: '100%' }}>
        <GroovePreview groove={groove} />
      </button>
      <div className="eng" style={{ fontSize: 8.5 }}>{grooveMeta(groove)}</div>

      {menu && (
        <React.Fragment>
          <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
          <div className="panel" style={{ position: 'absolute', top: 36, right: 10, zIndex: 31, padding: 6, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 168 }}>
            {!moveOpen ? (
              <React.Fragment>
                <button className="btn ghost" style={{ justifyContent: 'flex-start', border: 0, boxShadow: 'none' }}
                  onClick={() => { close(); onEdit(groove.id); }}>
                  <Icon d={IC.edit} size={14} /> Editar
                </button>
                <button className="btn ghost" style={{ justifyContent: 'flex-start', border: 0, boxShadow: 'none' }}
                  onClick={() => setMoveOpen(true)}>
                  <Icon d={FOLDER} size={14} /> Mover a…
                </button>
                <button className="btn ghost" style={{ justifyContent: 'flex-start', border: 0, boxShadow: 'none', color: 'var(--rd-danger)' }}
                  onClick={() => { close(); onDelete(groove.id); }}>
                  <Icon d={IC.trash} size={14} /> Eliminar
                </button>
              </React.Fragment>
            ) : (
              <React.Fragment>
                <div className="eng" style={{ fontSize: 8.5, padding: '4px 8px 6px' }}>Mover a</div>
                {moveTargets.map((t) => (
                  <button key={t.id || 'none'} className="btn ghost" style={{ justifyContent: 'flex-start', border: 0, boxShadow: 'none' }}
                    onClick={() => { close(); onMove(groove.id, t.id); }}>
                    <Icon d={t.id ? FOLDER : IC.grid} size={14} /> {t.name}
                  </button>
                ))}
              </React.Fragment>
            )}
          </div>
        </React.Fragment>
      )}
    </div>
  );
}

/* dashed "new groove here" tile */
function NewGrooveTile({ onClick, minHeight = 96 }) {
  return (
    <button onClick={onClick} className="panel" style={{ appearance: 'none', cursor: 'pointer', font: 'inherit',
      padding: 13, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
      border: '1px dashed var(--rd-hair-strong)', color: 'var(--rd-text-mut)', minHeight }}>
      <Icon d={IC.plus} size={20} /><span style={{ fontSize: 12, fontWeight: 600 }}>Nuevo groove aquí</span>
    </button>
  );
}

/* ── Library (folders + grid). `view` ∈ {all|none|<folderId>} ── */
function GroovesLibrary(props) {
  const { items, folders, onFolderAdd, onFolderRename, onFolderDelete,
    onMoveGroove, onCreateGroove, onGrooveChange, onGrooveDelete } = props;
  const isMobile = useIsMobile();
  const [view, setView] = React.useState('all');
  const [editingId, setEditingId] = React.useState(null);
  const [bpm, setBpm] = React.useState(100);

  const byId = React.useMemo(() => new Map(items.map((g) => [g.id, g])), [items]);
  const unclassified = window.BBData.unclassified(folders, items);
  const groovesIn = (v) => {
    if (v === 'all') return items;
    if (v === 'none') return unclassified;
    const f = folders.find((x) => x.id === v);
    return f ? f.grooveIds.map((id) => byId.get(id)).filter(Boolean) : [];
  };
  const countFor = (v) => groovesIn(v).length;
  const currentFolderId = (view === 'all' || view === 'none') ? null : view;
  const targetFolderForNew = currentFolderId; // 'all'/'none' → unclassified

  const createGroove = () => {
    const g = window.BBData.blankGroove();
    onCreateGroove(g, targetFolderForNew);
    setEditingId(g.id);
  };
  const renameFolder = (f) => {
    const name = window.prompt('Nombre de la carpeta', f.name);
    if (name != null && name.trim()) onFolderRename(f.id, name.trim());
  };
  const deleteFolder = (f) => {
    if (!confirm(`¿Eliminar la carpeta "${f.name}"? Sus grooves quedarán sin clasificar.`)) return;
    if (view === f.id) setView('all');
    onFolderDelete(f.id);
  };

  // ── Edit mode: the redesigned per-voice designer ──
  if (editingId) {
    const groove = byId.get(editingId);
    if (!groove) { setEditingId(null); return null; }
    return (
      <window.GrooveDesigner groove={groove} bpm={bpm} onBpmChange={setBpm}
        onBack={() => setEditingId(null)}
        onChange={onGrooveChange}
        onDelete={(id) => { onGrooveDelete(id); setEditingId(null); }} />
    );
  }

  const headerActions = (
    <React.Fragment>
      <button className="btn ghost" onClick={onFolderAdd}><Icon d={FOLDER} size={15} /> Nueva carpeta</button>
      <button className="btn primary" onClick={createGroove}><Icon d={IC.plus} size={15} /> Nuevo groove</button>
    </React.Fragment>
  );

  // ── Mobile: accordion of folders ──
  if (isMobile) {
    const sections = [
      ...folders.map((f) => ({ id: f.id, name: f.name, color: RD_CH[f.color], folder: f })),
      { id: 'none', name: 'Sin clasificar', color: RD_CH.violet, folder: null },
    ];
    // With no explicit selection, open the first section that has grooves so
    // the user lands on something instead of an all-collapsed list.
    const defaultOpen = (sections.find((s) => groovesIn(s.id).length > 0) || sections[sections.length - 1] || {}).id;
    return (
      <React.Fragment>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 16px 12px', flexShrink: 0 }}>
          <Logo size={24} />
          <span style={{ fontWeight: 800, fontSize: 19, letterSpacing: '-.02em' }}>Grooves</span>
          <button className="btn ghost" style={{ marginLeft: 'auto', padding: '7px 10px', fontSize: 12 }} onClick={onFolderAdd}>
            <Icon d={FOLDER} size={14} /> Carpeta
          </button>
        </div>
        <div className="rd-scroll" style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sections.map((s) => {
            const open = view === 'all' ? s.id === defaultOpen : view === s.id;
            const list = groovesIn(s.id);
            return (
              <div key={s.id} className="panel" style={{ overflow: 'hidden' }}>
                <div onClick={() => setView(open ? '' : s.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 14px', cursor: 'pointer',
                  borderBottom: open ? '1px solid var(--rd-hair)' : 'none' }}>
                  <Icon d={open ? FOLDER_OPEN : FOLDER} size={18} style={{ color: s.color }} />
                  <span style={{ fontSize: 14, fontWeight: 700, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--rd-text-mut)' }}>{list.length}</span>
                  {s.folder && (
                    <button onClick={(e) => { e.stopPropagation(); renameFolder(s.folder); }} title="Renombrar"
                      style={{ appearance: 'none', border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--rd-text-faint)', padding: 2, lineHeight: 0 }}>
                      <Icon d={IC.edit} size={13} />
                    </button>
                  )}
                  <Icon d={IC.chevR} size={15} style={{ color: 'var(--rd-text-faint)', transform: open ? 'rotate(90deg)' : 'none' }} />
                </div>
                {open && (
                  <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {list.map((g) => {
                      const gc = grooveColor(g.id);
                      return (
                        <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 6px' }}>
                          <span style={{ width: 4, height: 30, background: gc, boxShadow: `0 0 6px ${gc}` }} />
                          <button onClick={() => setEditingId(g.id)} style={{ appearance: 'none', border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit', color: 'inherit', textAlign: 'left', flex: 1, minWidth: 0, padding: 0 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.name || 'Sin nombre'}</div>
                            <div className="eng" style={{ fontSize: 8 }}>{grooveMeta(g)}</div>
                          </button>
                          <div style={{ width: 84 }}><GroovePreview groove={g} /></div>
                        </div>
                      );
                    })}
                    <button className="btn ghost" style={{ width: '100%', padding: 9, fontSize: 12 }}
                      onClick={() => { const g = window.BBData.blankOnoma(); onCreateGroove(g, s.folder ? s.folder.id : null); setEditingId(g.id); }}>
                      <Icon d={IC.plus} size={14} /> Groove en esta carpeta
                    </button>
                    {s.folder && (
                      <button className="btn ghost" style={{ width: '100%', padding: 9, fontSize: 12, color: 'var(--rd-danger)' }}
                        onClick={() => deleteFolder(s.folder)}>
                        <Icon d={IC.trash} size={14} /> Eliminar carpeta
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </React.Fragment>
    );
  }

  // ── Desktop/tablet: folder tree + grid ──
  const active = groovesIn(view);
  const activeFolder = folders.find((f) => f.id === view);
  const activeLabel = view === 'all' ? 'Todos los grooves' : view === 'none' ? 'Sin clasificar' : (activeFolder ? activeFolder.name : '');
  const activeColor = activeFolder ? RD_CH[activeFolder.color] : view === 'none' ? RD_CH.violet : 'var(--rd-led)';

  const TreeRow = ({ id, name, count, color, icon, folder }) => {
    const on = id === view;
    return (
      <div onClick={() => setView(id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', cursor: 'pointer',
        background: on ? 'rgba(255,122,26,.1)' : 'transparent', boxShadow: on ? 'inset 0 0 0 1px rgba(255,122,26,.25)' : 'none' }}>
        <Icon d={icon} size={16} style={{ color: color || 'var(--rd-text-dim)' }} />
        <span style={{ fontSize: 13, fontWeight: on ? 700 : 600, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: on ? 'var(--rd-text)' : 'var(--rd-text-dim)' }}>{name}</span>
        {folder && (
          <button onClick={(e) => { e.stopPropagation(); renameFolder(folder); }} title="Renombrar"
            style={{ appearance: 'none', border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--rd-text-faint)', padding: 1, lineHeight: 0 }}>
            <Icon d={IC.edit} size={12} />
          </button>
        )}
        <span className="mono" style={{ fontSize: 11, color: 'var(--rd-text-mut)' }}>{count}</span>
      </div>
    );
  };

  return (
    <React.Fragment>
      <TopBar title="Grooves" sub="Biblioteca · agrupados por carpeta" back={false} right={headerActions} />
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <aside style={{ width: 230, flexShrink: 0, borderRight: '1px solid #000', padding: 12, display: 'flex', flexDirection: 'column', gap: 4, background: 'var(--rd-case)', overflow: 'auto' }}>
          <TreeRow id="all" name="Todos los grooves" count={countFor('all')} icon={IC.grid} />
          <div style={{ height: 1, background: 'var(--rd-hair)', margin: '4px 0' }} />
          <div className="eng" style={{ fontSize: 8.5, padding: '2px 11px 4px' }}>Carpetas</div>
          {folders.map((f) => (
            <TreeRow key={f.id} id={f.id} name={f.name} count={countFor(f.id)}
              color={RD_CH[f.color]} icon={f.id === view ? FOLDER_OPEN : FOLDER} folder={f} />
          ))}
          <TreeRow id="none" name="Sin clasificar" count={countFor('none')} color={RD_CH.violet} icon={IC.grid} />
        </aside>
        <div className="rd-scroll" style={{ flex: 1, padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <Icon d={view === 'all' || view === 'none' ? IC.grid : FOLDER_OPEN} size={20} style={{ color: activeColor }} />
            <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.02em' }}>{activeLabel}</span>
            <span className="chip mono" style={{ fontSize: 10 }}>{active.length} grooves</span>
            {activeFolder && (
              <button className="btn ghost" style={{ padding: '5px 9px', fontSize: 11, color: 'var(--rd-danger)' }} onClick={() => deleteFolder(activeFolder)}>
                <Icon d={IC.trash} size={13} /> Eliminar carpeta
              </button>
            )}
            <span className="eng" style={{ marginLeft: 'auto', fontSize: 8.5, color: 'var(--rd-text-faint)' }}>usa el menú ⋯ de un groove para moverlo de carpeta</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14 }}>
            {active.map((g) => (
              <GrooveCard key={g.id} groove={g} folders={folders} currentFolderId={currentFolderId}
                onEdit={setEditingId} onMove={onMoveGroove} onDelete={onGrooveDelete} />
            ))}
            <NewGrooveTile onClick={createGroove} />
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}

Object.assign(window, { GroovesLibrary });
