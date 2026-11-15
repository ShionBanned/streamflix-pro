export function readPlayerMessage(event, frame, expectedUrl) {
  if (!frame?.contentWindow || event.source !== frame.contentWindow) return null;
  try {
    if (event.origin !== new URL(expectedUrl).origin) return null;
    const raw = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    if (!raw || typeof raw !== 'object') return null;
    const payload = raw.data && typeof raw.data === 'object' ? raw.data : raw;
    const currentTime = payload.currentTime ?? payload.time ?? (typeof payload.progress === 'number' ? payload.progress : payload.progress?.watched);
    const duration = payload.duration ?? payload.progress?.duration;
    if (!Number.isFinite(currentTime) || currentTime < 0 || currentTime > 7 * 24 * 3600) return null;
    if (duration !== undefined && (!Number.isFinite(duration) || duration <= 0 || currentTime > duration + 5)) return null;
    return { currentTime, duration, event: payload.event || raw.event || '' };
  } catch { return null; }
}

export function parseByteRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(size) || size <= 0) return { status: 416 };
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] ? (match[2] ? Math.min(Number(match[2]), size - 1) : size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) return { status: 416 };
  return { status: 206, start, end, length: end - start + 1 };
}

export function shiftSubtitleCues(cues, offset, originals) {
  for (const cue of Array.from(cues || [])) {
    if (!originals.has(cue)) originals.set(cue, [cue.startTime, cue.endTime]);
    const [start, end] = originals.get(cue);
    const shiftedStart = Math.max(0, start + offset);
    const shiftedEnd = Math.max(shiftedStart + 0.001, end + offset);
    if (cue.startTime !== shiftedStart) cue.startTime = shiftedStart;
    if (cue.endTime !== shiftedEnd) cue.endTime = shiftedEnd;
  }
}

export function nextCloudMirror(servers, serverId, mirrorIndex, attempted = new Set(), health = []) {
  const mirrors = servers.flatMap(server => server.mirrors.map((mirror, index) => ({ serverId: server.id, index, url: mirror.url, id: mirror.id })));
  const start = mirrors.findIndex(mirror => mirror.serverId === serverId && mirror.index === mirrorIndex);
  const unavailable = new Set(health.filter(result => ['unavailable', 'frame-blocked', 'challenge', 'invalid-certificate'].includes(result.status)).map(result => result.url));
  for (let step = 1; step <= mirrors.length; step++) {
    const candidate = mirrors[(Math.max(start, 0) + step) % mirrors.length];
    if (candidate && !attempted.has(candidate.url) && !unavailable.has(candidate.url)) return candidate;
  }
  return null;
}
