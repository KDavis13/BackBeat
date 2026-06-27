/* BackBeat redesign — shared hardware kit: primitives reused across every
 * redesigned screen. Exposed on window.RD. Ported from the design handoff
 * (designs/rd/rd-kit.jsx + rd-shell.jsx); NavRail/NavTabs are adapted to be
 * interactive (real routing) instead of static mock screens. */

const RD_CH = {
  orange: 'var(--ch-orange)', gold: 'var(--ch-gold)', coral: 'var(--ch-coral)',
  magenta: 'var(--ch-magenta)', lime: 'var(--ch-lime)', violet: 'var(--ch-violet)',
  teal: 'var(--ch-teal)',
};
const RD_CH_KEYS = Object.keys(RD_CH);

/* ── Icons (stroke, 24 viewbox) ───────────────────────────── */
function Icon({ d, size = 18, fill = 'none', sw = 2, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style}>
      {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
    </svg>
  );
}
const IC = {
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  play: 'M7 5l12 7-12 7z',
  pause: ['M8 5v14', 'M16 5v14'],
  metronome: ['M9 3h6l3 18H6z', 'M12 7v8', 'M12 15l4-4'],
  song: ['M9 18V6l11-2v12', 'M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0z', 'M20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'],
  book: ['M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z', 'M19 19H6a2 2 0 0 0-2 2'],
  back: ['M19 12H5', 'M12 19l-7-7 7-7'],
  plus: ['M12 5v14', 'M5 12h14'],
  cloud: 'M18 17a4 4 0 0 0-1-7.9A6 6 0 0 0 5.5 11 3.5 3.5 0 0 0 6 17z',
  check: 'M20 6L9 17l-5-5',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  trash: ['M3 6h18', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2', 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6'],
  edit: ['M12 20h9', 'M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z'],
  speaker: ['M11 5L6 9H2v6h4l5 4z', 'M15.5 8.5a5 5 0 0 1 0 7', 'M19 5a9 9 0 0 1 0 14'],
  download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
  upload: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M17 8l-5-5-5 5', 'M12 3v12'],
  chevR: 'M9 6l6 6-6 6',
  close: ['M18 6L6 18', 'M6 6l12 12'],
  user: ['M20 21a8 8 0 1 0-16 0', 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
  dots: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
};

/* helper: resolve a channel color from a section/groove color name */
function chColor(name) {
  if (!name) return RD_CH.orange;
  return RD_CH[name] || (name[0] === '#' || name.startsWith('var(') ? name : RD_CH.orange);
}

/* ── LCD display ──────────────────────────────────────────── */
function LCD({ value, unit, sub, size = 56, pad = '10px 16px', style }) {
  const str = String(value);
  return (
    <div className="lcd" style={{ padding: pad, ...style }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span className="digits" style={{ fontSize: size, position: 'relative' }}>
          <span className="ghost" style={{ position: 'absolute', inset: 0, opacity: .14 }}>
            {str.replace(/[0-9]/g, '8')}
          </span>
          {str}
        </span>
        {unit && <span style={{ fontSize: size * 0.26, color: 'var(--rd-amber)', opacity: .7, letterSpacing: '.1em' }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: 10, color: 'var(--rd-amber)', opacity: .5, letterSpacing: '.16em', marginTop: 4, textTransform: 'uppercase' }}>{sub}</div>}
    </div>
  );
}

/* ── Knob ─────────────────────────────────────────────────── */
function Knob({ size = 48, angle = -40, label, value }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div className="knob" style={{ width: size, height: size }}>
        <div className="ind" style={{ transform: `translateX(-50%) rotate(${angle}deg)`, transformOrigin: '50% 156%' }} />
      </div>
      {label && <div className="eng" style={{ fontSize: 8.5 }}>{label}</div>}
      {value && <div className="mono" style={{ fontSize: 11, color: 'var(--rd-text-dim)' }}>{value}</div>}
    </div>
  );
}

/* ── Drum-notation staff ──────────────────────────────────── */
const LANE_DEFS = [
  { id: 'crash', label: 'Crash', glyph: 'x', color: 'var(--ch-teal)' },
  { id: 'hat',   label: 'Hi-hat', glyph: 'x', color: 'var(--ch-lime)' },
  { id: 'tom',   label: 'Tom', glyph: 'o', color: 'var(--ch-magenta)' },
  { id: 'snare', label: 'Caja', glyph: 'o', color: 'var(--ch-gold)' },
  { id: 'kick',  label: 'Bombo', glyph: 'o', color: 'var(--ch-orange)' },
];

function NoteHead({ glyph, color, size, accent }) {
  if (glyph === 'x') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" stroke={color} strokeWidth={accent ? 3.5 : 2.6} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${color})` }}>
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    );
  }
  return (
    <div style={{
      width: accent ? size : size * 0.78, height: accent ? size : size * 0.78,
      borderRadius: '50%', background: color,
      boxShadow: `0 0 8px ${color}, 0 0 2px ${color}`,
      border: accent ? '2px solid #fff6' : 'none',
    }} />
  );
}

function DrumStaff({ pattern, current = -1, laneH = 30, padLeft = 64, cell, style }) {
  const { resolution, beats = 4 } = pattern;
  const spb = resolution / beats;
  const lanes = LANE_DEFS.filter((l) => pattern.lanes.some((p) => p.id === l.id))
    .map((l) => ({ ...l, ...pattern.lanes.find((p) => p.id === l.id) }));
  const cellW = cell || 26;
  const gridW = resolution * cellW;
  return (
    <div className="staff" style={{ padding: '14px 14px 14px 0', overflowX: 'auto', ...style }}>
      <div style={{ position: 'relative', minWidth: padLeft + gridW }}>
        <div style={{ position: 'relative', height: 18, marginLeft: padLeft }}>
          {Array.from({ length: resolution }).map((_, s) => s % spb === 0 && (
            <div key={s} className="mono" style={{ position: 'absolute', left: s * cellW, width: cellW, textAlign: 'center',
              fontSize: 11, fontWeight: 700, color: s === current ? 'var(--rd-led)' : 'var(--rd-text-mut)' }}>
              {s / spb + 1}
            </div>
          ))}
        </div>
        <div style={{ position: 'relative' }}>
          {Array.from({ length: beats + 1 }).map((_, b) => (
            <div key={b} style={{ position: 'absolute', top: 0, bottom: 0, left: padLeft + b * spb * cellW, width: 1,
              background: b % beats === 0 ? 'rgba(255,177,58,.22)' : 'rgba(255,177,58,.1)' }} />
          ))}
          {current >= 0 && (
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: padLeft + current * cellW, width: cellW,
              background: 'rgba(255,122,26,.12)', boxShadow: 'inset 0 0 0 1px rgba(255,122,26,.4)' }} />
          )}
          {lanes.map((lane) => (
            <div key={lane.id} style={{ position: 'relative', height: laneH, display: 'flex', alignItems: 'center' }}>
              <div className="lane-line" style={{ left: padLeft, top: '50%' }} />
              <div className="eng" style={{ width: padLeft, paddingRight: 10, textAlign: 'right', fontSize: 9, color: lane.color }}>
                {lane.label}
              </div>
              {lane.hits.map((step) => {
                const accent = (pattern.accents?.[lane.id] || []).includes(step);
                return (
                  <div key={step} style={{ position: 'absolute', left: padLeft + step * cellW, width: cellW, top: 0, bottom: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <NoteHead glyph={lane.glyph} color={lane.color} size={laneH * 0.62} accent={accent} />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        {pattern.syllables && (
          <div style={{ position: 'relative', height: 26, marginTop: 6, borderTop: '1px solid rgba(255,177,58,.12)' }}>
            <div className="eng" style={{ position: 'absolute', left: 0, width: padLeft, top: 8, textAlign: 'right', paddingRight: 10, fontSize: 9 }}>voz</div>
            {pattern.syllables.map((syl, i) => (
              <div key={i} className="mono" style={{ position: 'absolute', left: padLeft + syl.step * cellW, width: cellW * 2, top: 6,
                fontSize: 12, color: 'var(--rd-led-soft)', fontWeight: 700 }}>{syl.text}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Brand mark ───────────────────────────────────────────── */
function Logo({ size = 26 }) {
  return (
    <div style={{ width: size, height: size, position: 'relative', flexShrink: 0,
      background: 'radial-gradient(circle at 32% 30%, var(--rd-led-soft), var(--rd-led-deep) 70%)',
      borderRadius: '50%', boxShadow: '0 0 12px rgba(255,122,26,.5), inset 0 1px 0 rgba(255,255,255,.4)' }}>
      <div style={{ position: 'absolute', inset: size * 0.3, borderRadius: '50%', background: 'var(--rd-void)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,.8)' }} />
    </div>
  );
}

/* ── User avatar ──────────────────────────────────────────── */
function Avatar({ size = 34, initial = 'M' }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(140deg,#3a3340,#1a151f)', border: '1px solid var(--rd-hair-strong)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: size * 0.4,
      color: 'var(--rd-text-dim)', boxShadow: 'inset 0 1px 0 var(--rd-edge-hi)' }}>{initial}</div>
  );
}

/* ── Sync status badge ────────────────────────────────────── */
function SyncBadge({ compact, label = 'Sincronizado' }) {
  if (compact) {
    return <div style={{ display: 'flex', justifyContent: 'center' }}>
      <span className="led on" style={{ '--c': 'var(--rd-cyan)', width: 7, height: 7 }} />
    </div>;
  }
  return (
    <div className="chip sync" style={{ width: '100%', justifyContent: 'flex-start' }}>
      <span className="led on" style={{ '--c': 'var(--rd-cyan)', width: 7, height: 7 }} />
      {label}
    </div>
  );
}

/* ── Topbar used inside screens ───────────────────────────── */
function TopBar({ title, sub, back = true, onBack, right, dense }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: dense ? '10px 14px' : '14px 18px',
      borderBottom: '1px solid #000', boxShadow: '0 1px 0 var(--rd-edge-hi)', flexShrink: 0,
      background: 'linear-gradient(180deg,var(--rd-panel-2),var(--rd-panel))' }}>
      {back && <button className="btn icon ghost" onClick={onBack}><Icon d={IC.back} size={18} /></button>}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: dense ? 16 : 20, fontWeight: 800, letterSpacing: '-.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        {sub && <div className="eng" style={{ fontSize: 9.5, marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>{right}</div>
    </div>
  );
}

/* ── Navigation model ─────────────────────────────────────── */
const RD_NAV = [
  { id: 'songs', label: 'Canciones', icon: IC.song },
  { id: 'grooves', label: 'Grooves', icon: IC.grid },
  { id: 'practice', label: 'Práctica', icon: IC.metronome },
  { id: 'learn', label: 'Aprende', icon: IC.book },
];

/* Left rail (tablet/desktop) — interactive */
function NavRail({ active, onNavigate, wide = false, items = RD_NAV }) {
  return (
    <nav className="rd-rail" style={{ width: wide ? 200 : 76, flexShrink: 0, flexDirection: 'column',
      background: 'linear-gradient(180deg,var(--rd-panel),var(--rd-case))', borderRight: '1px solid #000',
      boxShadow: 'inset -1px 0 0 var(--rd-edge-hi)', padding: '14px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: wide ? '4px 18px 18px' : '4px 0 18px', justifyContent: wide ? 'flex-start' : 'center' }}>
        <Logo size={26} />
        {wide && <span style={{ fontWeight: 800, letterSpacing: '-.02em', fontSize: 16 }}>BackBeat</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0 10px' }}>
        {items.map((n) => {
          const on = n.id === active;
          return (
            <button key={n.id} onClick={() => onNavigate && onNavigate(n.id)} title={n.label}
              style={{ appearance: 'none', border: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left',
              display: 'flex', alignItems: 'center', gap: 12, padding: wide ? '11px 12px' : '11px 0',
              justifyContent: wide ? 'flex-start' : 'center', position: 'relative',
              color: on ? 'var(--rd-led)' : 'var(--rd-text-mut)',
              background: on ? 'rgba(255,122,26,.1)' : 'transparent',
              boxShadow: on ? 'inset 0 0 0 1px rgba(255,122,26,.25)' : 'none' }}>
              {on && <span style={{ position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, background: 'var(--rd-led)', boxShadow: '0 0 8px var(--rd-led)' }} />}
              <Icon d={n.icon} size={20} />
              {wide && <span style={{ fontSize: 13, fontWeight: on ? 700 : 600 }}>{n.label}</span>}
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 'auto', padding: wide ? '0 14px' : '0 10px' }}>
        <SyncBadge compact={!wide} />
      </div>
    </nav>
  );
}

/* Bottom tabs (mobile) — interactive */
function NavTabs({ active, onNavigate, items = RD_NAV }) {
  return (
    <nav className="rd-tabs" style={{ background: 'linear-gradient(180deg,var(--rd-panel),var(--rd-case))',
      borderTop: '1px solid #000', boxShadow: 'inset 0 1px 0 var(--rd-edge-hi)', flexShrink: 0,
      paddingBottom: 'max(6px, env(safe-area-inset-bottom))' }}>
      {items.map((n) => {
        const on = n.id === active;
        return (
          <button key={n.id} onClick={() => onNavigate && onNavigate(n.id)} title={n.label}
            style={{ appearance: 'none', border: 0, cursor: 'pointer', font: 'inherit', background: 'transparent',
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 0 6px',
            color: on ? 'var(--rd-led)' : 'var(--rd-text-mut)' }}>
            <div style={{ position: 'relative' }}>
              <Icon d={n.icon} size={22} />
              {on && <span style={{ position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: 2, background: 'var(--rd-led)', boxShadow: '0 0 6px var(--rd-led)' }} />}
            </div>
            <span style={{ fontSize: 10, fontWeight: on ? 700 : 600, letterSpacing: '.01em' }}>{n.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

window.RD = {
  RD_CH, RD_CH_KEYS, chColor, Icon, IC, LCD, Knob, DrumStaff, LANE_DEFS, NoteHead,
  Logo, Avatar, SyncBadge, TopBar, RD_NAV, NavRail, NavTabs,
};
