import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import CinemaControls from './CinemaControls.jsx';
import PlaybackFeedback from './PlaybackFeedback.jsx';
import usePlaybackShortcuts from '../hooks/usePlaybackShortcuts.js';

export default function OfflinePlayer({ item, onClose }) {
  const frameRef = useRef(null);
  const videoRef = useRef(null);
  const hudTimerRef = useRef(null);
  const [showHud, setShowHud] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const revealHud = () => {
    setShowHud(true);
    clearTimeout(hudTimerRef.current);
    hudTimerRef.current = setTimeout(() => setShowHud(false), 3500);
  };
  const close = () => {
    if (document.fullscreenElement === frameRef.current) document.exitFullscreen?.();
    onClose();
  };

  useEffect(() => {
    hudTimerRef.current = setTimeout(() => setShowHud(false), 3500);
    const onFullscreen = () => setFullscreen(document.fullscreenElement === frameRef.current);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      clearTimeout(hudTimerRef.current);
      document.removeEventListener('fullscreenchange', onFullscreen);
    };
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };
  const toggleFullscreen = () => {
    if (document.fullscreenElement === frameRef.current) document.exitFullscreen?.();
    else frameRef.current?.requestFullscreen?.();
  };
  const seekTo = value => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
    video.currentTime = Math.max(0, Math.min(video.duration, value));
    setTime(video.currentTime);
  };
  const changeVolume = value => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = value;
    video.muted = value === 0;
  };
  const toggleMute = () => {
    const video = videoRef.current;
    if (video) video.muted = !video.muted;
  };
  const shortcutFeedback = usePlaybackShortcuts({
    getState: () => ({
      paused: videoRef.current?.paused,
      currentTime: videoRef.current?.currentTime,
      duration: videoRef.current?.duration,
      volume: videoRef.current?.volume,
      muted: videoRef.current?.muted,
    }),
    onPlayPause: togglePlay,
    onSeek: seekTo,
    onVolume: changeVolume,
    onMute: toggleMute,
    onFullscreen: toggleFullscreen,
    onEscape: () => {
      if (document.fullscreenElement === frameRef.current) document.exitFullscreen?.();
      else close();
    },
    onActivity: revealHud,
  });

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 font-netflix" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <div ref={frameRef} role="dialog" aria-modal="true" aria-label={`Reproduciendo ${item.title}`} onMouseMove={revealHud} onTouchStart={revealHud} className="relative mx-auto h-full w-full max-w-[1920px] bg-black">
        <PlaybackFeedback feedback={shortcutFeedback} />
        <video
          ref={videoRef}
          src={`/api/downloads/${item.id}/stream`}
          className="h-full w-full cursor-pointer object-contain"
          autoPlay
          playsInline
          preload="metadata"
          onClick={togglePlay}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={event => setTime(event.currentTarget.currentTime)}
          onLoadedMetadata={event => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
          onDurationChange={event => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
          onVolumeChange={event => { setVolume(event.currentTarget.volume); setMuted(event.currentTarget.muted); }}
        />
        <div className={`absolute left-0 right-0 top-0 z-40 bg-gradient-to-b from-black/90 to-transparent px-4 py-5 transition-opacity sm:px-8 ${showHud ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
          <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/15 bg-black/65 py-1 pl-1 pr-4 text-white backdrop-blur-xl">
            <button type="button" onClick={close} aria-label="Volver a descargas" className="rounded-full bg-white/10 p-2 hover:bg-[#E50914]"><ArrowLeft size={17} /></button>
            <span className="truncate text-sm font-bold">{item.title}</span>
          </div>
        </div>
        <CinemaControls
          visible={showHud}
          playing={playing}
          currentTime={time}
          duration={duration}
          volume={volume}
          muted={muted}
          fullscreen={fullscreen}
          onTogglePlay={togglePlay}
          onSeek={seekTo}
          onToggleMute={toggleMute}
          onVolumeChange={changeVolume}
          onToggleFullscreen={toggleFullscreen}
        />
      </div>
    </div>
  );
}
