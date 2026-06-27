/* App — root, routing, tweaks. Redesign shell: NavRail (desktop/tablet) +
 * NavTabs (mobile), drum-machine "cockpit" theme. Inner screens are reached
 * through the new nav and get reskinned in later passes. */

const { NavRail, NavTabs, Icon, IC } = window.RD;

/* nav id ↔ view mapping */
const NAV_FOR_VIEW = {
  library: 'songs', editor: 'songs', player: 'songs',
  onoma: 'grooves', practice: 'practice', learn: 'learn',
};

function LearnPlaceholder() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 28, textAlign: 'center', color: 'var(--rd-text-mut)' }}>
      <div style={{ color: 'var(--ch-violet)', filter: 'drop-shadow(0 0 10px var(--ch-violet))' }}>
        <Icon d={IC.book} size={40} />
      </div>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--rd-text)' }}>Aprende</div>
        <div className="eng" style={{ marginTop: 6 }}>Tutorial · próximamente</div>
      </div>
      <p style={{ maxWidth: 340, fontSize: 13, lineHeight: 1.5 }}>
        Onboarding, ayuda contextual y centro de aprendizaje llegan en una próxima entrega.
      </p>
    </div>
  );
}

function App() {
  const [songs, setSongs] = React.useState(() => window.BBData.loadSongs());
  const [onoma, setOnoma] = React.useState(() => window.BBData.loadOnoma());
  const [folders, setFolders] = React.useState(() => window.BBData.loadFolders());
  const [view, setView] = React.useState({ name: 'library' });
  const [t, setTweak] = window.useTweaks(window.TWEAK_DEFAULTS);

  React.useEffect(() => { window.BBData.saveSongs(songs); }, [songs]);
  React.useEffect(() => { window.BBData.saveOnoma(onoma); }, [onoma]);
  React.useEffect(() => { window.BBData.saveFolders(folders); }, [folders]);

  const findSong = (id) => songs.find((s) => s.id === id);

  const onPlay = (id) => setView({ name: 'player', songId: id });
  const onEdit = (id) => setView({ name: 'editor', songId: id });
  const onNew = () => {
    const s = window.BBData.blankSong();
    setSongs([s, ...songs]);
    setView({ name: 'editor', songId: s.id });
  };
  const onDelete = (id) => {
    if (!confirm('¿Eliminar esta canción?')) return;
    setSongs(songs.filter((s) => s.id !== id));
  };
  const onSongChange = (s) => setSongs(songs.map((x) => x.id === s.id ? s : x));
  const onImport = (parsed) => {
    const list = Array.isArray(parsed) ? parsed : [parsed];
    const cleaned = list.map((s) => ({
      ...s, id: s.id || window.BBData.uid(),
      sections: (s.sections || []).map((sec) => ({ ...sec, id: sec.id || window.BBData.uid() })),
    }));
    setSongs([...cleaned, ...songs]);
  };
  const onExport = () => {
    const data = { songs, onomatopoeias: onoma };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'backbeat-export.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Onomatopoeia (groove) handlers
  const onOnomaChange = (p) => setOnoma(onoma.map((x) => x.id === p.id ? p : x));
  const onOnomaDelete = (id) => {
    if (!confirm('¿Eliminar este groove?')) return;
    setOnoma(onoma.filter((p) => p.id !== id));
    // also strip from any folder it lived in
    setFolders((fs) => fs.map((f) => f.grooveIds.includes(id)
      ? { ...f, grooveIds: f.grooveIds.filter((g) => g !== id) } : f));
  };

  // Folder handlers
  const onFolderAdd = () => setFolders([...folders, window.BBData.blankFolder(folders)]);
  const onFolderRename = (id, name) =>
    setFolders(folders.map((f) => f.id === id ? { ...f, name } : f));
  const onFolderDelete = (id) => setFolders(folders.filter((f) => f.id !== id));
  const onMoveGroove = (grooveId, folderId) => {
    setFolders((fs) => fs.map((f) => {
      const has = f.grooveIds.includes(grooveId);
      if (f.id === folderId && !has) return { ...f, grooveIds: [...f.grooveIds, grooveId] };
      if (f.id !== folderId && has) return { ...f, grooveIds: f.grooveIds.filter((g) => g !== grooveId) };
      return f;
    }));
  };
  // Create a (caller-built) blank groove and optionally drop it in a folder.
  const onCreateGroove = (groove, folderId) => {
    setOnoma([groove, ...onoma]);
    if (folderId) setFolders((fs) => fs.map((f) =>
      f.id === folderId ? { ...f, grooveIds: [...f.grooveIds, groove.id] } : f));
  };

  // top-level nav: only routes between the four destinations; sub-views
  // (editor/player) are reached from within the songs destination.
  const navigate = (id) => {
    if (id === 'songs') setView({ name: 'library' });
    else if (id === 'grooves') setView({ name: 'onoma' });
    else if (id === 'practice') setView({ name: 'practice' });
    else if (id === 'learn') setView({ name: 'learn' });
  };

  const renderView = () => {
    if (view.name === 'editor') {
      const song = findSong(view.songId);
      if (!song) { setView({ name: 'library' }); return null; }
      return <window.Editor song={song} onChange={onSongChange} onomaItems={onoma}
                            onDone={() => setView({ name: 'library' })}
                            onCancel={() => setView({ name: 'library' })}
                            onPlay={onPlay} />;
    }
    if (view.name === 'onoma') {
      return <window.GroovesLibrary items={onoma} folders={folders}
                                    onFolderAdd={onFolderAdd}
                                    onFolderRename={onFolderRename}
                                    onFolderDelete={onFolderDelete}
                                    onMoveGroove={onMoveGroove}
                                    onCreateGroove={onCreateGroove}
                                    onGrooveChange={onOnomaChange}
                                    onGrooveDelete={onOnomaDelete} />;
    }
    if (view.name === 'practice') {
      return <window.Practice onomaItems={onoma}
                              openOnomaScreen={() => setView({ name: 'onoma' })} />;
    }
    if (view.name === 'learn') {
      return <LearnPlaceholder />;
    }
    return <window.Library songs={songs} onPlay={onPlay} onEdit={onEdit}
                           onNew={onNew} onDelete={onDelete}
                           onImport={onImport} onExport={onExport} />;
  };

  // Player is full-bleed (it owns its own chrome) — no shell rail/tabs.
  if (view.name === 'player') {
    const song = findSong(view.songId);
    if (!song) { setView({ name: 'library' }); return null; }
    return (
      <div className="app rd">
        <window.Player song={song} onomaItems={onoma} tweaks={t}
                       onBack={() => setView({ name: 'library' })} />
        <Tweaks t={t} setTweak={setTweak} />
      </div>
    );
  }

  const navId = NAV_FOR_VIEW[view.name] || 'songs';

  return (
    <div className="app rd">
      <div className="rd-shell">
        <NavRail active={navId} onNavigate={navigate} wide />
        <main className="rd-main">
          {renderView()}
        </main>
        <NavTabs active={navId} onNavigate={navigate} />
      </div>
      <Tweaks t={t} setTweak={setTweak} />
    </div>
  );
}

/* TweaksPanel kept verbatim — extracted so both layouts can render it. */
function Tweaks({ t, setTweak }) {
  return (
    <window.TweaksPanel title="Tweaks">
      <window.TweakSection label="Player — visualización del beat">
        <window.TweakSelect label="Modo" value={t.beatViz}
          options={[
            { value: 'dots',     label: '4 puntos grandes' },
            { value: 'circle',   label: 'Círculo pulsante' },
            { value: 'timeline', label: 'Timeline horizontal' },
          ]}
          onChange={(v) => setTweak('beatViz', v)} />
      </window.TweakSection>
      <window.TweakSection label="Aviso de cambio (últimos compases)">
        <window.TweakSelect label="Modo" value={t.cueMode}
          options={[
            { value: 'banner',       label: 'Banner arriba' },
            { value: 'next-glow',    label: 'Próximo bloque brilla' },
            { value: 'screen-tint',  label: 'Pantalla tinte ámbar' },
            { value: 'big-numbers',  label: 'Números enormes' },
          ]}
          onChange={(v) => setTweak('cueMode', v)} />
      </window.TweakSection>
      <window.TweakSection label="Cuenta de entrada">
        <window.TweakSelect label="Compases antes de empezar"
          value={String(t.countIn ?? 0)}
          options={[
            { value: '0', label: 'Sin cuenta' },
            { value: '1', label: '1 compás' },
            { value: '2', label: '2 compases' },
            { value: '3', label: '3 compases' },
            { value: '4', label: '4 compases' },
          ]}
          onChange={(v) => setTweak('countIn', Number(v))} />
      </window.TweakSection>
    </window.TweaksPanel>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
