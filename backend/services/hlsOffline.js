import path from 'node:path';

const MAX_SEGMENTS = 2000;
const ALLOWED_SEGMENT_EXTENSIONS = new Set(['.ts', '.m4s', '.mp4']);

export function parseHlsPlaylist(text, baseUrl) {
  if (typeof text !== 'string' || text.length > 1_000_000 || !text.trimStart().startsWith('#EXTM3U')) {
    throw new Error('El servidor no devolvió una lista HLS válida.');
  }
  const lines = text.replace(/\r/g, '').split('\n').map((line) => line.trim()).filter(Boolean);
  const variants = [];
  for (let index = 0; index < lines.length; index++) {
    if (!lines[index].startsWith('#EXT-X-STREAM-INF:')) continue;
    const attributes = lines[index].slice('#EXT-X-STREAM-INF:'.length);
    const uri = lines[index + 1];
    if (!uri || uri.startsWith('#')) throw new Error('La variante HLS no tiene URL.');
    variants.push({
      url: new URL(uri, baseUrl),
      bandwidth: Number(/(?:^|,)BANDWIDTH=(\d+)/.exec(attributes)?.[1] || 0),
      separateAudio: /(?:^|,)AUDIO=/.test(attributes),
    });
    index++;
  }
  if (variants.length) {
    const supported = variants.filter((variant) => !variant.separateAudio);
    if (!supported.length) throw new Error('Esta lista HLS usa audio separado; no se puede guardar todavía.');
    supported.sort((a, b) => b.bandwidth - a.bandwidth);
    return { kind: 'master', url: supported[0].url };
  }

  if (!lines.includes('#EXT-X-ENDLIST') || !lines.some((line) => line.startsWith('#EXTINF:'))) {
    throw new Error('Solo se admiten listas HLS VOD completas.');
  }
  if (lines.some((line) => /^#EXT-X-(?:KEY|SESSION-KEY|BYTERANGE|I-FRAMES-ONLY|PART|PRELOAD-HINT|SKIP)/.test(line))) {
    throw new Error('Esta lista HLS usa cifrado, rangos o segmentos de baja latencia no compatibles.');
  }

  const resources = [];
  const localLines = [];
  for (const line of lines) {
    if (line.startsWith('#EXT-X-MAP:')) {
      const match = /URI="([^"]+)"/.exec(line);
      if (!match || /BYTERANGE=/.test(line)) throw new Error('Inicialización HLS no compatible.');
      const url = new URL(match[1], baseUrl);
      const name = `init${String(resources.length).padStart(5, '0')}.mp4`;
      resources.push({ url, name });
      localLines.push(`#EXT-X-MAP:URI="${name}"`);
    } else if (!line.startsWith('#')) {
      const url = new URL(line, baseUrl);
      const extension = path.posix.extname(url.pathname).toLowerCase();
      if (!ALLOWED_SEGMENT_EXTENSIONS.has(extension)) {
        throw new Error('La lista HLS contiene un formato de segmento no compatible.');
      }
      const name = `seg${String(resources.length).padStart(5, '0')}${extension}`;
      resources.push({ url, name });
      localLines.push(name);
    } else if (/^#(?:EXTM3U|EXTINF:|EXT-X-(?:VERSION:|TARGETDURATION:|MEDIA-SEQUENCE:|PLAYLIST-TYPE:|INDEPENDENT-SEGMENTS$|DISCONTINUITY$|ENDLIST$))/.test(line)) {
      localLines.push(line);
    }
    if (resources.length > MAX_SEGMENTS) throw new Error('La lista HLS supera el límite de segmentos.');
  }
  if (!resources.length) throw new Error('La lista HLS no contiene segmentos.');
  return { kind: 'media', resources, localPlaylist: `${localLines.join('\n')}\n` };
}

export function buildHlsRemuxArgs(manifest, output) {
  return [
    '-hide_banner', '-loglevel', 'error', '-nostdin', '-protocol_whitelist', 'file,crypto,data',
    '-allowed_extensions', 'ALL', '-i', manifest,
    '-map', '0:v:0', '-map', '0:a:0?', '-c', 'copy', '-movflags', '+faststart',
    '-f', 'mp4', output,
  ];
}
