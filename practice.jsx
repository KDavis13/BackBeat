/* Practice — loop a single groove with a Stick-Control-style tempo ramp.
 *
 * Pick a groove from the existing catalogue, set a starting BPM, a step
 * (how many BPM to add) and an interval (how often). Optional cap to
 * stop ramping. The groove loops indefinitely; the ramp ticks on wall
 * clock (not on bar boundaries) so a 60-second interval is exactly 60s.
 */

const PRACTICE_STORAGE_KEY = 'backbeat.practice.v1';
const PRACTICE_DEFAULTS = {
  grooveId: null,
  startBpm: 80,
  rampStep: 5,
  rampIntervalSec: 60,
  maxBpm: 0,      // 0 = no cap
  settleBars: 1,  // bars of click-only between a BPM bump and the groove resuming
};

function practiceLoadSettings() {
  try {
    const raw = localStorage.getItem(PRACTICE_STORAGE_KEY);
    if (raw) return { ...PRACTICE_DEFAULTS, ...JSON.parse(raw) };
  } catch (e) {}
  return { ...PRACTICE_DEFAULTS };
}
function practiceSaveSettings(s) {
  try { localStorage.setItem(PRACTICE_STORAGE_KEY, JSON.stringify(s)); } catch (e) {}
}
function practiceFormatTime(sec) {
  const total = Math.max(0, Math.floor(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const PRAC_DARK_FIELD = {
  background: 'var(--rd-ink)', color: 'var(--rd-text)', border: '1px solid var(--rd-hair-strong)',
  padding: '8px 10px', fontFamily: 'var(--rd-font)', fontSize: 13, width: '100%',
};

function Practice({ onomaItems, openOnomaScreen }) {
  const [settings, setSettingsState] = React.useState(() => practiceLoadSettings());
  const updateSettings = (patch) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      practiceSaveSettings(next);
      return next;
    });
  };

  const [bpm, setBpm] = React.useState(() => settings.startBpm);
  const [running, setRunning] = React.useState(false);
  const [currentStep, setCurrentStep] = React.useState(-1);
  const [loopCount, setLoopCount] = React.useState(0);
  const [elapsedSec, setElapsedSec] = React.useState(0);
  const [totalSec, setTotalSec] = React.useState(0);
  const [metroClick, setMetroClick] = React.useState(true);
  // Settling: brief click-only window right after a BPM bump so the drummer
  // can lock in to the new tempo before the groove kicks back in.
  const [settleRemaining, setSettleRemaining] = React.useState(0);
  // True between the ramp timer hitting the threshold and the actual bump
  // (which is bar-aligned — we wait for the current groove bar to end).
  const [awaitingBump, setAwaitingBump] = React.useState(false);
  // Bar phase (0..1) for the performance views; persisted view mode.
  const [phase, setPhase] = React.useState(0);
  const [viewMode, setViewModeState] = React.useState(() => window.BBData.loadViewMode());
  const setViewMode = (m) => { setViewModeState(m); window.BBData.saveViewMode(m); };

  const groove = (onomaItems || []).find((o) => o.id === settings.grooveId);
  const grooveVoices = React.useMemo(() => groove ? window.BBData.grooveToVoices(groove).voices : [], [groove]);
  const grooveBeats = groove ? window.BBData.grooveBeatsPerBar(groove) : 4;

  const metroRef = React.useRef(null);
  if (!metroRef.current) metroRef.current = new window.Metronome();
  const unsubRef = React.useRef(null);
  const lastPatternRef = React.useRef(-1);
  const elapsedRef = React.useRef(0);
  const totalRef = React.useRef(0);
  // Last bar's downbeat audio time + duration — read by the rAF viz.
  const barRef = React.useRef({ start: 0, dur: 0 });
  // Set by the ramp ticker when BPM bumps. Read+reset on the next downbeat
  // so the settle-window starts on a bar boundary, not mid-bar.
  const pendingSettleRef = React.useRef(0);
  const settleRemainingRef = React.useRef(0);
  // Bar-aligned ramp:
  // - pendingBumpRef: timer hit the threshold; waiting for next downbeat
  //   to apply the BPM bump and (optionally) arm the settle window.
  // - timerFrozenRef: while true the ramp timer doesn't increment — covers
  //   the "groove finishes its bar" gap AND the settle window so the
  //   countdown only starts the next time the groove is actually playing.
  const pendingBumpRef = React.useRef(false);
  const timerFrozenRef = React.useRef(false);

  // Cleanup on unmount
  React.useEffect(() => () => {
    try { metroRef.current && metroRef.current.stop(); } catch (e) {}
    try { unsubRef.current && unsubRef.current(); } catch (e) {}
  }, []);

  // Reflect bpm into the engine (no need to restart).
  React.useEffect(() => {
    if (metroRef.current) metroRef.current.setBpm(bpm);
  }, [bpm]);

  // Reflect click toggle.
  React.useEffect(() => {
    if (metroRef.current) metroRef.current.setSilent(!metroClick);
  }, [metroClick]);

  // When user changes startBpm while not running, follow it.
  React.useEffect(() => {
    if (!running) setBpm(settings.startBpm);
  }, [settings.startBpm]);

  // Tempo ramp ticker. Total time always counts. The ramp countdown
  // (elapsedSec) freezes while the groove is finishing its bar or while
  // we're inside the settle window — only resumes when the groove is
  // audibly playing at the new tempo.
  React.useEffect(() => {
    if (!running) return;
    let lastTick = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const dt = (now - lastTick) / 1000;
      lastTick = now;
      totalRef.current += dt;
      setTotalSec(totalRef.current);
      if (timerFrozenRef.current) return;
      elapsedRef.current += dt;
      // Threshold hit → arm a pending bump and freeze the timer. The
      // actual setBpm happens on the next downbeat (bar-aligned).
      if (!pendingBumpRef.current && elapsedRef.current >= settings.rampIntervalSec) {
        pendingBumpRef.current = true;
        timerFrozenRef.current = true;
        elapsedRef.current = settings.rampIntervalSec; // clamp for UI
        setAwaitingBump(true);
      }
      setElapsedSec(elapsedRef.current);
    }, 100);
    return () => clearInterval(id);
  }, [running, settings.rampIntervalSec, settings.rampStep, settings.maxBpm, settings.settleBars]);

  const play = async () => {
    if (!groove) return;
    const m = metroRef.current;
    await m.init();
    const beatsPerBar = window.BBData.grooveBeatsPerBar(groove);
    m.setBeatsPerBar(beatsPerBar);
    // Engine ticks at quarters; every hit is scheduled at its exact
    // fractional time on each downbeat. Lets us support any per-beat
    // subdivision (1..9).
    m.setSubdivision(1);
    m.setBpm(bpm);
    m.setSilent(!metroClick);
    m.setClickQuartersOnly(false);

    lastPatternRef.current = -1;
    pendingSettleRef.current = 0;
    settleRemainingRef.current = 0;
    pendingBumpRef.current = false;
    timerFrozenRef.current = false;
    setSettleRemaining(0);
    setAwaitingBump(false);
    try { unsubRef.current && unsubRef.current(); } catch (e) {}
    unsubRef.current = m.subscribe((ev) => {
      if (ev.type !== 'beat') return;
      const beatInBar = ev.beat % beatsPerBar;
      if (beatInBar !== 0) return;

      // 1. Apply any pending BPM bump synchronously so this bar is fully
      //    aware of the new tempo (barDur and pendingSettleRef below).
      //    We mutate the engine directly (m.setBpm) — going through the
      //    React state setter would defer the update to the next render
      //    and the rest of this handler would still see the OLD bpm + a
      //    not-yet-armed settle, costing us an extra bar of lag.
      let activeBpm = m.bpm;
      if (pendingBumpRef.current) {
        pendingBumpRef.current = false;
        setAwaitingBump(false);
        const cap = settings.maxBpm > 0 ? settings.maxBpm : Infinity;
        const newBpm = Math.min(activeBpm + settings.rampStep, cap);
        if (newBpm > activeBpm) {
          if (settings.settleBars > 0) pendingSettleRef.current = settings.settleBars;
          m.setBpm(newBpm);
          setBpm(newBpm);
          activeBpm = newBpm;
        }
      }

      const barDur = (60 / activeBpm) * beatsPerBar;
      barRef.current = { start: ev.time, dur: barDur };

      // 2. Settle activation runs in the same handler tick.
      if (pendingSettleRef.current > 0) {
        settleRemainingRef.current = pendingSettleRef.current;
        pendingSettleRef.current = 0;
        setSettleRemaining(settleRemainingRef.current);
      }

      if (settleRemainingRef.current > 0) {
        // Click-only bar: skip groove hits, no loop tally, timer frozen.
        settleRemainingRef.current -= 1;
        setSettleRemaining(settleRemainingRef.current);
        lastPatternRef.current = Math.floor(ev.beat / beatsPerBar);
        return;
      }

      // 3. First groove bar back after bump (+ settle, if any): unfreeze
      //    the ramp timer and restart its countdown from zero.
      if (timerFrozenRef.current) {
        timerFrozenRef.current = false;
        elapsedRef.current = 0;
        setElapsedSec(0);
      }

      groove.hits.forEach((h) => {
        const off = window.BBData.grooveOffsetInBar(groove, h.step) * barDur;
        m.schedulePerc(ev.time + off, h.sound, h.velocity);
      });
      const patternIdx = Math.floor(ev.beat / beatsPerBar);
      if (patternIdx !== lastPatternRef.current) {
        if (lastPatternRef.current >= 0 && patternIdx > lastPatternRef.current) {
          setLoopCount((c) => c + 1);
        }
        lastPatternRef.current = patternIdx;
      }
    });

    await m.start({ bpm, beatsPerBar, subdivision: 1, startBeat: 0 });
    setRunning(true);
  };

  const pause = () => {
    const m = metroRef.current;
    if (m) m.stop();
    try { unsubRef.current && unsubRef.current(); } catch (e) {}
    unsubRef.current = null;
    barRef.current = { start: 0, dur: 0 };
    setRunning(false);
    setCurrentStep(-1);
  };

  // rAF viz: derive currentStep from audio time → fraction → cell. During
  // the settle window we explicitly leave the cell unlit (the groove isn't
  // playing — highlighting a cell would be misleading).
  React.useEffect(() => {
    if (!running || !groove) return;
    let raf;
    const tick = () => {
      const m = metroRef.current;
      const { start, dur } = barRef.current;
      if (m && m.ctx && dur > 0 && start > 0) {
        const elapsed = m.ctx.currentTime - start;
        if (elapsed >= 0) {
          const fraction = (elapsed % dur) / dur;
          setPhase(fraction);
          // During the settle window the groove is muted → don't light a cell.
          setCurrentStep(settleRemainingRef.current > 0 ? -1 : window.BBData.grooveCellAtFraction(groove, fraction));
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, groove]);

  const reset = () => {
    pause();
    setBpm(settings.startBpm);
    elapsedRef.current = 0;
    totalRef.current = 0;
    lastPatternRef.current = -1;
    pendingSettleRef.current = 0;
    settleRemainingRef.current = 0;
    pendingBumpRef.current = false;
    timerFrozenRef.current = false;
    setSettleRemaining(0);
    setAwaitingBump(false);
    setElapsedSec(0);
    setTotalSec(0);
    setLoopCount(0);
  };

  const atMax = settings.maxBpm > 0 && bpm >= settings.maxBpm;
  const remainingToRamp = Math.max(0, Math.ceil(settings.rampIntervalSec - elapsedSec));
  const nextBpm = settings.maxBpm > 0
    ? Math.min(bpm + settings.rampStep, settings.maxBpm)
    : bpm + settings.rampStep;
  const rampFillPct = Math.min(100, (elapsedSec / settings.rampIntervalSec) * 100);

  const RD = window.RD; const RP = window.RDPerf;
  const TICKS = 14;
  const ticksDone = Math.min(TICKS, Math.round((rampFillPct / 100) * TICKS));
  const fld = PRAC_DARK_FIELD;

  return (
    <React.Fragment>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '16px 22px',
        borderBottom: '1px solid #000', boxShadow: '0 1px 0 var(--rd-edge-hi)', flexShrink: 0,
        background: 'linear-gradient(180deg,var(--rd-panel-2),var(--rd-panel))' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.025em' }}>Práctica</div>
          <div className="eng" style={{ marginTop: 3 }}>Encadena el tempo · estilo Stick Control</div>
        </div>
        {groove && <div style={{ marginLeft: 'auto' }}><RP.ViewToggle mode={viewMode} onChange={setViewMode} /></div>}
      </div>

      <div className="rd-scroll" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* settings */}
        <div className="panel" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div className="eng" style={{ fontSize: 9, marginBottom: 5 }}>Groove</div>
              <select style={fld} value={settings.grooveId || ''}
                onChange={(e) => updateSettings({ grooveId: e.target.value || null })}>
                <option value="">— elige uno —</option>
                {(onomaItems || []).map((o) => (
                  <option key={o.id} value={o.id}>{o.name} ({window.BBData.grooveBeatsPerBar(o)}/4)</option>
                ))}
              </select>
            </div>
            <button className="btn ghost" onClick={openOnomaScreen} title="Crear o editar grooves">
              <RD.Icon d={RD.IC.plus} size={14} /> Crear / editar
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
            <label><div className="eng" style={{ fontSize: 9, marginBottom: 5 }}>BPM inicial</div>
              <input className="mono" style={fld} type="number" min="20" max="300" value={settings.startBpm}
                onChange={(e) => updateSettings({ startBpm: Math.max(20, Math.min(300, Number(e.target.value) || 80)) })} /></label>
            <label><div className="eng" style={{ fontSize: 9, marginBottom: 5 }}>Subir BPM</div>
              <input className="mono" style={fld} type="number" min="1" max="20" value={settings.rampStep}
                onChange={(e) => updateSettings({ rampStep: Math.max(1, Math.min(20, Number(e.target.value) || 5)) })} /></label>
            <label><div className="eng" style={{ fontSize: 9, marginBottom: 5 }}>Cada</div>
              <select style={fld} value={settings.rampIntervalSec}
                onChange={(e) => updateSettings({ rampIntervalSec: Number(e.target.value) })}>
                <option value="15">15 s</option><option value="30">30 s</option><option value="45">45 s</option>
                <option value="60">1 min</option><option value="90">1,5 min</option><option value="120">2 min</option><option value="180">3 min</option>
              </select></label>
            <label><div className="eng" style={{ fontSize: 9, marginBottom: 5 }}>Tope máx.</div>
              <input className="mono" style={fld} type="number" min="0" max="300" value={settings.maxBpm} placeholder="0 = sin tope"
                onChange={(e) => updateSettings({ maxBpm: Math.max(0, Math.min(300, Number(e.target.value) || 0)) })} /></label>
            <label style={{ gridColumn: '1 / -1' }}><div className="eng" style={{ fontSize: 9, marginBottom: 5 }}>Adaptación tras subida</div>
              <select style={fld} value={settings.settleBars} onChange={(e) => updateSettings({ settleBars: Number(e.target.value) })}>
                <option value="0">sin adaptación · groove sigue al instante</option>
                <option value="1">1 compás de solo metrónomo</option>
                <option value="2">2 compases de solo metrónomo</option>
                <option value="3">3 compases de solo metrónomo</option>
                <option value="4">4 compases de solo metrónomo</option>
              </select></label>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => setMetroClick((x) => !x)}>
            <span className={'led' + (metroClick ? ' on' : '')} style={{ width: 8, height: 8 }} />
            <span className="eng" style={{ fontSize: 9 }}>Click del metrónomo bajo el groove</span>
          </label>
        </div>

        {/* tempo + ramp */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <RD.LCD value={bpm} unit="BPM" sub="actual" size={44} />
          {settings.maxBpm > 0 && (
            <React.Fragment>
              <RD.Icon d={RD.IC.chevR} size={18} style={{ color: 'var(--rd-led)' }} />
              <RD.LCD value={settings.maxBpm} unit="BPM" sub="meta" size={30} style={{ opacity: .8 }} />
            </React.Fragment>
          )}
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="eng" style={{ fontSize: 9 }}>
                {awaitingBump ? `subiendo a ${nextBpm}…` : settleRemaining > 0 ? `adaptándose · ${settleRemaining} comp.` : atMax ? 'tope alcanzado' : `siguiente ${nextBpm} BPM`}
              </span>
              <span className="mono" style={{ fontSize: 10, color: 'var(--rd-led)' }}>{running && !atMax ? `${remainingToRamp}s` : ''}</span>
            </div>
            <div className="ticks" style={{ '--c': settleRemaining > 0 ? 'var(--rd-warn)' : 'var(--rd-led)' }}>
              {Array.from({ length: TICKS }).map((_, i) => (
                <span key={i} className={`tick ${i < ticksDone ? 'done' : ''} ${i === ticksDone - 1 ? 'on' : ''}`} />
              ))}
            </div>
          </div>
        </div>

        {/* performance view */}
        {groove ? (
          viewMode === 'falling'
            ? <RP.FallingGroove voices={grooveVoices} beats={grooveBeats} phase={phase} H={380} />
            : <RP.PerfGroove voices={grooveVoices} beats={grooveBeats} phase={phase} h={48} />
        ) : (
          <div className="panel" style={{ padding: 28, textAlign: 'center', color: 'var(--rd-text-mut)' }}>
            Elige un groove arriba — o crea uno desde Grooves — para empezar.
          </div>
        )}

        {/* stats + transport */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <div style={{ display: 'flex', gap: 22 }}>
            <div><div className="eng" style={{ fontSize: 9 }}>vueltas</div><div className="mono" style={{ fontSize: 22, fontWeight: 800 }}>{loopCount}</div></div>
            <div><div className="eng" style={{ fontSize: 9 }}>tiempo</div><div className="mono" style={{ fontSize: 22, fontWeight: 800 }}>{practiceFormatTime(totalSec)}</div></div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
            <button className="key" style={{ width: 46, height: 46 }} onClick={reset} title="Reiniciar">
              <RD.Icon d={['M1 4v6h6', 'M3.51 15a9 9 0 1 0 2.13-9.36L1 10']} size={18} />
            </button>
            <button className={'key' + (running ? ' play' : '')} style={{ width: 64, height: 64 }}
              onClick={() => running ? pause() : play()} disabled={!groove}>
              <RD.Icon d={running ? RD.IC.pause : RD.IC.play} size={24} fill={running ? 'none' : 'currentColor'} />
            </button>
            <button className="key" style={{ width: 46, height: 46, opacity: metroClick ? 1 : .5 }} onClick={() => setMetroClick((x) => !x)} title="Click">
              <RD.Icon d={RD.IC.metronome} size={18} />
            </button>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}

Object.assign(window, { Practice });
