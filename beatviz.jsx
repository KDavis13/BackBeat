/* Beat visualizations — 3 modes that share the same "currentBeat" signal.
 * Each renders the current beat within the bar (0-indexed). */

function BeatDots({ beatsPerBar, currentBeat, accent }) {
  // Four (or N) big pills that light up; beat 0 is bigger / colored.
  return (
    <div className="bv-dots" style={{ '--n': beatsPerBar }}>
      {Array.from({ length: beatsPerBar }).map((_, i) => {
        const on = i === currentBeat;
        const isDown = i === 0;
        return (
          <div key={i}
               className={`bv-dot${on ? ' on' : ''}${isDown ? ' down' : ''}${accent && on ? ' accent' : ''}`}>
            <span className="bv-dot-num">{i + 1}</span>
          </div>
        );
      })}
    </div>
  );
}

function BeatCircle({ beatsPerBar, currentBeat, accent }) {
  // One big pulsing circle. Inner ring counts the beats around it.
  const angle = (360 / beatsPerBar) * currentBeat - 90;
  return (
    <div className="bv-circle-wrap">
      <div className={`bv-circle${currentBeat === 0 ? ' down' : ''}${accent ? ' accent' : ''}`}>
        <div className="bv-circle-inner">
          <span className="bv-circle-num">{currentBeat + 1}</span>
          <span className="bv-circle-of">/ {beatsPerBar}</span>
        </div>
      </div>
      <svg className="bv-circle-ring" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="0.8" />
        {Array.from({ length: beatsPerBar }).map((_, i) => {
          const a = (360 / beatsPerBar) * i - 90;
          const x = 50 + Math.cos(a * Math.PI / 180) * 46;
          const y = 50 + Math.sin(a * Math.PI / 180) * 46;
          const on = i === currentBeat;
          return (
            <circle key={i} cx={x} cy={y} r={on ? 2.2 : 1.2}
                    fill={on ? (i === 0 ? 'var(--accent-strong)' : 'var(--accent)') : 'rgba(255,255,255,.25)'} />
          );
        })}
        <circle cx={50 + Math.cos(angle * Math.PI / 180) * 46}
                cy={50 + Math.sin(angle * Math.PI / 180) * 46}
                r="3.2" fill="var(--accent)" />
      </svg>
    </div>
  );
}

function BeatTimeline({ beatsPerBar, currentBeat, beatPhase }) {
  // Horizontal bar with a moving playhead — phase is a smooth 0..1
  // through the current beat (filled in by the player on each rAF).
  const progress = ((currentBeat + (beatPhase || 0)) / beatsPerBar) * 100;
  return (
    <div className="bv-timeline">
      <div className="bv-timeline-track">
        <div className="bv-timeline-fill" style={{ width: `${progress}%` }} />
        {Array.from({ length: beatsPerBar }).map((_, i) => (
          <div key={i} className={`bv-timeline-tick${i === 0 ? ' down' : ''}${i === currentBeat ? ' on' : ''}`}
               style={{ left: `${(i / beatsPerBar) * 100}%` }} />
        ))}
        <div className="bv-timeline-head" style={{ left: `${progress}%` }} />
      </div>
      <div className="bv-timeline-labels">
        {Array.from({ length: beatsPerBar }).map((_, i) => (
          <span key={i} className={i === currentBeat ? 'on' : ''}>{i + 1}</span>
        ))}
      </div>
    </div>
  );
}

function BeatViz({ mode, beatsPerBar, currentBeat, accent, beatPhase }) {
  if (mode === 'circle') {
    return <BeatCircle beatsPerBar={beatsPerBar} currentBeat={currentBeat} accent={accent} />;
  }
  if (mode === 'timeline') {
    return <BeatTimeline beatsPerBar={beatsPerBar} currentBeat={currentBeat} beatPhase={beatPhase} />;
  }
  return <BeatDots beatsPerBar={beatsPerBar} currentBeat={currentBeat} accent={accent} />;
}

Object.assign(window, { BeatDots, BeatCircle, BeatTimeline, BeatViz });
