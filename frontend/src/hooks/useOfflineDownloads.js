import { useState } from 'react';
import api from '../services/api.js';

export default function useOfflineDownloads({ item, details, mediaType, isTv, selectedSeason, episodes, preferredLanguage }) {
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloadSources, setDownloadSources] = useState([]);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [seasonBatchBusy, setSeasonBatchBusy] = useState(false);
  const [seasonBatchProgress, setSeasonBatchProgress] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [downloadSuccess, setDownloadSuccess] = useState('');
  const [downloadIndex, setDownloadIndex] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState('');
  const [downloadQuality, setDownloadQuality] = useState('compact');
  const [downloadEpisode, setDownloadEpisode] = useState(1);
  const title = details?.title || details?.name || item?.title || item?.name || 'Sin título';

  const loadDownloadSources = async (episode = downloadEpisode) => {
    setDownloadLoading(true);
    setDownloadError('');
    setDownloadSources([]);
    setDownloadIndex(0);
    try {
      const data = await api.resolveSource({
        tmdbId: item.id,
        imdbId: details?.imdb_id || item.imdb_id,
        type: mediaType,
        season: isTv ? selectedSeason : undefined,
        episode: isTv ? episode : undefined,
        preferredLanguage,
      });
      const found = (data.streams || []).filter(
        (stream) =>
          stream.infoHash ||
          (stream.url && /^https:\/\//i.test(stream.url) && /\.(mp4|webm|m3u8)(?:[?#]|$)/i.test(stream.url))
      );
      setDownloadSources(found.slice(0, 40));
      if (!found.length) {
        setDownloadError(
          'No hay una fuente descargable para este título. Puedes usar un enlace MP4, WebM o HLS VOD disponible para ti.'
        );
      }
    } catch (error) {
      setDownloadError(error.response?.data?.error || 'No se pudieron consultar las fuentes.');
    } finally {
      setDownloadLoading(false);
    }
  };

  const openEpisodeDownloadModal = (epNumber, qualityDefault = isTv ? 'marathon' : 'compact') => {
    setDownloadOpen(true);
    setDownloadEpisode(epNumber);
    setDownloadQuality(qualityDefault);
    setDownloadSuccess('');
    setDownloadUrl('');
    setSeasonBatchProgress('');
    void loadDownloadSources(epNumber);
  };

  const startOfflineDownload = async () => {
    setDownloadBusy(true);
    setDownloadError('');
    setDownloadSuccess('');
    const chosen = downloadUrl.trim() ? { url: downloadUrl.trim() } : downloadSources[downloadIndex];
    try {
      if (!chosen) throw new Error('Selecciona una fuente o pega un enlace directo.');
      const source = chosen.infoHash
        ? {
            infoHash: chosen.infoHash,
            fileIdx: chosen.fileIdx,
            season: isTv ? selectedSeason : undefined,
            episode: isTv ? downloadEpisode : undefined,
          }
        : { url: chosen.url };
      await api.startDownload(
        source,
        isTv ? `${title} · T${selectedSeason}:E${downloadEpisode}` : title,
        downloadQuality,
        preferredLanguage,
        true
      );
      setDownloadSuccess('Descarga iniciada con Fórmula Netflix. Puedes seguirla en la sección Offline.');
    } catch (error) {
      setDownloadError(error.response?.data?.error || error.message || 'No se pudo iniciar la descarga.');
    } finally {
      setDownloadBusy(false);
    }
  };

  /**
   * Resuelve y encola todos los episodios disponibles de la temporada actual en modo "Temporada Completa"
   */
  const startFullSeasonDownload = async () => {
    if (!isTv || !episodes.length) return;
    setSeasonBatchBusy(true);
    setDownloadError('');
    setDownloadSuccess('');
    setSeasonBatchProgress('Buscando semillas óptimas por episodio…');
    try {
      const targetEpisodes = episodes.slice(0, 24);
      const batchItems = [];
      const chosenCurrent = downloadSources[downloadIndex];

      for (let i = 0; i < targetEpisodes.length; i++) {
        const ep = targetEpisodes[i];
        const epNum = ep.episode_number || i + 1;
        setSeasonBatchProgress(`Preparando episodio ${epNum} de ${targetEpisodes.length}…`);

        let stream = null;
        if (epNum === downloadEpisode && chosenCurrent) {
          stream = chosenCurrent;
        } else {
          try {
            const resolved = await api.resolveSource({
              tmdbId: item.id,
              imdbId: details?.imdb_id || item.imdb_id,
              type: 'tv',
              season: selectedSeason,
              episode: epNum,
              preferredLanguage,
            });
            const candidates = (resolved?.streams || []).filter(
              (s) =>
                s.infoHash ||
                (s.url && /^https:\/\//i.test(s.url) && /\.(mp4|webm|m3u8)(?:[?#]|$)/i.test(s.url))
            );
            // Priorizar 720p o el primer stream saludable para que la descarga de temporada sea rapidísima
            stream =
              candidates.find((s) => /720p/i.test(s.resolution || s.title || '')) || candidates[0] || null;
          } catch {
            stream = null;
          }
        }

        if (stream) {
          batchItems.push({
            ...(stream.infoHash
              ? {
                  infoHash: stream.infoHash,
                  fileIdx: stream.fileIdx,
                  season: selectedSeason,
                  episode: epNum,
                }
              : { url: stream.url }),
            title: `${title} · T${selectedSeason}:E${epNum}${ep.name ? ` — ${ep.name}` : ''}`,
            quality: downloadQuality === 'original' ? 'marathon' : downloadQuality,
            preferredLanguage,
          });
        }
      }

      if (!batchItems.length) {
        throw new Error('No se encontraron fuentes P2P/directas para los episodios de esta temporada.');
      }

      const res = await api.startBatchDownloads(
        batchItems,
        downloadQuality === 'original' ? 'marathon' : downloadQuality,
        preferredLanguage
      );
      setSeasonBatchProgress('');
      setDownloadSuccess(
        res.fallbackUsed
          ? `Descargando los primeros ${res.totalQueued} episodios de la Temporada ${selectedSeason} (reinicia start.bat para activar la cola de 24 episodios).`
          : `Temporada ${selectedSeason} en cola (${res.totalQueued || batchItems.length} episodios) con compresión Per-Title.`
      );
    } catch (error) {
      setSeasonBatchProgress('');
      setDownloadError(
        error.response?.data?.error || error.message || 'No se pudo encolar la temporada completa.'
      );
    } finally {
      setSeasonBatchBusy(false);
    }
  };

  const sourceSelectOptions = !downloadSources.length
    ? [{ id: 0, value: 0, label: downloadLoading ? 'Buscando fuentes óptimas…' : 'Sin fuentes automáticas', icon: '🔍' }]
    : downloadSources.map((stream, index) => ({
      id: index,
      value: index,
      label: `${stream.source || 'Fuente'} · ${stream.resolution || 'HD'} · ${
        stream.language || 'Idioma sin confirmar'
      }${stream.size ? ` · ${stream.size}` : ''}`,
      icon: stream.infoHash ? '⚡' : '☁️',
      badge: stream.seeders ? `${stream.seeders} peers` : undefined,
    }));

  return { downloadOpen, setDownloadOpen, downloadSources, downloadLoading, downloadBusy, seasonBatchBusy, seasonBatchProgress, downloadError, downloadSuccess, downloadIndex, setDownloadIndex, downloadUrl, setDownloadUrl, downloadQuality, setDownloadQuality, downloadEpisode, setDownloadEpisode, loadDownloadSources, openEpisodeDownloadModal, startOfflineDownload, startFullSeasonDownload, sourceSelectOptions };
}
