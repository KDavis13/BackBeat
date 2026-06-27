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
        // Fraction of the song bar elapsed maps directly to the groove
        // bar (we play one groove bar per song bar). Works for any
        // per-beat subdivision the groove uses.
        const subsInSongBar = subdivision * song.beatsPerBar;
        const subWithinSongBar = (beatInBar * subdivision) + subOfBeat;
        const fraction = subWithinSongBar / subsInSongBar;
        activeOnomaStep = window.BBData.grooveCellAtFraction(activeOnoma, fraction);
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

/* ── Play-along cockpit pieces (rediseño) ─────────────────── */
function PlayerSections({ song, eng }) {
  return (
    <div style={{ display: 'flex', gap: 3, height: 9 }}>
      {song.sections.map((s, i) => {
        const c = window.BBData.getColor(s.color || 'orange').ink;
        const sb = window.BBData.sectionBars(s);
        const state = i < eng.sectionIdx ? 'done' : i === eng.sectionIdx ? 'on' : 'idle';
        const prog = sb > 0 ? Math.min(100, ((eng.barInSection + 1) / sb) * 100) : 0;
        return (
          <div key={s.id} onClick={() => eng.jumpToSection(i)} title={s.name}
            style={{ flex: sb, position: 'relative', cursor: 'pointer', background: 'var(--rd-ink)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,.6)' }}>
            {state === 'done' && <div style={{ position: 'absolute', inset: 0, background: c, opacity: .35 }} />}
            {state === 'on' && <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${prog}%`, background: c, boxShadow: `0 0 8px ${c}` }} />}
          </div>
        );
      })}
    </div>
  );
}

function PlayerBeatDots({ beats, current, accent }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
      {Array.from({ length: beats }).map((_, b) => {
        const on = b === current;
        const c = on ? (accent && b === 0 ? 'var(--rd-led-soft)' : 'var(--rd-led)') : 'var(--rd-ink)';
        return (
          <div key={b} style={{ width: on ? 30 : 18, height: on ? 30 : 18, borderRadius: '50%', background: c,
            boxShadow: on ? `0 0 18px ${c}, 0 0 4px ${c}` : 'inset 0 1px 2px rgba(0,0,0,.6)',
            transition: 'all .08s', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#160a02', fontWeight: 800, fontFamily: 'var(--rd-mono)', fontSize: 13 }}>
            {on ? b + 1 : ''}
          </div>
        );
      })}
    </div>
  );
}

function ChangeAlert({ eng }) {
  const type = eng.section.endCue?.type;
  const label = type === 'fill' ? 'FILL' : type === 'stop' ? 'PARADA' : 'CAMBIO';
  const next = eng.nextSection;
  const nextC = next ? window.BBData.getColor(next.color || 'orange').ink : 'var(--rd-warn)';
  const n = Math.max(1, eng.barsLeftInSection + 1);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 16px',
      background: 'linear-gradient(90deg, rgba(255,210,58,.2), rgba(255,210,58,.04))',
      border: `1px solid ${nextC}`, boxShadow: `0 0 24px ${nextC}22` }}>
      <div className="blink mono" style={{ fontSize: 46, fontWeight: 800, lineHeight: .8, color: 'var(--rd-warn)', textShadow: '0 0 18px rgba(255,210,58,.5)' }}>{n}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="eng" style={{ fontSize: 9, color: 'var(--rd-warn)' }}>{n === 1 ? 'compás para' : 'compases para'} · {label}</div>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em', color: nextC, textShadow: `0 0 16px ${nextC}55`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {next ? next.name : 'fin de la canción'}
        </div>
      </div>
      {eng.section.endCue?.say && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: nextC }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a9 9 0 0 1 0 14"/></svg>
          <span className="eng" style={{ fontSize: 8.5 }}>voz</span>
        </div>
      )}
    </div>
  );
}

function Player({ song, onomaItems, onBack, tweaks }) {
  const eng = usePlayerEngine(song, onomaItems, tweaks);
  const RD = window.RD; const RP = window.RDPerf;
  const [viewMode, setViewModeState] = React.useState(() => window.BBData.loadViewMode());
  const setViewMode = (m) => { setViewModeState(m); window.BBData.saveViewMode(m); };

  // rAF re-render while running so eng.beatPhase (a ref snapshot) refreshes
  // each frame → smooth playhead / falling motion.
  const [, forceTick] = React.useState(0);
  React.useEffect(() => {
    if (!eng.running) return;
    let raf;
    const loop = () => { forceTick((t) => (t + 1) % 1e9); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [eng.running]);

  const beats = song.beatsPerBar || 4;
  const sectionTotal = window.BBData.sectionBars(eng.section);
  const sectionColor = window.BBData.getColor(eng.section.color || 'orange').ink;
  const phase = Math.max(0, Math.min(0.999, (eng.beatInBar + (eng.beatPhase || 0)) / beats));

  const fill = eng.activeOnomaItem;
  const fillVoices = React.useMemo(() => fill ? window.BBData.grooveToVoices(fill).voices : [], [fill]);
  const fillBeats = fill ? window.BBData.grooveBeatsPerBar(fill) : beats;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', minHeight: 0 }}>
      {/* ambient amber tint during the change cue */}
      {eng.endCueActive && !eng.countingIn && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 6,
          background: 'radial-gradient(130% 90% at 50% 0%, rgba(255,178,58,.16), transparent 65%)' }} />
      )}

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', flexShrink: 0,
        borderBottom: '1px solid #000', boxShadow: '0 1px 0 var(--rd-edge-hi)',
        background: 'linear-gradient(180deg,var(--rd-panel-2),var(--rd-panel))' }}>
        <button className="btn icon ghost" onClick={onBack} title="Volver"><RD.Icon d={RD.IC.back} size={18} /></button>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.title}</div>
          <div className="eng" style={{ fontSize: 9, marginTop: 2 }}>{song.artist ? `${song.artist} · ` : ''}{eng.bpm} BPM</div>
        </div>
        <div style={{ marginLeft: 'auto' }}><RP.ViewToggle mode={viewMode} onChange={setViewMode} /></div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, padding: 16, minHeight: 0, overflow: 'auto' }}>
        <PlayerSections song={song} eng={eng} />

        {/* now */}
        {!eng.countingIn && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span className="eng" style={{ fontSize: 9, color: sectionColor }}>ahora · {eng.sectionIdx + 1}/{song.sections.length}</span>
            <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em', color: sectionColor, textShadow: `0 0 14px ${sectionColor}44` }}>{eng.section.name}</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--rd-text-mut)', marginLeft: 'auto' }}>compás {eng.barInSection + 1}/{sectionTotal}</span>
          </div>
        )}

        {/* hero */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
          {eng.countingIn ? (
            <div style={{ textAlign: 'center' }}>
              <div className="eng" style={{ fontSize: 10, color: 'var(--rd-led)' }}>cuenta de entrada</div>
              <div className="mono blink" style={{ fontSize: 96, fontWeight: 800, lineHeight: 1, color: 'var(--rd-led)', textShadow: '0 0 30px rgba(255,122,26,.5)' }}>{eng.countInBarsLeft}</div>
            </div>
          ) : fill ? (
            <div style={{ width: '100%' }}>
              {viewMode === 'falling'
                ? <RP.FallingGroove voices={fillVoices} beats={fillBeats} phase={phase} H={360} />
                : <RP.PerfGroove voices={fillVoices} beats={fillBeats} phase={phase} h={46} />}
            </div>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <PlayerBeatDots beats={beats} current={eng.beatInBar} accent={eng.accent} />
              <div className="eng" style={{ fontSize: 9, marginTop: 16, color: 'var(--rd-text-faint)' }}>toca tu groove · el fill aparece aquí</div>
            </div>
          )}
        </div>

        {/* change cue */}
        {eng.endCueActive && !eng.countingIn && <ChangeAlert eng={eng} />}

        {/* transport */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button className="key" style={{ width: 34, height: 34 }} onClick={() => eng.setBpm(Math.max(20, eng.bpm - 1))}>−</button>
            <div className="lcd" style={{ padding: '4px 10px' }}><span className="digits mono" style={{ fontSize: 20 }}>{eng.bpm}</span></div>
            <button className="key" style={{ width: 34, height: 34 }} onClick={() => eng.setBpm(Math.min(300, eng.bpm + 1))}>+</button>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
            <button className="key" style={{ width: 46, height: 46 }} onClick={eng.restart} title="Reiniciar">
              <RD.Icon d={['M1 4v6h6', 'M3.51 15a9 9 0 1 0 2.13-9.36L1 10']} size={18} />
            </button>
            <button className={'key' + (eng.running ? ' play' : '')} style={{ width: 64, height: 64 }}
              onClick={() => eng.running ? eng.pause() : eng.play()}>
              <RD.Icon d={eng.running ? RD.IC.pause : RD.IC.play} size={24} fill={eng.running ? 'none' : 'currentColor'} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Player });
