# BackBeat

Chuleta personal para batería: metrónomo + conteo de compases + avisos de cambios y fills.

PWA mínima, sin build step. Se abre en cualquier navegador (móvil, tablet, ordenador) y se puede instalar en pantalla de inicio.

## Cómo usar

Abrir `index.html` directamente en el navegador, o servir la carpeta con cualquier servidor estático:

```bash
python3 -m http.server 8000
# luego abrir http://localhost:8000
```

## Estructura

- `index.html` — punto de entrada
- `styles.css` — estilos
- `js/audio.js` — motor de click con Web Audio API
- `js/scheduler.js` — avance por secciones/compases (próximamente)
- `js/speech.js` — avisos TTS (próximamente)
- `songs/` — canciones de ejemplo en JSON

## Formato de canción

```json
{
  "title": "Smoke on the Water",
  "bpm": 112,
  "beatsPerBar": 4,
  "sections": [
    { "name": "Intro", "bars": 4, "endCue": { "type": "fill", "say": "fill simple" } },
    { "name": "Estrofa", "bars": 8, "endCue": { "type": "change", "say": "estribillo" } }
  ]
}
```
