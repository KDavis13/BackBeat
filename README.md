# BackBeat

Guía para baterías: metrónomo con scheduler de baja latencia, conteo de compases, avisos de cambios y fills, y gestor de onomatopeyas con percusión sintetizada.

Aplicación estática (HTML + CSS + React 18 vía CDN, sin build step). Se sirve como cualquier carpeta de ficheros estáticos.

## Cómo usar

```bash
npx serve .
# o cualquier servidor estático (php -S, http.server, etc.)
# Luego abrir http://localhost:8000
```

> El servidor es necesario en lugar de `file://` porque cargamos JSX vía Babel-standalone y `<script src="...jsx">` requiere HTTP.

## Pantallas

- **Biblioteca** — listado de canciones, importar/exportar JSON, crear/editar/borrar.
- **Editor** — título, artista, BPM, compás (3/4, 4/4, 6/4, 7/4), subdivisión por canción y por sección (negras/corcheas/tresillos/semicorcheas), secciones con compases, cues (cambio/fill/parada), texto TTS y onomatopeya asignada.
- **Player** — metrónomo Web Audio con lookahead scheduler, sidebar de secciones clicable (salto por sección y por compás), modos de visualización del beat (puntos/círculo/timeline), modos de aviso (banner/glow/tinte/números enormes), overlay de onomatopeya con percusión sincronizada.
- **Onomatopeyas** — gestor de patrones rítmicos en grid (resolución 8/12/16/24), filas kick/snare/tom-hi/tom-low/hat, preview con loop al BPM de la canción.

## Persistencia

Canciones y onomatopeyas se guardan en `localStorage` (claves `backbeat.songs.v3`, `backbeat.onoma.v3`). El botón de exportar bajará un JSON con todo.

## PWA

`manifest.webmanifest` + `sw.js` la hacen instalable y offline-first. Tras la primera carga sobre HTTPS, el service worker cachea los assets y la app arranca sin conexión.

Para instalar en iPhone necesitas servir sobre **HTTPS** (GitHub Pages, Cloudflare Pages, Netlify Drop, etc.). Desde `localhost` el SW funciona para probar pero iOS no te dejará añadirla a la pantalla de inicio.

Durante la reproducción, el **Screen Wake Lock** mantiene la pantalla encendida (iOS 16.4+ Safari y Chrome/Edge). Se libera al pausar o salir del Player.

## Stack

- React 18 + ReactDOM (UMD, vía CDN)
- Babel standalone (transforma JSX en el navegador)
- Web Audio API para metrónomo y percusión sintetizada
- SpeechSynthesis API para los avisos de voz
- Service Worker + Manifest para instalación PWA

## Estructura

- `index.html` — entrypoint y carga de scripts
- `styles.css`, `player.css`, `features.css` — sistema de diseño + componentes
- `metronome.js` — engine de audio (scheduler + percusión)
- `data.js` — datos de ejemplo y helpers de almacenamiento
- `app.jsx` — root, router de pantallas y panel de tweaks
- `player.jsx`, `library.jsx`, `editor.jsx`, `onoma.jsx`, `beatviz.jsx`, `tweaks-panel.jsx` — componentes
