export function toWebVtt(input) {
  const text = String(input).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (/^WEBVTT(?:[ \t\n]|$)/.test(text)) return `${text}\n`;
  const cues = text.split(/\n[ \t]*\n/).map(block => {
    const lines = block.split('\n'); if (/^\d+$/.test(lines[0]?.trim())) lines.shift();
    const time = /^(\d{1,3}:\d{2}:\d{2})[,.](\d{3})\s+-->\s+(\d{1,3}:\d{2}:\d{2})[,.](\d{3})(?:[ \t]+.*)?$/.exec(lines.shift()?.trim() || '');
    if (!time || !lines.length) return '';
    const content = lines.join('\n').replace(/<[^>]*>/g, tag => /^<\/?(?:b|i|u)>$/i.test(tag) ? tag : '');
    return `${time[1].padStart(8, '0')}.${time[2]} --> ${time[3].padStart(8, '0')}.${time[4]}\n${content}`;
  }).filter(Boolean);
  if (!cues.length) throw new Error('El archivo no contiene subtítulos SRT o VTT válidos.');
  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}

function parseTimestamp(raw) {
  const match = /^(?:(\d{1,3}):)?(\d{2}):(\d{2})[.,](\d{3})$/.exec(String(raw || '').trim());
  if (!match) return null;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const millis = Number(match[4]);
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

export function parseWebVttCues(vttInput) {
  const text = String(vttInput || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (!text) return [];
  const blocks = text.split(/\n[ \t]*\n/);
  const cues = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const first = lines[0]?.trim() || '';
    if (!first || /^(?:WEBVTT|NOTE|STYLE|REGION)(?:[ \t]|$)/.test(first)) continue;
    let timeLine = first;
    if (!timeLine.includes('-->')) {
      lines.shift();
      timeLine = lines[0]?.trim() || '';
    }
    const match = /^((?:\d{1,3}:)?\d{2}:\d{2}[.,]\d{3})\s+-->\s+((?:\d{1,3}:)?\d{2}:\d{2}[.,]\d{3})(?:[ \t]+.*)?$/.exec(timeLine);
    if (!match) continue;
    lines.shift();
    const start = parseTimestamp(match[1]);
    const end = parseTimestamp(match[2]);
    if (start === null || end === null || end <= start) continue;
    const rawContent = lines.join('\n').trim();
    if (!rawContent) continue;
    const cleaned = rawContent
      .replace(/<[^>]*>/g, tag => (/^<\/?(?:b|i|u)>$/i.test(tag) ? tag.toLowerCase() : ''))
      .replace(/\{\\[^}]*\}/g, '')
      .trim();
    if (cleaned) cues.push({ start, end, text: cleaned });
  }
  cues.sort((a, b) => a.start - b.start || a.end - b.end);
  return cues;
}

export function getActiveCues(cues, mediaTime, offset = 0, rate = 1) {
  if (!Array.isArray(cues) || !cues.length || !Number.isFinite(mediaTime)) return [];
  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
  const safeOffset = Number.isFinite(offset) ? offset : 0;
  const active = [];
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    const start = cue.start * safeRate + safeOffset;
    if (start > mediaTime) break;
    const end = cue.end * safeRate + safeOffset;
    if (end >= mediaTime) active.push(cue);
  }
  return active;
}
