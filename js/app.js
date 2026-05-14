(function () {
  'use strict';

  const metronome = new BackBeat.Metronome();

  const els = {
    bpmInput: document.getElementById('bpmInput'),
    bpmValue: document.getElementById('bpmValue'),
    beatsPerBar: document.getElementById('beatsPerBar'),
    playBtn: document.getElementById('playBtn'),
    playLabel: document.querySelector('.playBtn__label'),
    playIcon: document.querySelector('.playBtn__icon'),
    dots: document.getElementById('beatDots'),
  };

  function renderDots(beatsPerBar) {
    els.dots.innerHTML = '';
    for (let i = 0; i < beatsPerBar; i++) {
      const dot = document.createElement('span');
      dot.className = 'beat__dot' + (i === 0 ? ' is-downbeat' : '');
      els.dots.appendChild(dot);
    }
  }

  function setActiveDot(beat) {
    const dots = els.dots.children;
    for (let i = 0; i < dots.length; i++) {
      dots[i].classList.toggle('is-active', i === beat);
    }
  }

  function clearActiveDot() {
    for (const dot of els.dots.children) dot.classList.remove('is-active');
  }

  function setPlayingUI(isPlaying) {
    els.playBtn.setAttribute('aria-pressed', String(isPlaying));
    els.playLabel.textContent = isPlaying ? 'Stop' : 'Play';
    els.playIcon.textContent = isPlaying ? '■' : '▶';
  }

  // Wire up state.
  metronome.onBeat = ({ beat }) => setActiveDot(beat);

  els.bpmInput.addEventListener('input', (e) => {
    const bpm = Number(e.target.value);
    metronome.setBpm(bpm);
    els.bpmValue.textContent = String(bpm);
  });

  els.beatsPerBar.addEventListener('change', (e) => {
    const n = Number(e.target.value);
    metronome.setBeatsPerBar(n);
    renderDots(n);
  });

  els.playBtn.addEventListener('click', async () => {
    if (metronome.isRunning) {
      metronome.stop();
      clearActiveDot();
      setPlayingUI(false);
    } else {
      await metronome.start();
      setPlayingUI(true);
    }
  });

  // Initial render.
  metronome.setBpm(Number(els.bpmInput.value));
  metronome.setBeatsPerBar(Number(els.beatsPerBar.value));
  renderDots(metronome.beatsPerBar);
})();
