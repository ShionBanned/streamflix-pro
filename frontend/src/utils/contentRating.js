const COUNTRY_PRIORITY = ['CO', 'MX', 'US', 'ES'];

const RATING_MAP = {
  AA: '7+',
  A: '7+',
  G: '7+',
  'TV-Y': '7+',
  'TV-Y7': '7+',
  'TV-G': '7+',
  T: '7+',
  APTA: '7+',
  ATP: '7+',
  TP: '7+',
  U: '7+',
  '0': '7+',
  '6': '7+',
  '7': '7+',
  PG: '10+',
  'TV-PG': '10+',
  '9': '10+',
  '10': '10+',
  B: '12+',
  '12': '12+',
  'PG-13': '13+',
  '13': '13+',
  'TV-14': '14+',
  '14': '14+',
  B15: '15+',
  'B-15': '15+',
  '15': '15+',
  R: '16+',
  M: '16+',
  '16': '16+',
  C: '18+',
  D: '18+',
  'NC-17': '18+',
  'TV-MA': '18+',
  '18': '18+',
  X: '18+',
};

function displayRating(value) {
  const rating = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!rating || rating.length > 12 || !/^[A-Z0-9+-]+$/.test(rating)) return null;
  if (RATING_MAP[rating]) return RATING_MAP[rating];
  const numeric = /^(\d{1,2})\+?$/.exec(rating);
  if (numeric) {
    const n = Number(numeric[1]);
    return n <= 7 ? '7+' : `${n}+`;
  }
  return null;
}

export function getContentRating(details, mediaType) {
  const results = mediaType === 'tv' ? details?.content_ratings?.results : details?.release_dates?.results;
  if (!Array.isArray(results)) return null;
  for (const country of COUNTRY_PRIORITY) {
    const entry = results.find((item) => item.iso_3166_1 === country);
    if (!entry) continue;
    const values = mediaType === 'tv' ? [entry?.rating] : (entry?.release_dates || []).map((release) => release.certification);
    for (const value of values) {
      const label = displayRating(value);
      if (label) return label;
    }
  }
  for (const entry of results) {
    const values = mediaType === 'tv' ? [entry?.rating] : (entry?.release_dates || []).map((release) => release.certification);
    for (const value of values) {
      const label = displayRating(value);
      if (label) return label;
    }
  }
  return null;
}
