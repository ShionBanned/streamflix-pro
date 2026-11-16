const COUNTRY_PRIORITY = ['CO', 'MX', 'US', 'ES'];

function displayRating(value) {
  const rating = String(value || '').trim().toUpperCase();
  if (!rating || rating.length > 12 || !/^[A-Z0-9+ -]+$/.test(rating)) return null;
  return /^\d{1,2}$/.test(rating) ? `${rating}+` : rating;
}

export function getContentRating(details, mediaType) {
  const results = mediaType === 'tv' ? details?.content_ratings?.results : details?.release_dates?.results;
  if (!Array.isArray(results)) return null;
  for (const country of COUNTRY_PRIORITY) {
    const entry = results.find((item) => item.iso_3166_1 === country);
    const values = mediaType === 'tv' ? [entry?.rating] : (entry?.release_dates || []).map((release) => release.certification);
    for (const value of values) {
      const label = displayRating(value);
      if (label) return label;
    }
  }
  return null;
}
