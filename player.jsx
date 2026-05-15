/* Player — practice screen with section sidebar, subdivisions and
 * onomatopoeia playback.
 *
 * The metronome emits sub-events at the song's subdivision. We only "advance"
 * the per-bar state on quarter-note beats (isQuarter true). When we enter the
 * last bar of a section with an attached onomatopoeia, we schedule its
 * percussion hits at exact audio times and drive a step counter for the
 * synced syllable overlay.
 */

function usePlayerEngine(song, onomaItems, tweaks) {
  const countIn = Math.max(0, Math.min(4, Number(tweaks?.countIn ?? 0)));
  const initial = () => ({
    running: false,
    sectionIdx: 0,
    barInSection: 0,
    beatInBar: 0,
    subOfBeat: 0,
    totalBeat: 0,
    barsLeft: 0,
    cueActive: false,
    countingIn: false,
    countInBarsLeft: 0,
    onomaActive: false,
    onomaId: null,
    onomaStep: -1,
  });
  const [state, setState] = React.useState(initial);
  const [bpm, setBpm] = React.useState(song.bpm);
  const metroRef = React.useRef(null);
  const phaseRef = React.useRef({ lastTime: 0, beatDur: 0 });
  const ttsFiredRef = React.useRef(new Set()); // unique trigger keys we've already announced
  const onomaScheduledRef = React.useRef(-1);          // sectionIdx for which onoma hits were scheduled
  const onomaBarStartRef = React.useRef(0);            // audio time of onoma bar start
  const beatPhaseRef = React.useRef(0);
  // true until the song has actually started — used to apply count-in only
  // on the first play / after a restart, not when resuming from pause.
  const freshStartRef = React.useRef(true);
  const [, forceRender] = React.useState(0);

  const schedule = React.useMemo(() => {
    const arr = [];
    song.sections.forEach((s, sIdx) => {
      for (let b = 0; b < s.bars; b++) arr.push({ sectionIdx: sIdx, barInSection: b });
    });
    return arr;
  }, [song]);
  const totalBars = schedule.length;
  const onomaById = React.useMemo(() => {
    const m = new Map();
    (onomaItems || []).forEach((o) => m.set(o.id, o));
    return m;
  }, [onomaItems]);

  React.useEffect(() => { setBpm(song.bpm); }, [song.id]);

  // Absolute quarter-note beat indices to play with the sharper "accentStrong"
  // click — every quarter beat inside any section's last `leadBars` bars.
  const accentBeatSet = React.useMemo(() => {
    const acc = new Set();
    let absBeat = 0;
    song.sections.forEach((s) => {
      const lead = s.endCue?.leadBars ?? 2;
      const startBar = Math.max(0, s.bars - lead);
      for (let b = startBar; b < s.bars; b++) {
        for (let q = 0; q < song.beatsPerBar; q++) {
          acc.add(absBeat + b * song.beatsPerBar + q);
        }
      }
      absBeat += s.bars * song.beatsPerBar;
    });
    return acc;
  }, [song]);

  React.useEffect(() => {
    const m = new window.Metronome();
    metroRef.current = m;
    m.setBeatsPerBar(song.beatsPerBar);
    m.setSubdivision(song.subdivision || 1);
    m.setBpm(bpm);
    m.setAccentBeats(accentBeatSet);
    ttsFiredRef.current = new Set();
    freshStartRef.current = true;

    const unsub = m.subscribe((ev) => {
      if (ev.type !== 'beat') return;
      const totalSub = ev.sub;
      const totalBeat = ev.beat;
      const totalBarNum = Math.floor(totalBeat / song.beatsPerBar);
      const subOfBeat = ev.subOfBeat;
      if (totalBarNum >= totalBars) { m.stop(); setState((s) => ({ ...s, running: false })); return; }

      // Count-in phase: totalBeat is negative. Tick the metronome, show the
      // remaining bars in the player-now, but don't touch any section state.
      if (totalBarNum < 0) {
        const countInBarsLeft = -totalBarNum;
        const ciBeatInBar = ((totalBeat % song.beatsPerBar) + song.beatsPerBar) % song.beatsPerBar;
        phaseRef.current.lastTime = performance.now();
        phaseRef.current.beatDur = (60 / m.bpm) * 1000;
        setState({
          running: true, countingIn: true, countInBarsLeft,
          sectionIdx: 0, barInSection: 0, beatInBar: ciBeatInBar, subOfBeat,
          totalBeat, barsLeft: song.sections[0].bars - 1,
          cueActive: false, accent: false,
          onomaActive: false, onomaId: null, onomaStep: -1,
        });
        return;
      }
      freshStartRef.current = false;
      const beatInBar = totalBeat % song.beatsPerBar;
      const { sectionIdx, barInSection } = schedule[totalBarNum];
      const section = song.sections[sectionIdx];
      const barsLeft = section.bars - barInSection - 1;
      const leadBars = section.endCue?.leadBars ?? 2;
      const cueActive = barsLeft < leadBars;

      // Per-section subdivision override. Realign the metronome at every
      // quarter-beat boundary where the wanted subdivision differs from the
      // current one. We just fired sub=0 of the current beat — the next event
      // should be sub=1 under the new subdivision, one new-sub-duration later.
      const wantedSub = (section.subdivision != null) ? section.subdivision : (song.subdivision || 1);
      if (ev.isQuarter && wantedSub !== m.subdivision) {
        const newSubDur = (60 / m.bpm) / wantedSub;
        m.subdivision = wantedSub;
        m.subIndex = ev.beat * wantedSub + 1;
        m.nextTime = ev.time + newSubDur;
      }
      const subdivision = m.subdivision;

      // accent quarter beats during cue zone (drives BeatViz color)
      const accent = cueActive && ev.isQuarter;

      // TTS fires at the moment of action, not as a pre-warning. The audible
      // pre-warning is the metronome pitching up on the cue zone's accentBeats;
      // the visual cues do the rest.
      //   'change' say (e.g. "estrofa") — first beat of the section it names.
      //   'fill' / 'stop' say          — first beat of the last bar of the
      //                                   current section (when it begins).
      if (ev.isQuarter && beatInBar === 0) {
        if (barInSection === 0 && sectionIdx > 0) {
          const prev = song.sections[sectionIdx - 1];
          const key = `change:${sectionIdx}`;
          if (prev?.endCue?.type === 'change' && prev.endCue.say
              && !ttsFiredRef.current.has(key)) {
            ttsFiredRef.current.add(key);
            m.say(prev.endCue.say);
          }
        }
        if (barsLeft === 0 && section.endCue?.say
            && section.endCue.type === 'fill') {
          const key = `last:${sectionIdx}`;
          if (!ttsFiredRef.current.has(key)) {
            ttsFiredRef.current.add(key);
            m.say(section.endCue.say);
          }
        }
      }
      if (!cueActive && onomaScheduledRef.current === sectionIdx) {
        onomaScheduledRef.current = -1;
      }

      // Onomatopoeia — when entering the LAST bar of a section with one,
      // schedule its hits at exact audio times.
      const onoma = section.endCue?.onomatopoeiaId ? onomaById.get(section.endCue.onomatopoeiaId) : null;
      const isLastBar = barsLeft === 0;
      if (cueActive && onoma && isLastBar && ev.isQuarter && beatInBar === 0
          && onomaScheduledRef.current !== sectionIdx) {
        onomaScheduledRef.current = sectionIdx;
        onomaBarStartRef.current = ev.time;
        const barDur = (60 / m.bpm) * song.beatsPerBar;
        onoma.hits.forEach((h) => {
          const offset = (h.step / onoma.resolution) * barDur;
          m.schedulePerc(ev.time + offset, h.sound, h.velocity);
        });
      }

      // Update onoma step from current sub position within the bar (for UI)
      let onomaStep = -1;
      const onomaActive = !!onoma && isLastBar && cueActive;
      if (onomaActive) {
        const subsInBar = subdivision * song.beatsPerBar;
        const subWithinBar = (beatInBar * subdivision) + subOfBeat;
        onomaStep = Math.floor((subWithinBar / subsInBar) * onoma.resolution);
      }

      phaseRef.current.lastTime = performance.now();
      phaseRef.current.beatDur = (60 / m.bpm) * 1000;

      setState({
        running: true,
        countingIn: false, countInBarsLeft: 0,
        sectionIdx, barInSection, beatInBar, subOfBeat,
        totalBeat, barsLeft, cueActive, accent,
        onomaActive, onomaId: onoma?.id || null, onomaStep,
      });
    });

    return () => { unsub(); m.stop(); };
  }, [song, schedule, totalBars, onomaById]);

  React.useEffect(() => {
    if (metroRef.current) metroRef.current.setBpm(bpm);
  }, [bpm]);

  // smooth beat-phase ticker (for timeline viz)
  React.useEffect(() => {
    let raf;
    const loop = () => {
      const { lastTime, beatDur } = phaseRef.current;
      if (state.running && beatDur > 0) {
        const dt = performance.now() - lastTime;
        beatPhaseRef.current = Math.max(0, Math.min(1, dt / beatDur));
        forceRender((n) => (n + 1) % 1000);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [state.running]);

  const play = async () => {
    if (!metroRef.current) return;
    // Count-in only on the very first play of a fresh / restarted session.
    const wantCountIn = freshStartRef.current && countIn > 0 && state.totalBeat === 0;
    const startBeat = wantCountIn ? -countIn * song.beatsPerBar : state.totalBeat;
    const subdivision = startBeat < 0 ? 1 : (song.subdivision || 1);
    await metroRef.current.start({
      bpm, beatsPerBar: song.beatsPerBar, subdivision,
      startBeat,
    });
    setState((s) => ({ ...s, running: true }));
  };
  const pause = () => {
    if (!metroRef.current) return;
    metroRef.current.stop();
    setState((s) => ({ ...s, running: false }));
  };
  const restart = async () => {
    pause();
    ttsFiredRef.current = new Set();
    onomaScheduledRef.current = -1;
    freshStartRef.current = true;
    setState({
      running: false, countingIn: false, countInBarsLeft: 0,
      sectionIdx: 0, barInSection: 0, beatInBar: 0, subOfBeat: 0,
      totalBeat: 0, barsLeft: 0, cueActive: false, accent: false,
      onomaActive: false, onomaId: null, onomaStep: -1,
    });
    await new Promise((r) => setTimeout(r, 60));
    const startBeat = countIn > 0 ? -countIn * song.beatsPerBar : 0;
    const subdivision = startBeat < 0 ? 1 : (song.subdivision || 1);
    await metroRef.current.start({
      bpm, beatsPerBar: song.beatsPerBar, subdivision,
      startBeat,
    });
    setState((s) => ({ ...s, running: true }));
  };
  const jumpToBar = async (totalBarNum) => {
    const wasRunning = state.running;
    if (metroRef.current) metroRef.current.stop();
    ttsFiredRef.current = new Set();
    onomaScheduledRef.current = -1;
    freshStartRef.current = false;
    const startBeat = totalBarNum * song.beatsPerBar;
    const { sectionIdx, barInSection } = schedule[totalBarNum] || { sectionIdx: 0, barInSection: 0 };
    setState((s) => ({
      ...s, running: false,
      sectionIdx, barInSection, beatInBar: 0, subOfBeat: 0,
      totalBeat: startBeat, barsLeft: song.sections[sectionIdx].bars - barInSection - 1,
      cueActive: false, accent: false,
      onomaActive: false, onomaId: null, onomaStep: -1,
    }));
    if (wasRunning) {
      await new Promise((r) => setTimeout(r, 60));
      await metroRef.current.start({
        bpm, beatsPerBar: song.beatsPerBar, subdivision: song.subdivision || 1,
        startBeat,
      });
      setState((s) => ({ ...s, running: true }));
    }
  };
  const jumpToSection = (sectionIdx) => jumpToBar(window.BBData.sectionStartBar(song, sectionIdx));

  const section = song.sections[state.sectionIdx] || song.sections[0];
  const nextSection = song.sections[state.sectionIdx + 1];
  return {
    ...state, bpm, setBpm, play, pause, restart, jumpToBar, jumpToSection,
    section, nextSection, beatPhase: beatPhaseRef.current,
    onomaItem: state.onomaId ? onomaById.get(state.onomaId) : null,
    schedule,
  };
}

function SectionSidebar({ song, eng, collapsed, onToggle }) {
  return (
    <aside className={`pl-sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="pl-sidebar-head">
        <span className="label">Secciones</span>
        <span className="num-mono pl-sidebar-count">{song.sections.length}</span>
      </div>
      <div className="pl-sidebar-list">
        {song.sections.map((s, i) => {
          const color = window.BBData.getColor(s.color || 'orange');
          const isCur = i === eng.sectionIdx;
          const isDone = i < eng.sectionIdx;
          const startBar = window.BBData.sectionStartBar(song, i);
          return (
            <div key={s.id}
                 className={`pl-sec${isCur ? ' on' : ''}${isDone ? ' done' : ''}`}
                 style={{ '--c-ink': color.ink, '--c-tint': color.tint, '--c-border': color.border }}>
              <button className="pl-sec-main" onClick={() => eng.jumpToSection(i)}>
                <span className="pl-sec-stripe" />
                <div className="pl-sec-text">
                  <div className="pl-sec-row">
                    <span className="pl-sec-num num-mono">{String(i + 1).padStart(2, '0')}</span>
                    <span className="pl-sec-name">{s.name}</span>
                  </div>
                  <div className="pl-sec-meta">
                    <span className="num-mono">{s.bars} compases</span>
                    {s.endCue?.type === 'fill' && <span className="pl-sec-pill fill">FILL</span>}
                    {s.endCue?.type === 'stop' && <span className="pl-sec-pill stop">PARADA</span>}
                  </div>
                </div>
              </button>
              {/* Per-bar mini grid for jumping to a specific bar */}
              <div className="pl-sec-bars" style={{ '--bars': s.bars }}>
                {Array.from({ length: s.bars }).map((_, b) => {
                  const isCurBar = isCur && b === eng.barInSection;
                  const isPlayed = isDone || (isCur && b < eng.barInSection);
                  return (
                    <button key={b} className={`pl-bar${isCurBar ? ' on' : ''}${isPlayed ? ' played' : ''}`}
                            onClick={() => eng.jumpToBar(startBar + b)}
                            title={`Comp. ${b + 1}`}>
                      {isCurBar && <span className="pl-bar-pip" />}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function OnomaOverlay({ onoma, currentStep, beatsPerBar }) {
  if (!onoma) return null;
  const stepsPerBeat = onoma.resolution / beatsPerBar;
  // gather syllables in order of step
  const syllables = [];
  const seenSteps = new Set();
  onoma.hits
    .slice().sort((a, b) => a.step - b.step)
    .forEach((h) => {
      if (seenSteps.has(h.step)) return;
      seenSteps.add(h.step);
      if (h.text) syllables.push({ step: h.step, text: h.text });
    });
  return (
    <div className="onoma-overlay">
      <div className="onoma-overlay-head">FILL · {onoma.name}</div>
      <div className="onoma-overlay-syllables">
        {syllables.map((s, i) => {
          const active = s.step === currentStep;
          const past = s.step < currentStep;
          return (
            <span key={i} className={`onoma-syl${active ? ' on' : ''}${past ? ' past' : ''}`}>
              {s.text}
            </span>
          );
        })}
      </div>
      <div className="onoma-overlay-track" style={{ '--steps': onoma.resolution }}>
        {Array.from({ length: onoma.resolution }).map((_, i) => {
          const isBeat = i % stepsPerBeat === 0;
          const has = onoma.hits.some((h) => h.step === i);
          return (
            <span key={i}
                  className={`onoma-track-step${isBeat ? ' beat' : ''}${has ? ' has' : ''}${i === currentStep ? ' on' : ''}`} />
          );
        })}
      </div>
    </div>
  );
}

function Player({ song, onomaItems, onBack, tweaks }) {
  const eng = usePlayerEngine(song, onomaItems, tweaks);
  const beatViz = tweaks?.beatViz || 'dots';
  const cueMode = tweaks?.cueMode || 'banner';
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [sheetOpen, setSheetOpen] = React.useState(false);

  const sectionProgress = Math.min(100, ((eng.barInSection + 1) / eng.section.bars) * 100);
  const sectionColor = window.BBData.getColor(eng.section.color || 'orange');

  const showBigNumbers = cueMode === 'big-numbers' && eng.cueActive
    && eng.barsLeft <= 1;
  const bigNumber = Math.max(1, eng.barsLeft + 1);
  const screenTint = cueMode === 'screen-tint' && eng.cueActive;
  const nextGlow = cueMode === 'next-glow' && eng.cueActive;
  const banner = cueMode === 'banner' && eng.cueActive;

  return (
    <div className={`player has-sidebar${screenTint ? ' tint' : ''}${eng.cueActive ? ' cue-on' : ''}${sidebarOpen ? '' : ' sidebar-closed'}`}
         style={{ '--c-section': sectionColor.ink }}>
      <div className="player-bar">
        <button className="btn ghost icon" onClick={onBack} title="Volver">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <button className="btn ghost icon pl-sidebar-toggle" onClick={() => setSidebarOpen((v) => !v)} title="Secciones">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h12M3 18h18"/></svg>
        </button>
        <div className="player-title">
          <span className="player-song">{song.title}</span>
          {song.artist && <span className="player-artist">{song.artist}</span>}
        </div>
        <div className="player-progress">
          {song.sections.map((s, i) => {
            const c = window.BBData.getColor(s.color || 'orange');
            return (
              <span key={s.id}
                    className={`pp-seg${i === eng.sectionIdx ? ' on' : ''}${i < eng.sectionIdx ? ' done' : ''}`}
                    style={{ flex: s.bars, '--c-ink': c.ink }}
                    onClick={() => eng.jumpToSection(i)}
                    title={s.name}>
                {i === eng.sectionIdx && (
                  <span className="pp-fill" style={{ width: `${sectionProgress}%` }} />
                )}
              </span>
            );
          })}
        </div>
        {/* mobile sheet trigger */}
        <button className="btn ghost icon pl-sheet-btn" onClick={() => setSheetOpen(true)} title="Lista">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
        </button>
      </div>

      {banner && (
        <div className="cue-banner">
          <span className="cue-banner-eye"><span className="cue-pulse" /></span>
          <span className="cue-banner-text">
            {eng.section.endCue?.type === 'fill' ? 'FILL' :
             eng.section.endCue?.type === 'stop' ? 'PARADA' : 'CAMBIO'}
            <span className="cue-banner-in"> en </span>
            <b className="num-mono">{eng.barsLeft + 1}</b>
            <span className="cue-banner-in"> {eng.barsLeft === 0 ? 'compás' : 'compases'}</span>
          </span>
          {eng.section.endCue?.say && !eng.onomaActive && (
            <span className="cue-banner-say">"{eng.section.endCue.say}"</span>
          )}
        </div>
      )}

      <div className="player-shell">
        {sidebarOpen && (
          <SectionSidebar song={song} eng={eng} />
        )}

        <div className="player-main">
          <div className="player-grid">
            <div className={`player-now${eng.countingIn ? ' countin' : ''}`}>
              {eng.countingIn ? (
                <>
                  <div className="player-now-label">CUENTA DE ENTRADA</div>
                  <div className="player-now-name num-mono">{eng.countInBarsLeft}</div>
                  <div className="player-now-bars">
                    <span className="player-now-unit">
                      {eng.countInBarsLeft === 1 ? 'compás para empezar' : 'compases para empezar'}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="player-now-label">
                    <span className="player-now-dot" style={{ background: sectionColor.ink }} />
                    AHORA · sección {eng.sectionIdx + 1}/{song.sections.length}
                  </div>
                  <div className="player-now-name">{eng.section.name}</div>
                  <div className="player-now-bars">
                    <span className="num-mono player-now-cur">{eng.barInSection + 1}</span>
                    <span className="player-now-slash">/</span>
                    <span className="num-mono player-now-tot">{eng.section.bars}</span>
                    <span className="player-now-unit">compases</span>
                  </div>
                </>
              )}
            </div>

            <div className="player-viz">
              {eng.onomaActive && eng.onomaItem ? (
                <OnomaOverlay onoma={eng.onomaItem} currentStep={eng.onomaStep}
                              beatsPerBar={song.beatsPerBar} />
              ) : (
                <window.BeatViz mode={beatViz} beatsPerBar={song.beatsPerBar}
                                currentBeat={eng.beatInBar} accent={eng.accent}
                                beatPhase={eng.beatPhase} />
              )}
            </div>

            <div className={`player-next${nextGlow && !eng.countingIn ? ' glow' : ''}${eng.cueActive && !eng.countingIn ? ' active' : ''}`}>
              {eng.countingIn ? (
                <>
                  <div className="player-next-label">
                    EMPIEZA EN
                    <span className="player-next-countdown num-mono">
                      {eng.countInBarsLeft} {eng.countInBarsLeft === 1 ? 'compás' : 'compases'}
                    </span>
                  </div>
                  <div className="player-next-name">{song.sections[0].name}</div>
                  <div className="player-next-meta">
                    <span className="num-mono">{song.sections[0].bars} compases</span>
                  </div>
                </>
              ) : (<>
              <div className="player-next-label">
                {eng.cueActive ? 'EN' : 'PRÓXIMO'}
                {eng.cueActive && (
                  <span className="player-next-countdown num-mono">
                    {eng.barsLeft + 1} {eng.barsLeft === 0 ? 'compás' : 'compases'}
                  </span>
                )}
              </div>
              {eng.nextSection ? (
                <>
                  <div className="player-next-name">{eng.nextSection.name}</div>
                  <div className="player-next-meta">
                    <span className="num-mono">{eng.nextSection.bars} compases</span>
                    {eng.section.endCue?.type === 'fill' && (
                      <span className="player-next-pill fill">FILL antes</span>
                    )}
                    {eng.section.endCue?.type === 'stop' && (
                      <span className="player-next-pill stop">PARADA</span>
                    )}
                    {eng.section.endCue?.say && !eng.onomaActive && (
                      <span className="player-next-say">"{eng.section.endCue.say}"</span>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="player-next-name dim">— fin de la canción —</div>
                  <div className="player-next-meta">
                    {eng.section.endCue?.say && (
                      <span className="player-next-say">"{eng.section.endCue.say}"</span>
                    )}
                  </div>
                </>
              )}
              </>)}
            </div>
          </div>

          {showBigNumbers && !eng.onomaActive && (
            <div className="big-numbers" key={`big-${eng.barsLeft}`}>
              <div className="big-numbers-n">{bigNumber}</div>
              <div className="big-numbers-lbl">
                {eng.section.endCue?.say ?
                  `"${eng.section.endCue.say}"` :
                  (eng.barsLeft === 0 ? 'último compás' : 'compases')}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile bottom sheet */}
      {sheetOpen && (
        <div className="pl-sheet" onClick={() => setSheetOpen(false)}>
          <div className="pl-sheet-panel" onClick={(e) => e.stopPropagation()}>
            <div className="pl-sheet-bar">
              <span className="label">Secciones</span>
              <button className="btn icon ghost" onClick={() => setSheetOpen(false)}>✕</button>
            </div>
            <SectionSidebar song={song} eng={{ ...eng,
              jumpToSection: (i) => { eng.jumpToSection(i); setSheetOpen(false); },
              jumpToBar: (b) => { eng.jumpToBar(b); setSheetOpen(false); },
            }} />
          </div>
        </div>
      )}

      <div className="player-controls">
        <div className="player-bpm">
          <span className="label">BPM · {(() => {
            const sd = eng.section.subdivision != null ? eng.section.subdivision : (song.subdivision || 1);
            return sd === 1 ? 'negras' :
                   sd === 2 ? 'corcheas' :
                   sd === 3 ? 'tresillos' :
                   'semicorcheas';
          })()}</span>
          <div className="bpm-stepper">
            <button className="btn icon ghost" onClick={() => eng.setBpm(Math.max(20, eng.bpm - 1))}>−</button>
            <div className="bpm-value num-mono">{eng.bpm}</div>
            <button className="btn icon ghost" onClick={() => eng.setBpm(Math.min(300, eng.bpm + 1))}>+</button>
          </div>
          <input type="range" min="40" max="220" value={eng.bpm} className="bpm-slider"
                 onChange={(e) => eng.setBpm(Number(e.target.value))} />
        </div>
        <div className="player-transport">
          <button className="btn ghost" onClick={eng.restart} title="Reiniciar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
          </button>
          {eng.running ? (
            <button className="btn play-btn pause" onClick={eng.pause}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>
            </button>
          ) : (
            <button className="btn primary play-btn" onClick={eng.play}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Player });
