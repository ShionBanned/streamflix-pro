# Integración de propuestas — 16 de noviembre de 2026

Las dos propuestas se evaluaron contra la aplicación que se ejecuta en `Netflix 2.0 - copia`. Sus cifras de rendimiento, disponibilidad de canales y resultados de pruebas se tratan como hipótesis del documento, no como mediciones de esta versión.

## Parte 1: carga y audio

- `SmartPlayer` y `LiveTV` se cargan bajo demanda con una pantalla de espera breve. La compilación separa ambos módulos del archivo principal.
- Audio alternativo busca Cuevana o AnimeAV1 por el título actual y resuelve el episodio seleccionado. Si encuentra un archivo multimedia directo, lo ofrece como audio sincronizado. Si encuentra una página de reproductor, ofrece reproducir esa versión con el idioma indicado por el sitio. La URL manual y el archivo local siguen disponibles.
- Un iframe externo no da acceso fiable a una pista de audio independiente ni al reloj de reproducción. No se promete sincronización con esos servidores.

## Parte 2: televisión y fuentes de respaldo

- Las variantes del mismo canal se agrupan conservando sus fuentes. La identidad usa el ID de TV cuando existe, más país y categoría; de lo contrario usa el nombre normalizado.
- El reproductor prueba la siguiente fuente del canal cuando agota los reintentos de la actual.
- La categoría «Temáticos 24/7» muestra solo señales que figuran en las listas cargadas y cuyo nombre o grupo las identifica como continuas o temáticas. La app no inventa canales ni afirma que una marca cerrada esté disponible.

## Parte 3: CPU y verificación

- FFmpeg admite una conversión activa y hasta dos solicitudes en espera. Si la conexión se cierra, la conversión se cancela. La aceleración GPU no se activa sin comprobar el hardware y el códec.
- En esta parte, `npm test` en el backend activo: 23/23 pruebas. `npm run build -- --configLoader runner` en el frontend activo: correcto.

## Parte 4: salud de canales

- El reproductor comunica fallos de red solo después de agotar los reintentos de una fuente. Una reproducción con video confirmado restablece su estado.
- La salud se guarda localmente por hash de la URL; el archivo de estado no almacena enlaces, tokens ni credenciales.
- Tras fallos observados durante al menos 24 horas, la fuente baja de prioridad. Un canal solo se oculta cuando todas sus fuentes acumulan fallos observados durante al menos 48 horas. «Ver en revisión» permite volver a probarlo y recuperarlo.
- No se ejecutan sondeos masivos sobre listas externas. Una respuesta HTTP a HEAD no demuestra que una señal se reproduzca correctamente; el estado se basa en el reproductor real.

## Trabajo que requiere un contrato de fuente o una fase propia

- Descargas offline: la ficha de cada título permite elegir una fuente P2P publicada o un MP4/WebM directo vía HTTPS. La opción compacta descarga el video completo y convierte hasta 720p H.264/AAC con CRF 30; verifica la duración de la salida y conserva el original compatible si es más pequeño. Biblioteca local, progreso, reproducción por rangos y borrado. Máximo 4 GB de entrada, 2 GB de salida, 5 GB de biblioteca y dos trabajos simultáneos; las conversiones se serializan. Las URLs no se guardan en el índice. HLS, páginas externas y señales premium no se descargan con este flujo.
- Nuevos proveedores FAST, P2P y debrid: integrar solo contratos comprobados, permisos y enlaces vigentes; no asumir velocidades, catálogo o disponibilidad a partir de ejemplos del informe.
- Canales de suscripción: la sección Premium enlaza a Win Play/Win Sports+, DGO, Movistar, Claro y Tigo, incluidos accesos a otros paquetes como HBO. TV en vivo acepta listas M3U y cuentas Xtream aportadas por el usuario cuando sus condiciones permiten la reproducción; una señal con DRM requiere acuerdo y licencia del proveedor. No se agregó un scraper ni descifrado de DRM.

## Evaluación de vías no oficiales para canales premium

| Vía | Encaje actual | Límite observado |
| --- | --- | --- |
| Listas M3U de terceros y Xtream | El importador de TV en vivo ya las admite. | Un nombre de canal no verifica el derecho de acceso; señales y tokens pueden caducar o tener restricciones geográficas. |
| Sintonizador propio, capturadora o servidor doméstico | Posible fase posterior con un puente M3U local o con TVHeadend/Jellyfin. | Depende del hardware, de la red local y del permiso para ver o retransmitir cada señal. |
| Índices comunitarios de IPTV | Útiles para canales públicos/FAST; se mantienen como fuentes separadas. | No equivalen a un catálogo de canales de pago. |
| Extracción de enlaces de webs, cuentas prestadas o claves DRM | No se integra. | Las URLs de sesión son temporales y no constituyen una fuente estable ni autorizada. |

Fuentes técnicas consultadas: https://jellyfin.org/docs/general/server/live-tv/ , https://kodi.wiki/view/Add-on%3APVR_IPTV_Simple_Client , https://github.com/iptv-org/iptv . Opciones oficiales de Win Sports: https://www.winsports.co/mas-contenido/noticias/como-adquirir-win-sports-27572 , https://www.winsportsmas.com/ .

Verificación de esta fase: `npm run check` correcto; `npm test` 25/25; compilación del frontend correcta en una carpeta de salida nueva. Los endpoints offline respondieron con listado vacío y rechazo HTTP 400 de una URL local. Después de reiniciar el backend activo, un video público de prueba de MDN se descargó completo (1.128.375 bytes), respondió HTTP 206 a una lectura por rangos y se eliminó correctamente.

## Auditoría completa de la guía de expansión (9 páginas)

Las cifras de velocidad, latencia, cobertura y disponibilidad de la guía son objetivos o ejemplos, no mediciones de esta app. La afirmación de que KnightCrawler es un espejo intercambiable de Torrentio tampoco se asume: su repositorio actual lo describe como un complemento autoalojado orientado a debrid.

| Propuesta | Estado en la app | Límite comprobado |
| --- | --- | --- |
| Torrentio y API directa YTS | Integrados antes de esta fase. | La disponibilidad depende de cada proveedor. |
| KnightCrawler, MediaFusion, Comet y Annatar | Adaptador del protocolo Stremio con validación del manifiesto, recursos y tipo. Cada uno requiere su URL **configurada** de manifiesto en `.env`; las raíces públicas de MediaFusion y Comet se retiraron como predeterminadas porque no demostraron resultados reproducibles. Solo se muestran hashes BitTorrent o enlaces HTTPS realmente devueltos. | KnightCrawler es autoalojado y requiere debrid. Annatar también está orientado a debrid. MediaFusion y Comet generan manifiestos configurados; sus raíces públicas no equivalen a una configuración del usuario. En ausencia de manifiesto la app muestra «requiere manifiesto configurado», sin simular resultados. |
| API directa EZTV | Pendiente. | La guía da una URL de ejemplo incompleta; necesita verificación independiente de endpoint, contrato y datos de episodios. |
| Real-Debrid/TorBox directos | Pendiente. | Requieren cuenta, credenciales y reglas de acceso del proveedor. Los add-ons configurados pueden devolver un enlace HTTPS, pero eso no equivale a un conector directo de debrid. |
| Win Sports+ con scraper deportivo, AceStream o DASH/ClearKey | Sin implementar. | Los enlaces de sesión y las claves de terceros no son una fuente estable ni autorizada. TV en vivo ya acepta M3U/Xtream aportados por el usuario; Premium enlaza a operadores oficiales. |
| FAST oficiales Pluto/Tubi/Runtime/Plex | Parcial. Existe la categoría «Temáticos 24/7» sobre las listas cargadas. | No se añadieron catálogos directos de cada plataforma ni se afirmó que existan las franquicias concretas enumeradas por la guía. |
| Deduplicación y conmutación entre fuentes | Integrado. | Las fuentes se agrupan de forma conservadora; el reproductor pasa a la siguiente tras agotar reintentos. |
| Health-check y auto-purga | Integrado con observación pasiva, prioridad y ocultamiento reversible. | No se ejecuta sondeo masivo HEAD/Range ni borrado irreversible; una respuesta HTTP por sí sola no confirma reproducción. |
| Límite y cancelación de FFmpeg | Integrado. | Una conversión activa, dos en espera y cancelación al cerrar la conexión. |

Fuentes nuevas solicitadas fuera del PDF: PelisPlus (`pelisplushd.la`) y AnimeFLV (`animeflv.or.at`) se añadieron a la búsqueda por título, resolución del episodio publicado, selección de reproductor y panel de audio alternativo. Un iframe solo ofrece abrir esa versión de video; el audio sincronizado requiere un archivo multimedia directo. Las páginas pueden cambiar su HTML sin aviso.

Para instancias personales de add-ons Stremio, configura en `backend/.env` una o más variables `KNIGHTCRAWLER_MANIFEST_URL`, `MEDIAFUSION_MANIFEST_URL`, `COMET_MANIFEST_URL`, `ANNATAR_MANIFEST_URL` con la URL completa terminada en `/manifest.json` y reinicia el backend. La app no muestra esas URLs en la respuesta de fuentes. Obtén la dirección configurada desde la pantalla del propio proveedor, por ejemplo [MediaFusion](https://mediafusion.elfhosted.com/configure) o [Comet](https://comet.elfhosted.com/configure). Los repositorios de [KnightCrawler](https://github.com/knightcrawler-stremio/knightcrawler) y [Annatar](https://github.com/g0ldyy/annatar) explican cómo crear una instancia propia. No hay una URL universal válida para cuentas de terceros.

## Parte 5: descarga desde la ficha y corrección de add-ons

- El botón «Descargar» está en la cabecera de `DetailModal`. Busca fuentes por el título/episodio en `/api/resolve`, deja elegir la fuente y la calidad, e inicia el trabajo para la biblioteca offline. El formulario también acepta una URL directa propia. El panel Descargas distingue descarga, compresión, error y archivo completo.
- La compresión usa FFmpeg con H.264/AAC, CRF 30 y 720p máximo, sin ampliar videos pequeños. La prueba real final con el clip público de MDN pasó de 1.128.375 a 128.503 bytes, conservó la duración y respondió HTTP 206 en reproducción local; se eliminó el clip de prueba. Esa reducción no predice el tamaño de una película.
- Cuando el navegador detecta falta de conexión, la portada ofrece ir directamente a Descargas. La biblioteca y el reproductor local siguen funcionando con el backend del equipo.
- P2P tiene descarga de archivo seleccionado, límite de entrada, timeout sin datos y borrado del caché temporal. La ruta P2P pasó revisión de código y pruebas de validación; aún no se completó una descarga P2P real de punta a punta en este equipo.
- Las cuatro fuentes adicionales leen únicamente una URL de manifiesto configurada y validan que anuncie el recurso `stream` y el tipo solicitado. El estado real de la app sin manifiestos configurados es «requiere manifiesto configurado» para las cuatro.
- `npm run check`, `npm test` (30/30) y compilación del frontend fueron correctos después de estos cambios.

### Pendientes de fuente externa

- EZTV: el endpoint impreso en el PDF está truncado; el dominio de prueba no respondió desde este equipo. No se añadió una fuente que no se pudo verificar.
- Pluto, Tubi, Runtime y Plex: las listas públicas ya alimentan «Temáticos 24/7» cuando publican esas señales. No se encontraron contratos oficiales de inserción directa de los cuatro catálogos en esta app; no se agregaron HLS efímeros ni se etiquetaron marcas cerradas como gratuitas.
- Real-Debrid/TorBox: se pueden usar a través de un manifiesto personal de un add-on compatible. Un conector directo y su reproducción dependen de una cuenta y clave propias que aún no están configuradas.
- Win Sports+ y otros premium: se mantienen los enlaces oficiales y la importación de listas M3U/Xtream autorizadas por el usuario. No se incorporaron claves DRM ni scrapers de retransmisiones.

Verificación de la expansión: `npm test` 29/29, `npm run check` correcto y compilación del frontend correcta en una carpeta de salida nueva. El backend activo devolvió 20 resultados de búsqueda de PelisPlus y 4 reproductores para una película; AnimeFLV devolvió el título solicitado y 5 opciones para un episodio publicado. En la consulta de muestra P2P, KnightCrawler y Annatar aparecieron como no configurados, MediaFusion sin resultados y Comet no disponible. Estas son observaciones del momento, no promesas de disponibilidad futura.
