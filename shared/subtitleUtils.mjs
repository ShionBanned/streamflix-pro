export function toWebVtt(input) {
  const text = String(input).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (/^WEBVTT(?:[ \t\n]|$)/.test(text)) return `${text}\n`;
  const cues = text.split(/\n[ \t]*\n/).map(block => {
    const lines = block.split('\n'); if (/^\d+$/.test(lines[0]?.trim())) lines.shift();
    const time = /^(\d{1,3}:\d{2}:\d{2})[,.](\d{3})\s+-->\s+(\d{1,3}:\d{2}:\d{2})[,.](\d{3})\s*$/.exec(lines.shift()?.trim() || '');
    if (!time || !lines.length) return '';
    const content = lines.join('\n').replace(/<[^>]*>/g, tag => /^<\/?(?:b|i|u)>$/i.test(tag) ? tag : '');
    return `${time[1].padStart(8, '0')}.${time[2]} --> ${time[3].padStart(8, '0')}.${time[4]}\n${content}`;
  }).filter(Boolean);
  if (!cues.length) throw new Error('El archivo no contiene subtítulos SRT o VTT válidos.');
  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}
