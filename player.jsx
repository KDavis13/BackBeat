/* Player — practice screen with multi-phrase support.
 *
 * Schedule entries (built from data.buildSchedule):
 *   { sectionIdx, barInSection, phraseIdx, iterationIdx, iterationCount,
 *     barInIteration, iterationBars, isFillBar, fill, fillLeadActive, fillBarsLeft }
 *
 * On the fill bar of each iteration:
 *   - Pick onoma from fill.onomatopoeiaIds[iterationIdx % length] (rotates per iter)
 *   - Schedule percussion hits at exact audio times
 *   - If fill.muteClick → suppress metronome clicks for that bar
 *   - If fill.sayText → TTS the text (once)
 *   - If fill.singSyllables → TTS the joined syllables from the active onoma
 *
 * Section endCue is independent — its `say` plays in the lead zone announcing
 * the next section. It does NOT carry onomatopoeias anymore (those live on phrases).
 */

function usePlayerEngine(song, onomaItems, tweaks) {
  const countIn = Math.max(0, Math.min(4, Number(tweaks?.countIn ?? 0)));
  const initial = () => ({
    running: false,
    countingIn: false, countInBarsLeft: 0,
    sectionIdx: 0, barInSection: 0,
    beatInBar: 0, subOfBeat: 0,
    totalBeat: 0,
    barsLeftInSection: 0,
    endCueActive: false,
    accent: false,
    phraseIdx: -1, iterationIdx: -1, iterationCount: 0,
    barInIteration: 0, iterationBars: 0,
    fillBarsLeft: -1, fillLeadActive: false,
    isFillBar: false,
    activeOnomaId: null,
    activeOnomaStep: -1,
  });
  const [state, setState] = React.useState(initial);
  const [bpm, setBpm] = React.useState(song.bpm);
  const metroRef = React.useRef(null);
  const phaseRef = React.useRef({ lastTime: 0, beatDur: 0 });
  const endCueTtsRef = React.useRef(-1);            // sectionIdx for which endCue TTS fired
  const fillFiredRef = React.useRef('');            // last fill-bar key we scheduled
  const beatPhaseRef = React.useRef(0);
  // true until the song has actually started (first non-count-in beat)
  const freshStartRef = React.useRef(true);
  const [, forceRender] = React.useState(0);

  const schedule = React.useMemo(() => window.BBData.buildSchedule(song), [song]);
  const totalBars = schedule.length;
  const onomaById = React.useMemo(() => {
    const m = new Map();
    (onomaItems || []).forEach((o) => m.set(o.id, o));
    return m;
  }, [onomaItems]);

  // Section start bars (cached for jumping)
  const sectionStartBars = React.useMemo(() => {
    const out = [];
    let acc = 0;
    song.sections.forEach((s) => { out.push(acc); acc += window.BBData.sectionBars(s); });
    return out;
  }, [song]);
  const sectionBarsLen = React.useMemo(
    () => song.sections.map((s) => window.BBData.sectionBars(s)),
    [song]);

  // Absolute quarter-note beat indices that should be played with the sharper
  // accentStrong click — every beat in any cue lead zone:
  //   - phrase fill lead (last `fill.leadBars` bars of each iteration)
  //   - section endCue lead (last `endCue.leadBars` bars of the section)
  const accentBeatSet = React.useMemo(() => {
    const acc = new Set();
    let absBar = 0;
    schedule.forEach((entry) => {
      const section = song.sections[entry.sectionIdx];
      const sectionTotal = sectionBarsLen[entry.sectionIdx];
      const barsLeftInSection = sectionTotal - entry.barInSection - 1;
      const endLead = section.endCue?.leadBars || 2;
      const inEndCueLead = barsLeftInSection < endLead && !!section.endCue;
      if (inEndCueLead || entry.fillLeadActive) {
        for (let q = 0; q < song.beatsPerBar; q++) {
          acc.add(absBar * song.beatsPerBar + q);
        }
      }
      absBar++;
    });
    return acc;
  }, [schedule, song, sectionBarsLen]);

  React.useEffect(() => { setBpm(song.bpm); }, [song.id]);

  React.useEffect(() => {
    const m = new window.Metronome();
    metroRef.current = m;
    m.setBeatsPerBar(song.beatsPerBar);
    m.setSubdivision(song.subdivision || 1);
    m.setBpm(bpm);
    m.setAccentBeats(accentBeatSet);
    freshStartRef.current = true;

    const unsub = m.subscribe((ev) => {
      if (ev.type !== 'beat') return;
      const totalBeat = ev.beat;
      const totalBarNum = Math.floor(totalBeat / song.beatsPerBar);
      const beatInBar = totalBeat % song.beatsPerBar;
      const subOfBeat = ev.subOfBeat;
      if (totalBarNum >= totalBars) {
        m.stop();
        setState((s) => ({ ...s, running: false }));
        return;
      }

      // Count-in phase: totalBeat is negative. Tick the metronome (which
      // plays clean clicks because nothing is in _accentBeats for negative
      // beats), show remaining bars, but don't touch any section state.
      if (totalBarNum < 0) {
        const countInBarsLeft = -totalBarNum;
        const ciBeatInBar = ((totalBeat % song.beatsPerBar) + song.beatsPerBar) % song.beatsPerBar;
        phaseRef.current.lastTime = performance.now();
        phaseRef.current.beatDur = (60 / m.bpm) * 1000;
        setState({
          ...initial(),
          running: true,
          countingIn: true,
          countInBarsLeft,
          totalBeat,
          beatInBar: ciBeatInBar,
          subOfBeat,
        });
        return;
      }
      freshStartRef.current = false;
      const entry = schedule[totalBarNum];
      const section = song.sections[entry.sectionIdx];
      const sectionTotal = sectionBarsLen[entry.sectionIdx];
      const barsLeftInSection = sectionTotal - entry.barInSection - 1;
      const endCueLead = section.endCue?.leadBars || 2;
      const endCueActive = barsLeftInSection < endCueLead && section.endCue;

      // Per-section subdivision override
      const wantedSub = (section.subdivision != null)
        ? section.subdivision : (song.subdivision || 1);
      if (ev.isQuarter && wantedSub !== m.subdivision) {
        const newSubDur = (60 / m.bpm) / wantedSub;
        m.subdivision = wantedSub;
        m.subIndex = ev.beat * wantedSub + 1;
        m.nextTime = ev.time + newSubDur;
      }
      const subdivision = m.subdivision;
      const accent = (endCueActive || entry.fillLeadActive) && ev.isQuarter;

      // ── Fill bar firing ──────────────────────────────────────────────
      // Pick the onoma for THIS iteration. If onomatopoeiaIds is empty,
      // the fill still has other effects (sayText, muteClick) but no audio.
      let activeOnoma = null;
      if (entry.isFillBar && entry.fill) {
        const ids = entry.fill.onomatopoeiaIds || [];
        if (ids.length > 0) {
          const pick = ids[entry.iterationIdx % ids.length];
          activeOnoma = onomaById.get(pick) || null;
        }
      }

      const fillKey = entry.isFillBar
        ? `${entry.sectionIdx}-${entry.phraseIdx}-${entry.iterationIdx}`
        : '';

      // Schedule perc + TTS + muteClick once at downbeat of the fill bar.
      if (entry.isFillBar && entry.fill && ev.isQuarter && beatInBar === 0
          && fillFiredRef.current !== fillKey) {
        fillFiredRef.current = fillKey;
        const barDur = (60 / m.bpm) * song.beatsPerBar;
        if (activeOnoma) {
          // Schedule each hit at its exact fractional offset inside the
          // groove's bar — respects per-beat subdivisions (mixed negras /
          // corcheas / tresillos…) instead of assuming uniform spacing.
          const grooveBeats = window.BBData.grooveBeatsPerBar(activeOnoma);
          const grooveBarDur = (60 / m.bpm) * grooveBeats;
          activeOnoma.hits.forEach((h) => {
            const offset = window.BBData.grooveOffsetInBar(activeOnoma, h.step) * grooveBarDur;
            m.schedulePerc(ev.time + offset, h.sound, h.velocity);
          });
        }
        if (entry.fill.muteClick !== false) {
          m.suppressClick(ev.time - 0.005, barDur + 0.005);
        }
        // Voice cues at fill downbeat
        if (entry.fill.sayText) {
          m.say(entry.fill.sayText);
        }
        if (entry.fill.singSyllables && activeOnoma) {
          const text = activeOnoma.hits
            .slice().sort((a, b) => a.step - b.step)
            .map((h) => h.text).filter(Boolean).join(' ');
          if (text) m.say(text, { rate: 1.35 });
        }
      }
      if (!entry.isFillBar && fillFiredRef.current) {
        // moved past the fill bar — reset so re-entry (e.g. jump back) re-fires
        fillFiredRef.current = '';
      }

      // ── Section endCue TTS ─────────────────────────────────────────
      // 'change' say (e.g. "estrofa") fires at the first beat of the section
      //   it names — the audible pre-warning is the click pitching up during
      //   the cue lead zone; the voice is the moment of action.
      // 'stop' say is silent (no audio cue when the song just stops).
      // Fill TTS (above) is independent and fires at the start of the fill bar.
      if (ev.isQuarter && beatInBar === 0 && entry.barInSection === 0
          && entry.sectionIdx > 0) {
        const prev = song.sections[entry.sectionIdx - 1];
        if (prev?.endCue?.type === 'change' && prev.endCue.say
            && endCueTtsRef.current !== entry.sectionIdx) {
          endCueTtsRef.current = entry.sectionIdx;
          m.say(prev.endCue.say);
        }
      }

      // Step tracking for the overlay
      let activeOnomaStep = -1;
      if (activeOnoma) {
        // Fraction of the (song) bar elapsed → fraction of the groove bar →
        // closest cellIdx in the groove. Works for grooves with mixed
        // per-beat subdivisions.
        const subsInSongBar = subdivision * song.beatsPerBar;
        const subWithinSongBar = (beatInBar * subdivision) + subOfBeat;
        const fineRes = window.BBData.GROOVE_FINE_RES;
        const grooveBeats = window.BBData.grooveBeatsPerBar(activeOnoma);
        const fraction = subWithinSongBar / subsInSongBar;
        const fineInGroove = Math.floor(fraction * grooveBeats * fineRes);
        const exact = window.BBData.grooveCellAtFineStep(activeOnoma, fineInGroove, fineRes);
        if (exact >= 0) {
          activeOnomaStep = exact;
        } else {
          // Land on the previous cell so the syllable that's currently
          // sounding stays lit between exact hits.
          const totalCells = window.BBData.grooveTotalCells(activeOnoma);
          const approx = Math.floor(fraction * totalCells);
          activeOnomaStep = Math.max(0, Math.min(totalCells - 1, approx));
        }
      }

      phaseRef.current.lastTime = performance.now();
      phaseRef.current.beatDur = (60 / m.bpm) * 1000;

      setState({
        running: true,
        sectionIdx: entry.sectionIdx,
        barInSection: entry.barInSection,
        beatInBar, subOfBeat, totalBeat,
        barsLeftInSection,
        endCueActive, accent,
        phraseIdx: entry.phraseIdx,
        iterationIdx: entry.iterationIdx,
        iterationCount: entry.iterationCount,
        barInIteration: entry.barInIteration,
        iterationBars: entry.iterationBars,
        fillBarsLeft: entry.fillBarsLeft,
        fillLeadActive: entry.fillLeadActive,
        isFillBar: entry.isFillBar,
        activeOnomaId: activeOnoma?.id || null,
        activeOnomaStep,
      });
    });

    return () => { unsub(); m.stop(); };
  }, [song, schedule, totalBars, onomaById, sectionBarsLen]);

  React.useEffect(() => {
    if (metroRef.current) metroRef.current.setBpm(bpm);
  }, [bpm]);

  // smooth beat-phase ticker (timeline viz)
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

  // Screen Wake Lock — keep the phone awake while playing. iOS 16.4+ Safari,
  // Chrome / Edge. Silently no-ops on older browsers. The lock is released
  // by the system when the tab is hidden; reacquire on visibilitychange.
  React.useEffect(() => {
    let lock = null;
    let cancelled = false;
    const acquire = async () => {
      if (!('wakeLock' in navigator)) return;
      try {
        const l = await navigator.wakeLock.request('screen');
        if (cancelled) { l.release().catch(() => {}); return; }
        lock = l;
        l.addEventListener('release', () => { if (lock === l) lock = null; });
      } catch (e) { /* permission denied or not supported */ }
    };
    const release = () => {
      if (lock) { lock.release().catch(() => {}); lock = null; }
    };
    const onVis = () => {
      if (document.visibilityState === 'visible' && state.running) acquire();
    };
    if (state.running) acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      release();
    };
  }, [state.running]);

  const resetRefs = () => {
    endCueTtsRef.current = -1;
    fillFiredRef.current = '';
    if (metroRef.current) metroRef.current._suppressRanges = [];
  };

  const play = async () => {
    if (!metroRef.current) return;
    // Apply count-in only on the first play of a fresh / restarted session.
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
    resetRefs();
    freshStartRef.current = true;
    setState(initial());
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
    resetRefs();
    freshStartRef.current = false;
    const startBeat = totalBarNum * song.beatsPerBar;
    const entry = schedule[totalBarNum];
    if (!entry) return;
    setState({
      ...initial(),
      sectionIdx: entry.sectionIdx,
      barInSection: entry.barInSection,
      totalBeat: startBeat,
      barsLeftInSection: sectionBarsLen[entry.sectionIdx] - entry.barInSection - 1,
    });
    if (wasRunning) {
      await new Promise((r) => setTimeout(r, 60));
      await metroRef.current.start({
        bpm, beatsPerBar: song.beatsPerBar, subdivision: song.subdivision || 1,
        startBeat,
      });
      setState((s) => ({ ...s, running: true }));
    }
  };
  const jumpToSection = (sectionIdx) => jumpToBar(sectionStartBars[sectionIdx]);
  const jumpToPhrase = (sectionIdx, phraseIdx) => {
    let bar = sectionStartBars[sectionIdx];
    const s = song.sections[sectionIdx];
    if (s.phrases) {
      for (let i = 0; i < phraseIdx; i++) {
        bar += s.phrases[i].bars * s.phrases[i].repeat;
      }
    }
    jumpToBar(bar);
  };

  const section = song.sections[state.sectionIdx] || song.sections[0];
  const nextSection = song.sections[state.sectionIdx + 1];
  const phrase = section.phrases?.[state.phraseIdx];
  return {
    ...state, bpm, setBpm, play, pause, restart,
    jumpToBar, jumpToSection, jumpToPhrase,
    section, nextSection, phrase,
    beatPhase: beatPhaseRef.current,
    activeOnomaItem: state.activeOnomaId ? onomaById.get(state.activeOnomaId) : null,
    schedule, sectionStartBars,
  };
}

/** Sidebar — section + phrase navigation. */
function SectionSidebar({ song, eng }) {
  // Keep the playing section visible as playback advances. `block: 'nearest'`
  // only scrolls if the active item is outside the viewport, so it doesn't
  // fight the user when they scroll manually.
  const activeRef = React.useRef(null);
  const listRef = React.useRef(null);
  React.useEffect(() => {
    const el = activeRef.current;
    if (!el) return;
    if (typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [eng.sectionIdx]);
  return (
    <aside className="pl-sidebar">
      <div className="pl-sidebar-head">
        <span className="label">Estructura</span>
        <span className="num-mono pl-sidebar-count">{song.sections.length}</span>
      </div>
      <div className="pl-sidebar-list" ref={listRef}>
        {song.sections.map((s, i) => {
          const color = window.BBData.getColor(s.color || 'orange');
          const isCur = i === eng.sectionIdx;
          const isDone = i < eng.sectionIdx;
          const sectionStart = eng.sectionStartBars[i];
          const phrases = s.phrases || [{ id: 'legacy', bars: s.bars || 0, repeat: 1 }];
          return (
            <div key={s.id}
                 ref={isCur ? activeRef : null}
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
                    <span className="num-mono">{window.BBData.sectionBars(s)} compases</span>
                    {phrases.some((p) => p.fill) && <span className="pl-sec-pill fill">FILL</span>}
                    {s.endCue?.type === 'stop' && <span className="pl-sec-pill stop">PARADA</span>}
                  </div>
                </div>
              </button>
              {/* Phrases listing */}
              <div className="pl-sec-phrases">
                {phrases.map((p, pi) => {
                  let phraseStartInSection = 0;
                  for (let k = 0; k < pi; k++) phraseStartInSection += phrases[k].bars * phrases[k].repeat;
                  const phraseStartBar = sectionStart + phraseStartInSection;
                  const isCurPhrase = isCur && pi === eng.phraseIdx;
                  return (
                    <div key={p.id} className={`pl-phr${isCurPhrase ? ' on' : ''}`}>
                      <button className="pl-phr-head"
                              onClick={() => eng.jumpToPhrase(i, pi)}>
                        <span className="pl-phr-letter">{String.fromCharCode(65 + pi)}</span>
                        <span className="pl-phr-label">
                          {p.name ? p.name : <span className="pl-phr-anon">{p.bars}×{p.repeat}</span>}
                        </span>
                        <span className="pl-phr-meta num-mono">
                          {p.bars}×{p.repeat}
                          {p.fill && <span className="pl-phr-fill-dot" title="con fill" />}
                        </span>
                      </button>
                      {/* per-iteration bars */}
                      <div className="pl-phr-iters">
                        {Array.from({ length: p.repeat }).map((_, iter) => {
                          const isCurIter = isCurPhrase && iter === eng.iterationIdx;
                          const isPastIter = isCurPhrase && iter < eng.iterationIdx;
                          return (
                            <div key={iter} className={`pl-iter${isCurIter ? ' on' : ''}${isPastIter ? ' past' : ''}`}>
                              <span className="pl-iter-num num-mono">{iter + 1}</span>
                              <div className="pl-iter-bars" style={{ '--bars': p.bars }}>
                                {Array.from({ length: p.bars }).map((_, b) => {
                                  const isFill = p.fill && b === p.bars - 1;
                                  const isCurBar = isCurIter && b === eng.barInIteration;
                                  const isPastBar = (isCurPhrase && iter < eng.iterationIdx)
                                    || (isCurIter && b < eng.barInIteration);
                                  const targetBar = phraseStartBar + iter * p.bars + b;
                                  return (
                                    <button key={b}
                                            className={`pl-bar${isCurBar ? ' on' : ''}${isPastBar ? ' played' : ''}${isFill ? ' fill' : ''}`}
                                            onClick={(e) => { e.stopPropagation(); eng.jumpToBar(targetBar); }}
                                            title={`Iter ${iter + 1}, comp. ${b + 1}${isFill ? ' (fill)' : ''}`}>
                                      {isCurBar && <span className="pl-bar-pip" />}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
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

function OnomaOverlay({ onoma, currentStep, beatsPerBar, label }) {
  if (!onoma) return null;
  const grooveBeats = window.BBData.grooveBeatsPerBar(onoma);
  const beatSubs = window.BBData.grooveBeatSubs(onoma);
  const beatStart = [0];
  beatSubs.forEach((n) => beatStart.push(beatStart[beatStart.length - 1] + n));
  const syllables = [];
  const seenSteps = new Set();
  onoma.hits.slice().sort((a, b) => a.step - b.step).forEach((h) => {
    if (seenSteps.has(h.step)) return;
    seenSteps.add(h.step);
    if (h.text) syllables.push({ step: h.step, text: h.text });
  });
  return (
    <div className="onoma-overlay">
      <div className="onoma-overlay-head">{label || 'FILL'} · {onoma.name}</div>
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
      <div className="onoma-overlay-track" style={{ '--bpb': grooveBeats }}>
        {beatSubs.map((subs, b) => (
          <div key={b} className="onoma-overlay-beat" style={{ '--subs': subs }}>
            {Array.from({ length: subs }).map((_, sub) => {
              const cellIdx = beatStart[b] + sub;
              const has = onoma.hits.some((h) => h.step === cellIdx);
              return (
                <span key={sub}
                      className={`onoma-track-step${sub === 0 ? ' beat' : ''}${has ? ' has' : ''}${cellIdx === currentStep ? ' on' : ''}`} />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Current-section phrase progress — list of phrases with iteration dots
 *  and the current iteration's bar grid; current bar pulses, fill bars are
 *  marked. Used in the right panel of the Player. */
function PhraseProgress({ section, eng }) {
  const phrases = section?.phrases || [];
  // Keep the current phrase in view when many phrases stack vertically.
  const activeRef = React.useRef(null);
  React.useEffect(() => {
    const el = activeRef.current;
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [eng.sectionIdx, eng.phraseIdx]);
  return (
    <div className="pp-list">
      {phrases.map((p, pi) => {
        const isCurPhrase = pi === eng.phraseIdx;
        const isDonePhrase = pi < eng.phraseIdx && eng.phraseIdx >= 0;
        const letter = String.fromCharCode(65 + pi);
        return (
          <div key={p.id || pi}
               ref={isCurPhrase ? activeRef : null}
               className={`pp-phr${isCurPhrase ? ' on' : ''}${isDonePhrase ? ' done' : ''}`}>
            <div className="pp-phr-head">
              <span className="pp-phr-letter">{letter}</span>
              <span className="pp-phr-name">{p.name || `frase ${letter}`}</span>
              <span className="pp-phr-meta">{p.bars}×{p.repeat}</span>
            </div>
            {p.repeat > 1 && (
              <div className="pp-iters">
                {Array.from({ length: p.repeat }).map((_, iter) => {
                  const isCurIter = isCurPhrase && iter === eng.iterationIdx;
                  const isPastIter = isDonePhrase
                    || (isCurPhrase && iter < eng.iterationIdx);
                  return (
                    <span key={iter}
                          className={`pp-iter${isCurIter ? ' on' : ''}${isPastIter ? ' past' : ''}`} />
                  );
                })}
              </div>
            )}
            {isCurPhrase && (
              <div className="pp-bars" style={{ '--bars': p.bars }}>
                {Array.from({ length: p.bars }).map((_, b) => {
                  const isFillB = p.fill && b === p.bars - 1;
                  const isCurBar = b === eng.barInIteration;
                  const isPastBar = b < eng.barInIteration;
                  return (
                    <span key={b}
                          className={`pp-bar${isCurBar ? ' on' : ''}${isPastBar ? ' played' : ''}${isFillB ? ' fill' : ''}`} />
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Player({ song, onomaItems, onBack, tweaks }) {
  const eng = usePlayerEngine(song, onomaItems, tweaks);
  const beatViz = tweaks?.beatViz || 'dots';
  const cueMode = tweaks?.cueMode || 'banner';
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [sheetOpen, setSheetOpen] = React.useState(false);

  const sectionTotal = window.BBData.sectionBars(eng.section);
  const sectionProgress = sectionTotal > 0
    ? Math.min(100, ((eng.barInSection + 1) / sectionTotal) * 100) : 0;
  const sectionColor = window.BBData.getColor(eng.section.color || 'orange');

  const showBigNumbers = cueMode === 'big-numbers' && eng.endCueActive
    && eng.barsLeftInSection <= 1;
  const bigNumber = Math.max(1, eng.barsLeftInSection + 1);
  const screenTint = cueMode === 'screen-tint' && eng.endCueActive;
  const nextGlow = cueMode === 'next-glow' && eng.endCueActive;
  const banner = cueMode === 'banner' && eng.endCueActive;

  return (
    <div className={`player has-sidebar${screenTint ? ' tint' : ''}${eng.endCueActive ? ' cue-on' : ''}${sidebarOpen ? '' : ' sidebar-closed'}`}
         style={{ '--c-section': sectionColor.ink }}>
      <div className="player-bar">
        <button className="btn ghost icon" onClick={onBack} title="Volver">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <button className="btn ghost icon pl-sidebar-toggle" onClick={() => setSidebarOpen((v) => !v)} title="Estructura">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h12M3 18h18"/></svg>
        </button>
        <div className="player-title">
          <span className="player-song">{song.title}</span>
          {song.artist && <span className="player-artist">{song.artist}</span>}
        </div>
        <div className="player-progress">
          {song.sections.map((s, i) => {
            const c = window.BBData.getColor(s.color || 'orange');
            const sb = window.BBData.sectionBars(s);
            return (
              <span key={s.id}
                    className={`pp-seg${i === eng.sectionIdx ? ' on' : ''}${i < eng.sectionIdx ? ' done' : ''}`}
                    style={{ flex: sb, '--c-ink': c.ink }}
                    onClick={() => eng.jumpToSection(i)}
                    title={s.name}>
                {i === eng.sectionIdx && (
                  <span className="pp-fill" style={{ width: `${sectionProgress}%` }} />
                )}
              </span>
            );
          })}
        </div>
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
            <b className="num-mono">{eng.barsLeftInSection + 1}</b>
            <span className="cue-banner-in"> {eng.barsLeftInSection === 0 ? 'compás' : 'compases'}</span>
          </span>
          {eng.section.endCue?.say && (
            <span className="cue-banner-say">"{eng.section.endCue.say}"</span>
          )}
        </div>
      )}

      <div className="player-shell">
        {sidebarOpen && <SectionSidebar song={song} eng={eng} />}
        <div className="player-main">
          <div className="player-grid">
            <div className={`player-now${eng.countingIn ? ' countin' : ''}`}>
              {eng.countingIn ? (<>
                <div className="player-now-label">CUENTA DE ENTRADA</div>
                <div className="player-now-name num-mono">{eng.countInBarsLeft}</div>
                <div className="player-now-bars">
                  <span className="player-now-unit">
                    {eng.countInBarsLeft === 1 ? 'compás para empezar' : 'compases para empezar'}
                  </span>
                </div>
              </>) : (<>
              <div className="player-now-label">
                <span className="player-now-dot" style={{ background: sectionColor.ink }} />
                AHORA · sección {eng.sectionIdx + 1}/{song.sections.length}
              </div>
              <div className="player-now-name">{eng.section.name}</div>
              <div className="player-now-bars">
                <span className="num-mono player-now-cur">{eng.barInSection + 1}</span>
                <span className="player-now-slash">/</span>
                <span className="num-mono player-now-tot">{sectionTotal}</span>
                <span className="player-now-unit">compases</span>
              </div>
              </>)}
            </div>

            <div className="player-viz">
              {eng.activeOnomaItem ? (
                <OnomaOverlay onoma={eng.activeOnomaItem}
                              currentStep={eng.activeOnomaStep}
                              beatsPerBar={song.beatsPerBar}
                              label="FILL" />
              ) : (
                <window.BeatViz mode={beatViz} beatsPerBar={song.beatsPerBar}
                                currentBeat={eng.beatInBar} accent={eng.accent}
                                beatPhase={eng.beatPhase} />
              )}
            </div>

            <div className={`player-next${!eng.countingIn ? ' has-progress' : ''}${nextGlow && !eng.countingIn ? ' glow' : ''}${eng.endCueActive && !eng.countingIn ? ' active' : ''}`}>
              {showBigNumbers && !eng.activeOnomaItem && (
                <div className="big-numbers" key={`big-${eng.barsLeftInSection}`}>
                  <div className="big-numbers-n">{bigNumber}</div>
                  <div className="big-numbers-lbl">
                    {eng.section.endCue?.say ?
                      `"${eng.section.endCue.say}"` :
                      (eng.barsLeftInSection === 0 ? 'último compás' : 'compases')}
                  </div>
                </div>
              )}
              {eng.countingIn ? (<>
                <div className="player-next-label">
                  EMPIEZA EN
                  <span className="player-next-countdown num-mono">
                    {eng.countInBarsLeft} {eng.countInBarsLeft === 1 ? 'compás' : 'compases'}
                  </span>
                </div>
                <div className="player-next-name">{song.sections[0].name}</div>
                <div className="player-next-meta">
                  <span className="num-mono">{window.BBData.sectionBars(song.sections[0])} compases</span>
                </div>
              </>) : (<>
                <div className="pp-header">
                  <span className="pp-header-section">{eng.section.name}</span>
                  {eng.endCueActive && (
                    <span className="player-next-countdown num-mono">
                      {eng.barsLeftInSection + 1} {eng.barsLeftInSection === 0 ? 'compás' : 'compases'}
                    </span>
                  )}
                </div>
                <PhraseProgress section={eng.section} eng={eng} />
                <div className={`pp-footer${eng.nextSection ? '' : ' dim'}`}>
                  <span className="pp-footer-label">PRÓXIMO</span>
                  {eng.nextSection ? (
                    <>
                      <span className="pp-footer-name">{eng.nextSection.name}</span>
                      <span className="pp-footer-bars">
                        {window.BBData.sectionBars(eng.nextSection)} comp
                      </span>
                    </>
                  ) : (
                    <span className="pp-footer-name">fin de la canción</span>
                  )}
                </div>
              </>)}
            </div>
          </div>

        </div>
      </div>

      {sheetOpen && (
        <div className="pl-sheet" onClick={() => setSheetOpen(false)}>
          <div className="pl-sheet-panel" onClick={(e) => e.stopPropagation()}>
            <div className="pl-sheet-bar">
              <span className="label">Estructura</span>
              <button className="btn icon ghost" onClick={() => setSheetOpen(false)}>✕</button>
            </div>
            <SectionSidebar song={song} eng={{
              ...eng,
              jumpToSection: (i) => { eng.jumpToSection(i); setSheetOpen(false); },
              jumpToBar: (b) => { eng.jumpToBar(b); setSheetOpen(false); },
              jumpToPhrase: (s, p) => { eng.jumpToPhrase(s, p); setSheetOpen(false); },
            }} />
          </div>
        </div>
      )}

      <div className="player-controls">
        <div className="player-bpm">
          <span className="label">BPM · {(() => {
            const sd = eng.section.subdivision != null
              ? eng.section.subdivision : (song.subdivision || 1);
            return sd === 1 ? 'negras' : sd === 2 ? 'corcheas'
                   : sd === 3 ? 'tresillos' : 'semicorcheas';
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
