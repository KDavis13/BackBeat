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
  maxBpm: 0, // 0 = no cap
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

/** Live viz of a groove: syllables (sorted) and a per-beat track that
 *  respects each beat's own subdivision (negras / corcheas / tresillos…). */
function PracticeViz({ groove, currentStep }) {
  const beatsPerBar = window.BBData.grooveBeatsPerBar(groove);
  const beatSubs = window.BBData.grooveBeatSubs(groove);
  const beatStart = [0];
  beatSubs.forEach((n) => beatStart.push(beatStart[beatStart.length - 1] + n));
  const syllables = [];
  const seen = new Set();
  groove.hits.slice().sort((a, b) => a.step - b.step).forEach((h) => {
    if (seen.has(h.step) || !h.text) return;
    seen.add(h.step);
    syllables.push({ step: h.step, text: h.text });
  });
  return (
    <div className="prac-viz">
      <div className="prac-viz-name">{groove.name}</div>
      <div className="prac-viz-syl">
        {syllables.length === 0 && (
          <span className="prac-viz-syl-empty">(sin sílabas — añádelas en la pestaña Grooves)</span>
        )}
        {syllables.map((s, i) => (
          <span key={i}
                className={`prac-viz-syl-item${s.step === currentStep ? ' on' : ''}`}>
            {s.text}
          </span>
        ))}
      </div>
      <div className="prac-viz-track" style={{ '--bpb': beatsPerBar }}>
        {beatSubs.map((subs, b) => (
          <div key={b} className="prac-viz-beat" style={{ '--subs': subs }}>
            {Array.from({ length: subs }).map((_, sub) => {
              const cellIdx = beatStart[b] + sub;
              const has = groove.hits.some((h) => h.step === cellIdx);
              const on = cellIdx === currentStep;
              return (
                <span key={sub}
                      className={`prac-viz-step${sub === 0 ? ' beat' : ''}${has ? ' has' : ''}${on ? ' on' : ''}`} />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

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

  const groove = (onomaItems || []).find((o) => o.id === settings.grooveId);

  const metroRef = React.useRef(null);
  if (!metroRef.current) metroRef.current = new window.Metronome();
  const unsubRef = React.useRef(null);
  const lastPatternRef = React.useRef(-1);
  const elapsedRef = React.useRef(0);
  const totalRef = React.useRef(0);
  // Last bar's downbeat audio time + duration — read by the rAF viz.
  const barRef = React.useRef({ start: 0, dur: 0 });

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

  // Tempo ramp ticker.
  React.useEffect(() => {
    if (!running) return;
    let lastTick = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const dt = (now - lastTick) / 1000;
      lastTick = now;
      elapsedRef.current += dt;
      totalRef.current += dt;
      let bump = false;
      if (elapsedRef.current >= settings.rampIntervalSec) {
        elapsedRef.current -= settings.rampIntervalSec;
        bump = true;
      }
      setElapsedSec(elapsedRef.current);
      setTotalSec(totalRef.current);
      if (bump) {
        setBpm((b) => {
          const cap = settings.maxBpm > 0 ? settings.maxBpm : Infinity;
          return Math.min(b + settings.rampStep, cap);
        });
      }
    }, 100);
    return () => clearInterval(id);
  }, [running, settings.rampIntervalSec, settings.rampStep, settings.maxBpm]);

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
    try { unsubRef.current && unsubRef.current(); } catch (e) {}
    unsubRef.current = m.subscribe((ev) => {
      if (ev.type !== 'beat') return;
      const beatInBar = ev.beat % beatsPerBar;
      if (beatInBar !== 0) return;
      const barDur = (60 / m.bpm) * beatsPerBar;
      barRef.current = { start: ev.time, dur: barDur };
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

  // rAF viz: derive currentStep from audio time → fraction → cell.
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
          const cellIdx = window.BBData.grooveCellAtFraction(groove, fraction);
          setCurrentStep(cellIdx);
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

  return (
    <div className="page practice-page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Práctica</h1>
          <p className="page-sub">
            Coge un groove, fija un tempo inicial y deja que suba solo (estilo Stick Control).
          </p>
        </div>
      </div>

      <div className="prac-layout">
        <div className="prac-settings">
          <div className="prac-field">
            <div className="prac-field-row">
              <label className="label">Groove</label>
              <button className="btn ghost prac-new-btn" onClick={openOnomaScreen}
                      title="Crear o editar grooves">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
                Crear / editar
              </button>
            </div>
            <select className="select" value={settings.grooveId || ''}
                    onChange={(e) => updateSettings({ grooveId: e.target.value || null })}>
              <option value="">— elige uno —</option>
              {(onomaItems || []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({window.BBData.grooveBeatsPerBar(o)}/4)
                </option>
              ))}
            </select>
          </div>

          <div className="prac-field-grid">
            <div className="prac-field">
              <label className="label">BPM inicial</label>
              <input className="input num-mono" type="number" min="20" max="300"
                     value={settings.startBpm}
                     onChange={(e) => updateSettings({
                       startBpm: Math.max(20, Math.min(300, Number(e.target.value) || 80)),
                     })} />
            </div>
            <div className="prac-field">
              <label className="label">Subir BPM</label>
              <input className="input num-mono" type="number" min="1" max="20"
                     value={settings.rampStep}
                     onChange={(e) => updateSettings({
                       rampStep: Math.max(1, Math.min(20, Number(e.target.value) || 5)),
                     })} />
            </div>
            <div className="prac-field">
              <label className="label">Cada</label>
              <select className="select" value={settings.rampIntervalSec}
                      onChange={(e) => updateSettings({ rampIntervalSec: Number(e.target.value) })}>
                <option value="15">15 segundos</option>
                <option value="30">30 segundos</option>
                <option value="45">45 segundos</option>
                <option value="60">1 minuto</option>
                <option value="90">1,5 minutos</option>
                <option value="120">2 minutos</option>
                <option value="180">3 minutos</option>
              </select>
            </div>
            <div className="prac-field">
              <label className="label">Tope máx.</label>
              <input className="input num-mono" type="number" min="0" max="300"
                     value={settings.maxBpm}
                     onChange={(e) => updateSettings({
                       maxBpm: Math.max(0, Math.min(300, Number(e.target.value) || 0)),
                     })}
                     placeholder="0 = sin tope" />
            </div>
          </div>

          <label className="prac-check">
            <input type="checkbox" checked={metroClick}
                   onChange={(e) => setMetroClick(e.target.checked)} />
            <span>Click del metrónomo bajo el groove</span>
          </label>
        </div>

        <div className="prac-stage">
          <div className="prac-bpm-block">
            <div className="prac-bpm-now num-mono">{bpm}</div>
            <div className="prac-bpm-label">BPM</div>
          </div>

          <div className="prac-ramp">
            <div className="prac-ramp-text">
              {atMax ? (
                <>Tope alcanzado · <b className="num-mono">{settings.maxBpm}</b> BPM</>
              ) : (
                <>siguiente: <b className="num-mono">{nextBpm}</b> BPM
                  {running && <> en <b className="num-mono">{remainingToRamp}</b>s</>}</>
              )}
            </div>
            <div className="prac-ramp-bar">
              <div className="prac-ramp-fill" style={{ width: `${rampFillPct}%` }} />
            </div>
          </div>

          {groove ? (
            <PracticeViz groove={groove} currentStep={currentStep} />
          ) : (
            <div className="prac-empty">
              Elige un groove arriba — o crea uno nuevo desde la pestaña Grooves — para empezar.
            </div>
          )}

          <div className="prac-stats">
            <div className="prac-stat">
              <div className="label">vueltas</div>
              <div className="num-mono prac-stat-num">{loopCount}</div>
            </div>
            <div className="prac-stat">
              <div className="label">tiempo</div>
              <div className="num-mono prac-stat-num">{practiceFormatTime(totalSec)}</div>
            </div>
          </div>

          <div className="prac-controls">
            <button className="btn ghost prac-reset-btn" onClick={reset} title="Reiniciar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2">
                <path d="M1 4v6h6M23 20v-6h-6"/>
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/>
              </svg>
            </button>
            {running ? (
              <button className="btn play-btn pause" onClick={pause}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="5" width="4" height="14"/>
                  <rect x="14" y="5" width="4" height="14"/>
                </svg>
              </button>
            ) : (
              <button className="btn primary play-btn" onClick={play} disabled={!groove}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Practice });
