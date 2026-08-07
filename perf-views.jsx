/* Performance views (rediseño) — leer el groove de un vistazo mientras suena.
 * Cabezal (playhead que recorre carriles) y Caída (notas que caen a GOLPEA).
 * Dirigidas por las VOCES reales del groove + `phase` (0..1) en vivo.
 * Compartido por Práctica (Fase 4) y Canción (Fase 5). window.RDPerf */

const { Icon: PIcon, IC: PIC, RD_CH: PCH } = window.RD;
const LABELW = 78;

function pcolor(c) { return PCH[c] || c || 'var(--rd-led)'; }

/* view-mode toggle */
function ViewToggle({ mode = 'sweep', onChange }) {
  return (
    <div className="seg">
      <button data-on={mode === 'sweep' ? '1' : '0'} onClick={() => onChange && onChange('sweep')}>Cabezal</button>
      <button data-on={mode === 'falling' ? '1' : '0'} onClick={() => onChange && onChange('falling')}>Caída</button>
    </div>
  );
}

/* flatten a per-voice structure into time-positioned on-cells (t in 0..1) */
function flattenVoice(voice, beats) {
  const lit = new Set(voice.lit || []);
  const cells = []; let idx = 0;
  (voice.structure || []).forEach((beat, bi) => {
    const beatT0 = bi / beats, beatW = 1 / beats;
    const groups = beat.halves || [beat];
    const gW = beatW / groups.length;
    groups.forEach((g, gi) => {
      const gT0 = beatT0 + gi * gW;
      const n = g.sub || 1;
      for (let s = 0; s < n; s++) {
        const t0 = gT0 + (s / n) * gW;
        const t1 = gT0 + ((s + 1) / n) * gW;
        cells.push({ t0, t1, on: lit.has(idx), art: (voice.arts && voice.arts[idx]) || (voice.cymbal ? 'closed' : 'normal') });
        idx++;
      }
    });
  });
  return cells;
}

/* one hit block in the sweep lane, styled by articulation + state */
function PerfHit({ c, color, h, state }) {
  const padH = h - 10;
  const dim = state === 'played'; const now = state === 'now';
  const common = {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
    left: `calc(${c.t0 * 100}% + 3px)`, width: `calc(${(c.t1 - c.t0) * 100}% - 6px)`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    opacity: dim ? 0.3 : 1, transition: 'opacity .1s',
  };
  const ring = now ? `, 0 0 0 2px #fff8, 0 0 22px ${color}` : '';
  if (c.art === 'ghost') return (
    <div style={{ ...common, height: padH * 0.5, background: 'var(--rd-ink)', border: '1px solid var(--rd-hair)' }}>
      <span style={{ width: padH * 0.26, height: padH * 0.26, borderRadius: '50%', background: color, opacity: .5 }} />
    </div>
  );
  if (c.art === 'open') return (
    <div style={{ ...common, height: padH, background: `color-mix(in srgb, ${color} 16%, var(--rd-ink))`, border: `2px solid ${color}`, boxShadow: `0 0 12px ${color}${ring}` }}>
      <span style={{ width: padH * 0.5, height: padH * 0.5, borderRadius: '50%', border: `2px solid ${color}` }} />
    </div>
  );
  if (c.art === 'foot') return (
    <div style={{ ...common, height: padH * 0.7, background: 'var(--rd-ink)', border: `1px solid ${color}` }}>
      <span style={{ color, fontWeight: 900, fontSize: padH * 0.4 }}>✕</span>
    </div>
  );
  const accent = c.art === 'accent'; const isX = c.art === 'closed';
  return (
    <div style={{ ...common, height: accent ? padH : padH * 0.86, background: color,
      boxShadow: `0 0 ${accent ? 16 : 9}px ${color}, inset 0 1px 0 rgba(255,255,255,${accent ? .6 : .3})${ring}`,
      border: '1px solid rgba(255,255,255,.18)' }}>
      {isX && <span style={{ color: '#160a02', fontWeight: 900, fontSize: padH * 0.42 }}>✕</span>}
      {accent && !isX && <span style={{ color: '#160a02', fontWeight: 900, fontSize: padH * 0.5, lineHeight: 1 }}>›</span>}
    </div>
  );
}

function PerfLane({ voice, beats, h, phase }) {
  const cells = flattenVoice(voice, beats);
  const c = pcolor(voice.color);
  const nextIdx = cells.findIndex((x) => x.on && x.t1 > phase);
  return (
    <div style={{ display: 'flex', alignItems: 'center', height: h }}>
      <div style={{ width: LABELW, display: 'flex', alignItems: 'center', gap: 7, paddingRight: 10, flexShrink: 0,
        position: 'sticky', left: 0, zIndex: 6, background: '#0e0b07', boxShadow: '6px 0 8px -4px rgba(0,0,0,.8)' }}>
        {voice.cymbal
          ? <span style={{ color: c, fontWeight: 900, fontSize: 13 }}>✕</span>
          : <span style={{ width: 9, height: 9, borderRadius: '50%', background: c, boxShadow: `0 0 6px ${c}` }} />}
        <span className="eng" style={{ fontSize: 9, color: c }}>{voice.label}</span>
      </div>
      <div style={{ flex: 1, position: 'relative', height: '100%' }}>
        {Array.from({ length: beats + 1 }).map((_, b) => (
          <div key={b} style={{ position: 'absolute', top: 4, bottom: 4, left: `${(b / beats) * 100}%`, width: 1,
            background: b % beats === 0 ? 'rgba(255,177,58,.22)' : 'rgba(255,177,58,.09)' }} />
        ))}
        {cells.map((cell, i) => cell.on && (
          <PerfHit key={i} c={cell} color={c} h={h}
            state={cell.t1 <= phase ? 'played' : (i === nextIdx ? 'now' : 'up')} />
        ))}
      </div>
    </div>
  );
}

/* ── Cabezal: lanes + sweeping playhead ───────────────────────
 * Each beat keeps a comfortable minimum width; when the groove is longer than
 * the viewport the track scrolls horizontally and auto-follows the playhead
 * (piano-roll style), so a 24-beat groove stays readable instead of crushed. */
const MIN_BEAT = 56;
const ZOOM_KEY = 'backbeat.perfzoom.v1';
const FALLZOOM_KEY = 'backbeat.fallzoom.v1';
const ZOOM_STEPS = [1, 1.5, 2, 3, 4, 6];
function loadZoomFrom(key) {
  try { const z = parseFloat(localStorage.getItem(key)); return ZOOM_STEPS.includes(z) ? z : 1; }
  catch (e) { return 1; }
}
/* shared − N× + stepper for the perf views */
function ZoomControl({ zoom, onStep }) {
  const first = zoom <= ZOOM_STEPS[0], last = zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1];
  const btn = (dis) => ({ appearance: 'none', border: '1px solid var(--rd-hair-strong)', background: 'var(--rd-ink)',
    color: 'var(--rd-text-dim)', width: 26, height: 26, cursor: 'pointer', fontSize: 16, lineHeight: 1, opacity: dis ? .4 : 1 });
  return (
    <div style={{ position: 'absolute', top: 6, right: 8, zIndex: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
      <button onClick={() => onStep(-1)} disabled={first} title="Alejar" style={btn(first)}>−</button>
      <span className="mono" style={{ fontSize: 10, color: 'var(--rd-text-mut)', minWidth: 26, textAlign: 'center' }}>{zoom}×</span>
      <button onClick={() => onStep(1)} disabled={last} title="Acercar" style={btn(last)}>+</button>
    </div>
  );
}
function stepZoomVal(zoom, dir) {
  const i = ZOOM_STEPS.indexOf(zoom);
  return ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, (i < 0 ? 0 : i) + dir))];
}
function PerfGroove({ voices = [], beats = 4, phase = 0, h = 42 }) {
  const scRef = React.useRef(null);
  const trackRef = React.useRef(null);
  const [zoom, setZoomState] = React.useState(() => loadZoomFrom(ZOOM_KEY));
  const stepZoom = (dir) => { const z = stepZoomVal(zoom, dir); setZoomState(z); try { localStorage.setItem(ZOOM_KEY, String(z)); } catch (e) {} };
  const trackMin = LABELW + beats * MIN_BEAT * zoom;
  // keep the playhead centred while playing (no manual scrolling needed)
  React.useEffect(() => {
    const sc = scRef.current, tr = trackRef.current;
    if (!sc || !tr) return;
    const cw = tr.offsetWidth, vw = sc.clientWidth;
    if (cw <= vw + 1) { sc.scrollLeft = 0; return; }
    const px = LABELW + phase * (cw - LABELW);
    sc.scrollLeft = Math.max(0, Math.min(cw - vw, px - vw / 2));
  });
  return (
    <div className="staff" style={{ padding: '10px 0', position: 'relative' }}>
      {/* zoom — widen each beat to spread out dense subdivisions (e.g. fusas) */}
      <ZoomControl zoom={zoom} onStep={stepZoom} />
      <div ref={scRef} style={{ overflowX: 'auto', overflowY: 'hidden' }}>
        <div ref={trackRef} style={{ position: 'relative', width: `max(100%, ${trackMin}px)`, padding: '0 12px' }}>
          {/* beat ruler */}
          <div style={{ display: 'flex', height: 24 }}>
            <div style={{ width: LABELW, flexShrink: 0, position: 'sticky', left: 0, zIndex: 6, background: '#0e0b07' }} />
            <div style={{ flex: 1, position: 'relative' }}>
              {Array.from({ length: beats }).map((_, b) => {
                const beatOn = Math.floor(phase * beats) === b;
                return (
                  <div key={b} style={{ position: 'absolute', left: `${(b / beats) * 100}%`, width: `${100 / beats}%`, textAlign: 'center' }}>
                    <span className="mono" style={{ fontSize: 15, fontWeight: 800,
                      color: beatOn ? 'var(--rd-led)' : 'var(--rd-text-faint)', textShadow: beatOn ? '0 0 12px var(--rd-led)' : 'none' }}>{b + 1}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ position: 'relative' }}>
            {voices.map((v) => <PerfLane key={v.id} voice={v} beats={beats} h={h} phase={phase} />)}
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: `calc(${LABELW}px + ${phase} * (100% - ${LABELW}px))`,
              width: 3, background: 'var(--rd-led)', boxShadow: '0 0 14px var(--rd-led)', zIndex: 5 }}>
              <div style={{ position: 'absolute', top: -7, left: '50%', transform: 'translateX(-50%)', width: 0, height: 0,
                borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '8px solid var(--rd-led)' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Caída: rhythm-game falling notes ─────────────────────── */
function FallingGroove({ voices = [], beats = 4, phase = 0, H = 360 }) {
  // Zoom spreads the falling notes: higher zoom → fewer beats visible → each
  // beat is taller → dense subdivisions (fusas/semis) are clearly spaced,
  // at the cost of seeing fewer beats ahead (sparse hits arrive later).
  const [zoom, setZoomState] = React.useState(() => loadZoomFrom(FALLZOOM_KEY));
  const stepZoom = (dir) => { const z = stepZoomVal(zoom, dir); setZoomState(z); try { localStorage.setItem(FALLZOOM_KEY, String(z)); } catch (e) {} };
  const winBase = Math.min(beats, 8);
  const hitY = H - 56;
  const pxPerBeat = ((hitY - 16) / winBase) * zoom;   // taller beat = more spacing
  const visibleBeats = (hitY - 16) / pxPerBeat;        // = winBase / zoom
  const playPos = phase * beats; // current beat position in bar
  return (
    <div style={{ position: 'relative', height: H, display: 'flex', gap: 6, padding: '0 6px' }}>
      <ZoomControl zoom={zoom} onStep={stepZoom} />
      <div style={{ position: 'absolute', left: 6, right: 6, top: hitY, height: 3, background: 'var(--rd-led)', boxShadow: '0 0 16px var(--rd-led)', zIndex: 4 }} />
      <div style={{ position: 'absolute', right: 10, top: hitY - 24, zIndex: 5 }} className="chip live blink"><span className="led on" style={{ width: 6, height: 6 }} /> GOLPEA</div>
      {voices.map((v) => {
        const c = pcolor(v.color);
        const cells = flattenVoice(v, beats).filter((x) => x.on);
        return (
          <div key={v.id} style={{ flex: 1, position: 'relative', minWidth: 0,
            background: 'linear-gradient(180deg, transparent, rgba(255,177,58,.04))', borderLeft: '1px solid var(--rd-hair)', borderRight: '1px solid var(--rd-hair)' }}>
            {cells.map((cell, i) => {
              const t = cell.t0 * beats; // beat position of this hit
              let dist = ((t - playPos) % beats + beats) % beats; // beats until it reaches the line
              if (dist >= visibleBeats) return null;
              const y = hitY - dist * pxPerBeat;
              const now = dist < 0.08;
              const acc = cell.art === 'accent';
              return v.cymbal ? (
                <div key={i} style={{ position: 'absolute', left: '50%', top: y, transform: 'translate(-50%,-50%)',
                  color: c, fontWeight: 900, fontSize: now ? 26 : 20, opacity: now ? 1 : .85,
                  textShadow: now ? `0 0 14px ${c}` : `0 0 6px ${c}` }}>✕</div>
              ) : (
                <div key={i} style={{ position: 'absolute', left: '50%', top: y, transform: `translate(-50%,-50%) scale(${now ? 1 : .82})`,
                  width: '74%', height: acc ? 26 : 20, background: cell.art === 'ghost' ? `color-mix(in srgb, ${c} 45%, var(--rd-ink))` : c,
                  boxShadow: now ? `0 0 20px ${c}, inset 0 1px 0 #fff8` : `0 0 8px ${c}`,
                  border: '1px solid rgba(255,255,255,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {acc && <span style={{ color: '#160a02', fontWeight: 900, fontSize: 14 }}>›</span>}
                </div>
              );
            })}
            <div style={{ position: 'absolute', left: 0, right: 0, top: hitY + 8, textAlign: 'center' }}>
              <span className="eng" style={{ fontSize: 8, color: c }}>{v.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

window.RDPerf = { ViewToggle, flattenVoice, PerfHit, PerfLane, PerfGroove, FallingGroove, LABELW };
