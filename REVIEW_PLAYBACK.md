# Revisión de reproducción · 14 de noviembre de 2026

Proyecto revisado: `Netflix 2.0 - copia` (StreamFlix Pro, interfaz en el puerto 5173).

## Hallazgos y correcciones

- **Cloud:** el cliente y el servidor construían listas distintas. Ahora comparten `shared/cloudProviders.mjs`. Se eliminó el título de sustitución `550` cuando falta un ID y se deduplicaron espejos idénticos.
- **Disponibilidad:** los espejos se anunciaban como verificados sin comprobarlos. El panel incorpora diagnóstico real de HTTP, DNS, TLS, restricciones de iframe y páginas de verificación, con caché de dos minutos y concurrencia limitada. HTTP 200 significa página accesible; no garantiza que el video ni un idioma estén disponibles.
- **Recuperación:** después de 25 segundos sin confirmación del reproductor se ofrece cambiar de espejo o diagnosticar fuentes. El cambio recorre las alternativas sin repetir las ya intentadas y omite los fallos confirmados en el diagnóstico.
- **Progreso:** se eliminó el incremento artificial de cinco segundos cuando el iframe no reproduce. Los mensajes deben proceder de la ventana del iframe activo y de su origen exacto. Los proveedores que no envíen progreso compatible no tendrán reanudación automática fiable.
- **FFmpeg:** la conversión ya no se corta al cerrarse la petición HTTP de entrada; finaliza con la respuesta o la desconexión del cliente. La entrada usa HTTP con rangos, en lugar de un pipe no posicionable que falla con muchos MP4. Se gestionan fallos del proceso y sus salidas.
- **Audio:** se inspeccionan las pistas reales; el idioma es una preferencia y la selección manual tiene prioridad. La conversión conserva la posición mediante un nuevo inicio en el archivo original. El DSP arranca a volumen normal, sin realce vocal ni compresión nocturna. Los controles DSP se deshabilitan para reproductores cloud ajenos.
- **Proxy de medios:** conserva Range, HEAD, 206 y Content-Range, transmite también recursos sin extensión sin cargar el archivo entero en memoria y conserva Referer/UA en las sublistas HLS. Los streams dejan de cancelarse con el cierre de la petición de entrada.
- **Fuente directa:** el panel permite abrir HLS, MP4 o WebM accesibles para el usuario. El reproductor local controla audio, subtítulos HLS y archivos SRT/VTT, con ajuste de sincronización. Se carga bajo demanda.
- **Subtítulos:** conversión SRT/VTT compartida, soporte de BOM/CRLF, errores reales de descarga y ajuste basado en marcas originales, sin acumular desplazamientos. Se vuelve a aplicar después de cargar las pistas o reiniciar una conversión. Las descargas remotas usan identificadores temporales emitidos por el backend, con límite de tamaño.

## Comprobaciones externas

En la prueba de las rutas configuradas para una serie se observaron:

| Ruta o familia | Resultado observado |
| --- | --- |
| VidSrc.in, VidSrc.xyz, VidSrc.icu, MoviesAPI, AutoEmbed | Varios dominios no resuelven en DNS |
| VidSrc.cc y VidLink | HTTP 403, verificación web y restricción SAMEORIGIN |
| Smashy Player | Certificado TLS no válido |
| VidSrc.net | Cadena de certificados no aceptada por el equipo |
| VidSrc.pm | HTTP 520 |
| MultiEmbed DirectStream con TMDB | HTTP 404 en la ruta consultada |
| VidSrcMe.ru, 2Embed y 2Embed.skin | HTTP 200 de página; video completo no certificado |
| Videasy, NontonGo y Smashy Embed | Redirecciones que requieren comprobar el destino |

Estos resultados son puntuales y pueden cambiar. No se deshabilitó TLS ni se intentó saltar verificaciones, restricciones regionales o controles del proveedor. Un proxy de medios no puede convertir una página de iframe en un archivo reproducible ni controlar sus pistas sin una API del proveedor.

## Subtítulos con IA

La IA aún **no está instalada ni activada**. No se crean costes externos ni se descargan modelos automáticamente.

Para películas y episodios, recomiendo una tarea previa: extraer la pista de audio correcta con FFmpeg, transcribir con faster-whisper y alinear con WhisperX, guardar VTT por versión del archivo y pista de audio, y revisarlo. El alineamiento mejora las marcas temporales; la revisión humana sigue siendo necesaria para nombres, acentos, música y diálogos superpuestos.

Para TV en vivo, se necesita acceso directo al audio. Una implementación por ventanas de audio superpuestas, detección de voz y confirmación de fragmentos estables puede usar Whisper-Streaming o un servicio ASR de streaming. Debe incorporar el reloj del video, descartar resultados anteriores después de un salto y compensar el retraso de transcripción. La precisión y la latencia deben medirse con el hardware y los idiomas reales; no es razonable prometer subtítulos perfectos sin retraso.

En un iframe externo no podemos leer el audio ni inyectar pistas locales arbitrariamente. Primero hace falta una fuente de medios directa o una integración explícita del proveedor. Transcribir y traducir son operaciones diferentes; el español traducido necesita además revisión y alineamiento.

Fuentes primarias: [faster-whisper](https://github.com/SYSTRAN/faster-whisper), [WhisperX](https://github.com/m-bain/whisperX), [Whisper-Streaming](https://github.com/ufal/whisper_streaming).

## Validación reproducible

En `backend`: `npm run check` y `npm test`.

Las diez pruebas verifican IDs/espejos, mensajes del iframe, rangos HTTP, sincronización, estados cloud, selección de audio, proxy y conversión FFmpeg. La prueba de conversión genera un clip de tres segundos con dos pistas, sirve un MP4 mediante HTTP y verifica la salida AAC; no descarga torrents.

En `frontend`: `npm run build`.

Comprobación visual completada: catálogo y panel de fuentes operativos; diagnóstico de 25 rutas con 6 páginas accesibles para el título consultado; reproducción directa del corto abierto Big Buck Bunny a 1280×720, readyState 4 y reloj avanzando. No se certificó la reproducción completa de títulos comerciales ni se descargaron sus torrents. La prueba visual detectó y permitió corregir un problema de orden de inicialización de React antes de finalizar.


Pendientes recomendados: dividir el paquete inicial de la interfaz (Vite aún advierte de un chunk mayor de 500 kB), medir la compatibilidad por códec en los navegadores de destino y añadir alineamiento de subtítulos con IA cuando se disponga de una pista de audio directa y del hardware elegido.
