import { buildEmbedServers } from '../../shared/cloudProviders.mjs';

const configuredOrigins = new Set(buildEmbedServers({ tmdbId: 1 }).flatMap(server => server.mirrors.map(mirror => new URL(mirror.url).origin)));
const cache = new Map();

export async function probeMirror(mirror, { fetchImpl = fetch, timeoutMs = 6000 } = {}) {
  const started = Date.now(); let url = mirror.url;
  const result = { serverId: mirror.serverId, mirrorId: mirror.id, url: mirror.url };
  const finish = (status, reason, httpStatus) => ({ ...result, status, reason, httpStatus, checkedAt: Date.now(), latencyMs: Date.now() - started, playbackVerified: false });
  try {
    const signal = AbortSignal.timeout(timeoutMs);
    for (let redirects = 0; redirects < 4; redirects++) {
      if (!configuredOrigins.has(new URL(url).origin)) return finish('redirected', 'El destino cambió de dominio; no se verificó la reproducción.');
      const response = await fetchImpl(url, { redirect: 'manual', signal });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        if (!response.headers.get('location')) return finish('unavailable', 'Redirección sin destino.', response.status);
        url = new URL(response.headers.get('location'), url).href; continue;
      }
      const xfo = response.headers.get('x-frame-options') || '';
      const ancestors = /frame-ancestors\s+([^;]+)/i.exec(response.headers.get('content-security-policy') || '')?.[1];
      if (!response.ok) {
        await response.body?.cancel();
        return finish(response.status === 403 ? 'challenge' : 'unavailable', `El servidor devuelve HTTP ${response.status}.`, response.status);
      }
      if (/DENY|SAMEORIGIN/i.test(xfo) || (ancestors && !/\*/.test(ancestors))) {
        await response.body?.cancel(); return finish('frame-blocked', 'El servidor restringe la carga dentro de otra página.', response.status);
      }
      const reader = response.body?.getReader(); let sample = '';
      if (reader) {
        try {
          const decoder = new TextDecoder();
          while (sample.length < 32768) { const { done, value } = await reader.read(); if (done) break; sample += decoder.decode(value, { stream: true }); }
        } finally { await reader.cancel(); }
      }
      if (/just a moment|checking your browser|attention required|cf-chl-|verify you are human/i.test(sample)) return finish('challenge', 'La página exige una verificación web.', response.status);
      if (/domain (?:is |may be )?for sale|buy this domain|domain has expired|sedo\.com/i.test(sample)) return finish('unavailable', 'El dominio muestra una página de venta o vencimiento.', response.status);
      return finish('reachable', 'La página responde; el inicio del video todavía debe confirmarse en el reproductor.', response.status);
    }
    return finish('unavailable', 'Demasiadas redirecciones.');
  } catch (error) {
    const code = error.cause?.code || error.code || error.name;
    if (/CERT|TLS/.test(code)) return finish('invalid-certificate', 'El certificado TLS del servidor no es válido.');
    return finish('unavailable', code === 'ENOTFOUND' ? 'El dominio no resuelve en DNS.' : 'La conexión falló o agotó el tiempo de espera.');
  }
}

export async function checkCloudHealth(params, options = {}) {
  const servers = buildEmbedServers(params);
  const mirrors = servers.flatMap(server => server.mirrors.filter(mirror => (!params.serverId || server.id === params.serverId) && (!params.mirrorId || mirror.id === params.mirrorId)).map(mirror => ({ ...mirror, serverId: server.id })));
  let index = 0; const results = [];
  await Promise.all(Array.from({ length: Math.min(5, mirrors.length) }, async () => {
    while (index < mirrors.length) {
      const mirror = mirrors[index++]; const cached = cache.get(mirror.url);
      if (cached && Date.now() - cached.at < 120000) { results.push(await cached.promise); continue; }
      const promise = probeMirror(mirror, options);
      if (cache.size >= 200) cache.delete(cache.keys().next().value);
      cache.set(mirror.url, { at: Date.now(), promise }); results.push(await promise);
    }
  }));
  return { checkedAt: Date.now(), results, note: 'Un HTTP 200 confirma la página, no la disponibilidad del video, idioma o subtítulos.' };
}
