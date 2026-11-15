// Single source of provider URLs for frontend, backend and diagnostics. Availability is checked at runtime.
export function buildEmbedServers({
  tmdbId,
  imdbId = null,
  isSeries = false,
  season = 1,
  episode = 1,
  preferredLanguage = 'latino',
}) {
  const cleanTmdb = /^\d+$/.test(String(tmdbId || '')) ? String(tmdbId) : null;
  if (!cleanTmdb) return [];
  const hasImdb = /^tt\d+$/.test(String(imdbId || ''));
  const cleanImdb = hasImdb ? String(imdbId).trim() : null;
  const dualId = cleanImdb || cleanTmdb;
  const s = Number.isInteger(Number(season)) && Number(season) >= 1 ? Number(season) : 1;
  const e = Number.isInteger(Number(episode)) && Number(episode) >= 1 ? Number(episode) : 1;
  const subLang = preferredLanguage === 'en' ? 'en' : 'es';

  // 1. VidSrcMe Ultra (5 espejos oficiales sin bloqueo de reproducción)
  const vidsrcMeRu = isSeries
    ? `https://vidsrcme.ru/embed/tv/${cleanTmdb}/${s}-${e}?ds_lang=${subLang}&autoplay=1&autonext=1`
    : `https://vidsrcme.ru/embed/movie/${cleanTmdb}?ds_lang=${subLang}&autoplay=1`;
  const vidsrcIn = isSeries
    ? `https://vidsrc.in/embed/tv/${dualId}/${s}-${e}?ds_lang=${subLang}&autoplay=1`
    : `https://vidsrc.in/embed/movie/${dualId}?ds_lang=${subLang}&autoplay=1`;
  const vidsrcNet = isSeries
    ? `https://vidsrc.net/embed/tv/${dualId}/${s}-${e}?ds_lang=${subLang}&autoplay=1`
    : `https://vidsrc.net/embed/movie/${dualId}?ds_lang=${subLang}&autoplay=1`;
  const vidsrcPm = isSeries
    ? `https://vidsrc.pm/embed/tv/${dualId}/${s}-${e}?ds_lang=${subLang}&autoplay=1`
    : `https://vidsrc.pm/embed/movie/${dualId}?ds_lang=${subLang}&autoplay=1`;
  const vidsrcXyz = isSeries
    ? `https://vidsrc.xyz/embed/tv/${dualId}/${s}-${e}?ds_lang=${subLang}&autoplay=1`
    : `https://vidsrc.xyz/embed/movie/${dualId}?ds_lang=${subLang}&autoplay=1`;

  // 2. SuperEmbed VIP Multi-Audio (Doblaje Español Latino / Castellano)
  const superDirectImdb = cleanImdb
    ? isSeries
      ? `https://multiembed.mov/directstream.php?video_id=${cleanImdb}&s=${s}&e=${e}`
      : `https://multiembed.mov/directstream.php?video_id=${cleanImdb}`
    : null;
  const superDirectTmdb = isSeries
    ? `https://multiembed.mov/directstream.php?video_id=${cleanTmdb}&tmdb=1&s=${s}&e=${e}`
    : `https://multiembed.mov/directstream.php?video_id=${cleanTmdb}&tmdb=1`;
  const superStandard = cleanImdb
    ? isSeries
      ? `https://multiembed.mov/?video_id=${cleanImdb}&s=${s}&e=${e}`
      : `https://multiembed.mov/?video_id=${cleanImdb}`
    : superDirectTmdb;

  // 3. VidSrc.cc v2 / ICU
  const vidsrcCcTmdb = isSeries
    ? `https://vidsrc.cc/v2/embed/tv/${cleanTmdb}/${s}/${e}?autoPlay=true`
    : `https://vidsrc.cc/v2/embed/movie/${cleanTmdb}?autoPlay=true`;
  const vidsrcIcu = isSeries
    ? `https://vidsrc.icu/embed/tv/${dualId}/${s}/${e}`
    : `https://vidsrc.icu/embed/movie/${dualId}`;
  const vidsrcCcImdb = isSeries
    ? `https://vidsrc.cc/v2/embed/tv/${dualId}/${s}/${e}?autoPlay=true`
    : `https://vidsrc.cc/v2/embed/movie/${dualId}?autoPlay=true`;

  // 4. Embed.su 4K / MoviesAPI Club
  const embedSu = isSeries
    ? `https://embed.su/embed/tv/${cleanTmdb}/${s}/${e}`
    : `https://embed.su/embed/movie/${cleanTmdb}`;
  const moviesApi = isSeries
    ? `https://moviesapi.club/tv/${cleanTmdb}-${s}-${e}`
    : `https://moviesapi.club/movie/${cleanTmdb}`;
  const autoEmbedV2 = isSeries
    ? `https://watch-v2.autoembed.cc/tv/${cleanTmdb}/${s}/${e}?lang=${subLang}`
    : `https://watch-v2.autoembed.cc/movie/${cleanTmdb}?lang=${subLang}`;

  // 5. VidLink 4K JWPlayer
  const vidlinkMain = isSeries
    ? `https://vidlink.pro/tv/${cleanTmdb}/${s}/${e}?primaryColor=E50914&secondaryColor=141414&iconColor=ffffff&autoplay=true&nextbutton=true`
    : `https://vidlink.pro/movie/${cleanTmdb}?primaryColor=E50914&secondaryColor=141414&iconColor=ffffff&autoplay=true`;
  const vidlinkJw = `${vidlinkMain}&player=jw`;

  // 6. Videasy / SmashyStream
  const videasy = isSeries
    ? `https://player.videasy.net/tv/${cleanTmdb}/${s}/${e}?color=E50914&nextEpisode=true&autoplayNextEpisode=true`
    : `https://player.videasy.net/movie/${cleanTmdb}?color=E50914`;
  const smashyPlayer = isSeries
    ? `https://player.smashy.stream/tv/${cleanTmdb}?s=${s}&e=${e}`
    : `https://player.smashy.stream/movie/${cleanTmdb}`;
  const smashyEmbed = isSeries
    ? `https://embed.smashystream.com/playere.php?tmdb=${cleanTmdb}&season=${s}&episode=${e}`
    : `https://embed.smashystream.com/playere.php?tmdb=${cleanTmdb}`;

  // 7. NontonGo / AutoEmbed Player
  const nontonMain = isSeries
    ? `https://www.NontonGo.win/embed/tv/${cleanTmdb}/${s}/${e}`
    : `https://www.NontonGo.win/embed/movie/${cleanTmdb}`;
  const nontonAlt = isSeries
    ? `https://www.nontongo.win/embed/tv/?id=${cleanTmdb}&s=${s}&e=${e}`
    : `https://www.nontongo.win/embed/movie/?id=${cleanTmdb}`;
  const autoPlayer = isSeries
    ? `https://player.autoembed.cc/embed/tv/${cleanTmdb}/${s}/${e}`
    : `https://player.autoembed.cc/embed/movie/${cleanTmdb}`;

  // 8. 2Embed Cloud Dual
  const twoEmbedTmdb = isSeries
    ? `https://www.2embed.cc/embedtv/${cleanTmdb}&s=${s}&e=${e}`
    : `https://www.2embed.cc/embed/${cleanTmdb}`;
  const twoEmbedImdb = cleanImdb
    ? isSeries
      ? `https://www.2embed.cc/embedtv/${cleanImdb}&s=${s}&e=${e}`
      : `https://www.2embed.cc/embed/${cleanImdb}`
    : twoEmbedTmdb;
  const twoEmbedSkin = isSeries
    ? `https://www.2embed.skin/embedtv/${dualId}&s=${s}&e=${e}`
    : `https://www.2embed.skin/embed/${dualId}`;

  return [
    {
      id: 'vidsrc',
      name: 'VidSrcMe Ultra (#1)',
      badge: '5 Espejos • Sub ES',
      url: vidsrcMeRu,
      mirrors: [
        { id: 'me-ru', name: 'VidSrcMe.ru (Principal)', url: vidsrcMeRu },
        { id: 'in', name: 'VidSrc.in (Mirror 2)', url: vidsrcIn },
        { id: 'net', name: 'VidSrc.net (Mirror 3)', url: vidsrcNet },
        { id: 'pm', name: 'VidSrc.pm (Mirror 4)', url: vidsrcPm },
        { id: 'xyz', name: 'VidSrc.xyz (Mirror 5)', url: vidsrcXyz },
      ],
    },
    {
      id: 'superembed',
      name: 'SuperEmbed VIP (#2)',
      badge: 'Doblaje LAT / ESP',
      url: superDirectImdb || superDirectTmdb,
      mirrors: [
        ...(superDirectImdb
          ? [{ id: 'direct-imdb', name: 'DirectStream VIP (IMDb)', url: superDirectImdb }]
          : []),
        { id: 'direct-tmdb', name: 'DirectStream VIP (TMDB)', url: superDirectTmdb },
        { id: 'standard', name: 'MultiEmbed Estándar', url: superStandard },
      ],
    },
    {
      id: 'vidsrccc',
      name: 'VidSrc.cc / ICU (#3)',
      badge: 'Doble Índice HD',
      url: vidsrcCcTmdb,
      mirrors: [
        { id: 'cc-tmdb', name: 'VidSrc.cc v2 (TMDB)', url: vidsrcCcTmdb },
        { id: 'icu', name: 'VidSrc.icu (Global)', url: vidsrcIcu },
        ...(cleanImdb ? [{ id: 'cc-imdb', name: 'VidSrc.cc (IMDb)', url: vidsrcCcImdb }] : []),
      ],
    },
    {
      id: 'autoembed',
      name: 'Embed.su / MoviesAPI (#4)',
      badge: '4K Catálogo Masivo',
      url: embedSu,
      mirrors: [
        { id: 'embedsu', name: 'Embed.su Cloud 4K', url: embedSu },
        { id: 'moviesapi', name: 'MoviesAPI Club (+32k)', url: moviesApi },
        { id: 'autoembed-v2', name: 'AutoEmbed Watch-V2', url: autoEmbedV2 },
      ],
    },
    {
      id: 'vidlink',
      name: 'VidLink 4K (#5)',
      badge: 'JWPlayer 4K',
      url: vidlinkMain,
      mirrors: [
        { id: 'main', name: 'VidLink 4K Principal', url: vidlinkMain },
        { id: 'jw', name: 'VidLink JWPlayer Engine', url: vidlinkJw },
      ],
    },
    {
      id: 'retro',
      name: 'Videasy & Smashy (#6)',
      badge: 'Multi-Audio & Archivo',
      url: videasy,
      mirrors: [
        { id: 'videasy', name: 'Videasy Cloud HD', url: videasy },
        { id: 'smashy-player', name: 'SmashyStream Player', url: smashyPlayer },
        { id: 'smashy-embed', name: 'Smashy Mirror 2 (PHP)', url: smashyEmbed },
      ],
    },
    {
      id: 'nontongo',
      name: 'NontonGo HD (#7)',
      badge: 'Multi-Servidor',
      url: nontonMain,
      mirrors: [
        { id: 'nontongo-main', name: 'NontonGo Principal', url: nontonMain },
        { id: 'nontongo-alt', name: 'NontonGo Mirror 2', url: nontonAlt },
        { id: 'autoembed-player', name: 'AutoEmbed Player', url: autoPlayer },
      ],
    },
    {
      id: 'twoembed',
      name: '2Embed Cloud (#8)',
      badge: 'Respaldo Internacional',
      url: twoEmbedTmdb,
      mirrors: [
        { id: 'tmdb', name: '2Embed (TMDB)', url: twoEmbedTmdb },
        { id: 'imdb', name: '2Embed (IMDb)', url: twoEmbedImdb },
        { id: 'skin', name: '2Embed.skin', url: twoEmbedSkin },
      ],
    },
  ].map(server => {
    const seen = new Set();
    return { ...server, mirrors: server.mirrors.filter(mirror => !seen.has(mirror.url) && seen.add(mirror.url)) };
  });
}

