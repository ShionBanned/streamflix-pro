# StreamFlix Pro V2.0 — Plataforma Personal de Streaming Híbrida ($0 Costo)

Plataforma personal de streaming para películas, series (VOD), anime estilo Crunchyroll y televisión en vivo (IPTV), con interfaz moderna estilo Netflix, modo oscuro, resolución inteligente de fuentes P2P (Torrentio Pro con trackers latino y anime) y conmutación automática o manual a 3 servidores Auto-Embed de alta disponibilidad.

---

## 🏗️ Arquitectura del Sistema

```text
/Netflix 2.0 - copia
├── start.bat                 # Script de arranque en 1 clic (Backend + Frontend)
├── /backend                  # Middleware Express en puerto 4000
│   ├── .env                  # PORT=4000, TMDB_API_KEY, TMDB_READ_TOKEN
│   ├── server.js             # API REST principal y endpoints
│   └── /services
│       ├── tmdbService.js    # TMDB en es-MX, Anime, Hubs, Tráilers y extractor de imdb_id
│       ├── torrentio.js      # Scraper/Parser Torrentio Pro (trackers latino y anime + scoring)
│       ├── streamEngine.js   # Motor P2P WebTorrent con HTTP Range 206 y autolimpieza de disco
│       ├── iptvParser.js     # Lector de listas M3U y proxy anti-CORS
│       ├── subtitleService.js# Buscador OpenSubtitles v3 y conversor SRT a WebVTT
│       └── externalPlayer.js # Lanzador nativo de VLC / MPV (Audio AC3/DTS y dual audio)
└── /frontend                 # Interfaz Netflix en React + Vite + TailwindCSS
    ├── /src
    │   ├── /hooks
    │   │   └── useUserMedia.js   # Continuar Viendo y Mi Lista persistidos en localStorage
    │   ├── /components
    │   │   ├── Navbar.jsx        # Navegación con pestañas Inicio, Películas, Series, Anime, TV, Mi Lista
    │   │   ├── HeroBanner.jsx    # Billboard gigante con tráiler de YouTube a los 3s y botón de audio
    │   │   ├── PlatformHubs.jsx  # Botones rápidos Netflix, Max, Disney+, Prime, Crunchyroll, Apple TV+
    │   │   ├── MediaGrid.jsx     # Tarjetas estándar y tarjetas 16:9 de Continuar Viendo con barra roja
    │   │   ├── DetailModal.jsx   # Sinopsis, selector de temporadas, episodios y botón Mi Lista
    │   │   ├── SmartPlayer.jsx   # Reproductor Pro con selector de calidades, sync de subtítulos y siguiente episodio
    │   │   └── LiveTV.jsx        # Guía de canales IPTV + Reproductor HLS.js
    │   ├── App.jsx               # Gestor de estado principal
    │   └── main.jsx
```

---

## ⚡ Novedades V2.0 Pro

### 1. Torrentio Pro (Trackers Latino & Anime)
- Indexación de proveedores en español: `cinecalidad`, `pelisenhd`, `spanish`.
- Indexación de proveedores de anime: `nyaasi`, `tokyotosho`, `anidex`, `horriblesubs`.
- Búsqueda directa de episodios en la API pública de EZTV como respaldo de Torrentio, sin clave de API.
- **Sistema de Puntuación:**
  - Pistas en español latino (`🇲🇽`, `Latino`, `Cinecalidad`, `Dual`, `Multi`): +500 pts.
  - Pistas en castellano (`🇪🇸`, `Castellano`, `Spa`): +300 pts.
  - Anime japonés con subtítulos oficiales (`Erai-raws`, `SubsPlease`, `Multi-Subs`): +400 pts.
  - Resolución 1080p (+200 pts), 4K (+150 pts), 720p (+80 pts).
  - Semillas: `seeders * 2`.
- **Selector Manual de Calidades/Audios:** Menú desplegable en el reproductor para alternar entre todas las versiones detectadas.

### 2. Módulo de Anime (Crunchyroll Style) & Hubs de Plataformas
- **Pestaña Anime:** Descubre series y películas de anime en emisión y clásicos con subtítulos oficiales.
- **Hubs de Plataformas:** Filtro directo con 1 clic para:
  - Netflix (`provider 8`)
  - Max / HBO (`provider 1899`)
  - Disney+ (`provider 337`)
  - Prime Video (`provider 119`)
  - Crunchyroll (`provider 283`)
  - Apple TV+ (`provider 350`)

### 3. Calidad de Vida Netflix (LocalStorage)
- **Continuar Viendo:** Guarda automáticamente el progreso cada 10 segundos. Muestra una barra roja de porcentaje y tiempo restante en la fila superior del Home, con botón para reanudar al instante y botón "X" para descartar.
- **Mi Lista (Watchlist):** Guarda títulos favoritos con un clic desde el Hero Banner, tarjetas o modal de detalles. Pestaña dedicada en la barra de navegación.
- **Siguiente Episodio Automático:** A los últimos 25 segundos de un episodio, muestra una cuenta regresiva flotante de 10 segundos con opción de "Reproducir Ahora" o "Cancelar".

### 4. Hero Banner Dinámico con Tráiler
- Si existe un tráiler oficial de YouTube, realiza un fade-in suave a los 3 segundos reproduciéndolo en segundo plano con control de sonido (Mute / Unmute).

### 5. Sincronizador de Subtítulos y Autolimpieza de Disco
- **Sincronizador en Vivo:** Botones `Sub -0.5s` y `Sub +0.5s` para corregir desfaces en tiempo real.
- **Autolimpieza de Disco:** Al cerrar el reproductor o cambiar de título, el backend ejecuta `torrent.destroy({ destroyStore: true })`, garantizando que la memoria y el disco temporal nunca se llenen.

### 6. Agregador IPTV de listas públicas
- **Fusión en Paralelo:** Descarga y normaliza nueve listas públicas M3U por idioma, país y categoría. Los canales FAST aparecen cuando figuran en esas listas; no existe una integración directa con el catálogo de Pluto TV.
- **Soporte Xtream Codes & M3U Privadas:** Modal para importar listas privadas o servidores Xtream Codes con persistencia en `localStorage`.
- **Proxy Anti-CORS con Reescritura Dinámica:** Reescribe las rutas de los manifiestos `.m3u8` y chunks `.ts` para que todas las peticiones pasen por el middleware con cabeceras `Access-Control-Allow-Origin: *`.
- **Integración Nativa VLC Media Player:** 1 clic para abrir cualquier stream o canal en VLC con aceleración por hardware completa y decodificación de audio multicanal (AC3/DTS/E-AC3).

---

## 🚀 Cómo Iniciar la Plataforma

Haz doble clic en:
```bat
start.bat
```
O desde la consola:
```bash
# Terminal 1: Backend
cd backend && npm start

# Terminal 2: Frontend
cd frontend && npm run dev
```
Abre en tu navegador: [http://localhost:5173](http://localhost:5173)


## Revisión de reproducción (14/11/2026)

El panel de servidores incorpora **Diagnosticar espejos**, **Probar siguiente** y **Abrir fuente directa** (HLS/MP4/WebM). Las páginas externas pueden estar caídas o impedir el uso de iframe; HTTP 200 no garantiza que un título se reproduzca. El DSP y la conversión de audio solo pueden actuar sobre fuentes locales o directas compatibles.

La corrección de FFmpeg, los ajustes de subtítulos y la propuesta de IA están documentados en [REVIEW_PLAYBACK.md](REVIEW_PLAYBACK.md). Validación: `npm test` en `backend` y `npm run build` en `frontend`.
# Actualización de fuentes, audio y subtítulos

Consulta [la revisión del 15 de noviembre de 2026](REVIEW_UPDATE_2026-11-15.md) para el aislamiento de proveedores externos, fuentes directas guardadas, audio latino externo y subtítulos con Whisper local.

## Mantenimiento y offline HLS (17/11/2026)

La ficha y el reproductor aceptan para descarga un enlace HTTPS `.m3u8` de video bajo demanda. El servidor descarga manifiesto y segmentos TS/fMP4, verifica que cada destino sea HTTPS público y guarda un MP4 local. Se admiten listas VOD completas sin DRM y con audio integrado. Las señales en vivo, cifrado, audio HLS separado y listas con rangos quedan fuera de este flujo.

Comprobaciones desde cada carpeta:

```powershell
cd backend
npm run check
npm run lint
npm test
cd ../frontend
npm run lint
npm run typecheck
npm test
npm run build
```

El tipado gradual cubre los utilitarios y controles nuevos; todavía no es una migración completa a TypeScript. La [nota de mantenimiento](MAINTENANCE_2026-11-17.md) describe el alcance y las integraciones que requieren configuración externa.

