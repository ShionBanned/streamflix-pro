# StreamFlix Pro · Fuentes, audio, seguridad y subtítulos (15 de noviembre de 2026)

## Cambios

- Los iframes cloud ahora usan `sandbox` con origen opaco y sin permisos de ventanas emergentes, formularios, descargas ni navegación superior. Se retiró el antiguo interceptor de `window.open`, que no podía actuar dentro de un iframe ajeno, y el enlace para abrir proveedores no verificados en una pestaña nueva. Algunos proveedores pueden rechazar esta protección y dejar de funcionar. Los anuncios que el proveedor dibuje dentro de su propio iframe siguen bajo su control.
- El backend solo escucha en loopback y CORS acepta la interfaz local. La interfaz usa `127.0.0.1` para el proxy.
- Las fuentes directas HLS, MP4 o WebM se guardan por título y episodio en el navegador. Se pueden abrir y borrar desde el panel de fuentes. Son enlaces aportados por el usuario; no se promete que toda página web sea un archivo de video.
- Audio externo en MP3, M4A, AAC, Opus o WAV para reproducción P2P y directa. Silencia el audio del video, sigue play/pausa/salto/velocidad y permite ajustar el desfase entre -120 y +120 segundos. Se elige un archivo propio por sesión. No hay una biblioteca universal de doblaje latino; las pistas dependen de la edición y de los derechos de cada título.
- IA local Whisper con modelo multilingüe base y FFmpeg. En P2P inspecciona las pistas y usa la misma selección de idioma o pista manual que el reproductor. En fuente directa se puede elegir un archivo de audio o video. El audio se procesa en este PC. La tarea muestra extracción/transcripción y el VTT resultante se activa en el reproductor. Una película larga puede tardar considerablemente en CPU.
- `video::cue` ahora usa blanco seminegrita, sombra/contorno oscuro y fondo transparente, inspirado en el subtitulado de servicios de streaming. La apariencia exacta depende del navegador; no se afirma que sea un tema oficial de Netflix.
- El catálogo presenta la elección de idioma como **preferencia** y deja de prometer Latino, 4K o AAC antes de inspeccionar una fuente real.

## Alcance y límites

La transcripción crea texto en el idioma hablado; no traduce ni inventa doblaje. El modelo base puede equivocarse en nombres, acentos y voces superpuestas, y sus tiempos no tienen alineamiento fino de WhisperX. Hay ajuste manual de subtítulos. Para una fuente cloud dentro de un iframe de otro dominio, la app no puede leer su audio ni aplicar el VTT por encima del reproductor del proveedor. Se necesita una fuente directa o P2P.

No se agregaron dominios cloud no verificados. El diagnóstico anterior observó DNS, TLS y restricciones de iframe en varios dominios; agregar copias de esas páginas elevaría la exposición a publicidad sin crear una fuente de video confiable. La forma de ampliar el catálogo de motores es incorporar fuentes directas documentadas o proveedores con API y permisos verificables.

## Comprobación

- `backend`: `npm run check` y `npm test`.
- `frontend`: `npm run build`.
- Whisper local transcribió el clip oficial JFK de 11 segundos y produjo un VTT con tres fragmentos. También se verificó el servicio con el flujo FFmpeg → Whisper → VTT.
- El binario y modelo viven en `backend/.local/whisper` (ignorado por Git). El estado se consulta en `/api/ai/status` y `/api/health`.

Referencias: [Whisper.cpp](https://github.com/ggml-org/whisper.cpp), [sandbox de iframe en MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe), [WebVTT en MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebVTT_API).
