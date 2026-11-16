const THEMES = [
  (channel) => /kids|animation|anime|cartoon|infantil|dibujos/i.test(`${channel.rawCategory} ${channel.category} ${channel.name}`),
  (channel) => /movies|films|cinema|cine|pel[ií]culas|series/i.test(`${channel.rawCategory} ${channel.category} ${channel.name}`),
  (channel) => channel.country === 'co',
  (channel) => /news|noticias|informativos/i.test(`${channel.rawCategory} ${channel.category}`),
  (channel) => /music|música|entretenimiento|documental/i.test(`${channel.rawCategory} ${channel.category}`),
];

function stableScore(channel, seed) {
  const value = `${seed}:${channel.id || channel.url}`;
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export function getCuratedChannelMix(channels, seed, limit = 28) {
  const available = channels.filter((channel) => channel?.url && !channel.isHevcHint && !channel.isGeoBlocked);
  const groups = THEMES.map((matches) => available.filter(matches).sort((a, b) => stableScore(a, seed) - stableScore(b, seed)));
  const selected = []; const seen = new Set();
  let index = 0;
  while (selected.length < limit && groups.some((group) => index < group.length)) {
    for (const group of groups) {
      const channel = group[index];
      if (channel && !seen.has(channel.url)) { selected.push(channel); seen.add(channel.url); }
      if (selected.length >= limit) break;
    }
    index += 1;
  }
  return selected;
}
