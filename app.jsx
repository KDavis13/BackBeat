/* App — root, routing, tweaks. */

function App() {
  const [songs, setSongs] = React.useState(() => window.BBData.loadSongs());
  const [onoma, setOnoma] = React.useState(() => window.BBData.loadOnoma());
  const [view, setView] = React.useState({ name: 'library' });
  const [t, setTweak] = window.useTweaks(window.TWEAK_DEFAULTS);

  React.useEffect(() => { window.BBData.saveSongs(songs); }, [songs]);
  React.useEffect(() => { window.BBData.saveOnoma(onoma); }, [onoma]);

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

  // Onomatopoeia handlers
  const onOnomaChange = (p) => setOnoma(onoma.map((x) => x.id === p.id ? p : x));
  const onOnomaAdd = () => setOnoma([window.BBData.blankOnoma(), ...onoma]);
  const onOnomaDelete = (id) => {
    if (!confirm('¿Eliminar este patrón?')) return;
    setOnoma(onoma.filter((p) => p.id !== id));
  };

  const renderView = () => {
    if (view.name === 'player') {
      const song = findSong(view.songId);
      if (!song) { setView({ name: 'library' }); return null; }
      return <window.Player song={song} onomaItems={onoma} tweaks={t}
                            onBack={() => setView({ name: 'library' })} />;
    }
    if (view.name === 'editor') {
      const song = findSong(view.songId);
      if (!song) { setView({ name: 'library' }); return null; }
      return <window.Editor song={song} onChange={onSongChange} onomaItems={onoma}
                            onDone={() => setView({ name: 'library' })}
                            onCancel={() => setView({ name: 'library' })}
                            onPlay={onPlay} />;
    }
    if (view.name === 'onoma') {
      return <window.OnomaScreen items={onoma}
                                 onChange={onOnomaChange}
                                 onAdd={onOnomaAdd}
                                 onDelete={onOnomaDelete} />;
    }
    return <window.Library songs={songs} onPlay={onPlay} onEdit={onEdit}
                           onNew={onNew} onDelete={onDelete}
                           onImport={onImport} onExport={onExport} />;
  };

  const isPlayer = view.name === 'player';

  return (
    <div className="app">
      {!isPlayer && (
        <div className="topbar">
          <div className="brand">
            <span className="brand-mark" />
            <span>BackBeat</span>
            <span className="brand-tag">guía para baterías</span>
          </div>
          <div className="tabs">
            <button className="tab" data-on={view.name === 'library' ? '1' : '0'}
                    onClick={() => setView({ name: 'library' })}>Biblioteca</button>
            <button className="tab" data-on={view.name === 'editor' ? '1' : '0'}
                    onClick={() => {
                      if (view.name !== 'editor') {
                        const last = songs[0];
                        if (last) setView({ name: 'editor', songId: last.id });
                      }
                    }}>Editor</button>
            <button className="tab" data-on={view.name === 'onoma' ? '1' : '0'}
                    onClick={() => setView({ name: 'onoma' })}>Onomatopeyas</button>
          </div>
        </div>
      )}
      <div className="content">{renderView()}</div>

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
      </window.TweaksPanel>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
