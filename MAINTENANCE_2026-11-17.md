# Mantenimiento e integraciones — 17 de noviembre de 2026

## Entregado en código

- Se retiró la sección Premium, su ruta y sus enlaces a proveedores de pago. La app mantiene la importación de listas M3U/Xtream aportadas por el usuario.
- Offline HLS VOD: enlace HTTPS `.m3u8`, selección de una variante con audio integrado, descarga local de segmentos TS/fMP4 y remultiplexado a MP4 con FFmpeg. Cada manifiesto, redirección y segmento pasa por resolución DNS y validación de IP pública. Límite de 4 GB de entrada, cuota y cola existentes. No se guardan las URLs firmadas en `index.json`.
- Rechazo explícito de HLS en vivo, cifrado/DRM, audio externo, `BYTERANGE` y partes de baja latencia. La compatibilidad de una fuente concreta depende de su manifiesto y códecs. No se probó una descarga HLS HTTPS completa contra un proveedor externo.
- Extracción gradual de controles y fuentes manuales de `SmartPlayer`, de tarjetas de `LiveTV`, de opciones y límite de errores de `App`, y del flujo de descargas de `DetailModal`.
- ESLint para frontend, backend y módulos compartidos; comprobación gradual de tipos JavaScript con TypeScript; Vitest y Testing Library para interacciones del selector y persistencia de progreso.
- Caché IPTV con escrituras serializadas para evitar que dos actualizaciones compitan por el mismo archivo temporal. Los índices de descargas y salud ya utilizaban escritura temporal más renombrado; no se justifica migrarlos a SQLite sin un problema concreto de concurrencia multiproceso o consultas.
- EZTV directo para episodios: API pública documentada, búsqueda por IMDb, validación de temporada/episodio y hash, hasta cuatro páginas de resultados y degradación a otras fuentes cuando falla. Comprobado con respuesta HTTP real y resultados visibles en el agregador. Episodios antiguos fuera de esas páginas pueden seguir dependiendo de Torrentio.

## Fuentes pendientes de datos externos

- KnightCrawler, MediaFusion, Comet y Annatar: adaptador disponible; requieren URL personal de manifiesto en `backend/.env`.
- Real-Debrid y TorBox: no hay conector directo; requieren cuenta, credenciales y contrato probado. Un add-on configurado puede entregar una URL HTTPS sin constituir un conector directo.
- FAST directos y Win Sports+: continúan las listas públicas. Una integración directa requiere fuente y autorización comprobables; la app ya no muestra accesos a planes de pago.

### Investigación FAST directa (17/11/2026)

- Pluto TV publica una vía de contacto para socios de distribución, pero no se verificó una API pública para reproducir sus señales desde aplicaciones de terceros. Sus términos describen una licencia limitada de uso del servicio.
- La documentación de The Roku Channel exige incorporación como socio para distribuir canales lineales. La API de Plex documentada para desarrolladores corresponde a Plex Media Server, no a un feed abierto de sus canales FAST.
- Existen listas comunitarias de emisiones gratuitas, pero son agregadores M3U, como los que la app ya admite. No se presentarán como integración directa con un proveedor FAST.

## Verificación

- Backend: 35/35 pruebas con acceso a loopback, más `npm run check` y lint.
- Frontend: 6/6 pruebas de Vitest, lint, comprobación gradual de tipos y build de Vite.
- FFmpeg local: listas VOD TS y fMP4 convertidas a MP4 en pruebas.
- No se ha validado en navegador el recorrido completo de descarga HLS ni probado con una fuente remota real.
