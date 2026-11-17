import React from 'react';
import { Maximize, Minimize, Pause, Play, Volume2, VolumeX } from 'lucide-react';

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const value = Math.floor(seconds);
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const remaining = value % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
}

export default function CinemaControls({
  visible = true,
  live = false,
  playing = false,
  currentTime = 0,
  duration = 0,
  volume = 1,
  muted = false,
  fullscreen = false,
  onTogglePlay,
  onSeek,
  onToggleMute,
  onVolumeChange,
  onToggleFullscreen,
  children,
}) {
  const progress = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
  return (
    <div
      className={`absolute bottom-0 left-0 right-0 z-40 bg-gradient-to-t from-black via-black/90 to-transparent px-4 pb-4 pt-12 text-white transition-all duration-300 sm:px-8 ${visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'}`}
      onClick={(event) => event.stopPropagation()}
    >
      {live ? (
        <div className="mb-3 flex items-center gap-3">
          <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-white"><span className="h-2 w-2 animate-pulse rounded-full bg-[#E50914]" /> En vivo</span>
          <div className="h-1 flex-1 rounded-full bg-white/25"><div className="ml-auto h-1 w-8 rounded-full bg-[#E50914]" /></div>
        </div>
      ) : (
        <div className="mb-3 flex items-center gap-3">
          <span className="min-w-[42px] text-xs font-mono text-neutral-200">{formatTime(currentTime)}</span>
          <input
            type="range"
            aria-label="Posición del video"
            min="0"
            max={duration || 0}
            step="0.1"
            value={Math.min(currentTime, duration || 0)}
            disabled={!duration}
            onChange={(event) => onSeek?.(Number(event.target.value))}
            className="player-progress w-full cursor-pointer disabled:opacity-40"
            style={{ background: `linear-gradient(to right, #E50914 ${progress}%, #666 ${progress}%)` }}
          />
          <span className="min-w-[42px] text-right text-xs font-mono text-neutral-300">{formatTime(duration)}</span>
        </div>
      )}
      <div className="flex items-center gap-3">
        <button type="button" onClick={onTogglePlay} aria-label={playing ? 'Pausar' : 'Reproducir'} className="rounded-full p-1.5 text-white hover:text-[#E50914]">
          {playing ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
        </button>
        <button type="button" onClick={onToggleMute} aria-label={muted ? 'Activar sonido' : 'Silenciar'} className="text-neutral-200 hover:text-white">
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
        <input type="range" aria-label="Volumen" min="0" max="1" step="0.05" value={muted ? 0 : volume} onChange={(event) => onVolumeChange?.(Number(event.target.value))} className="hidden h-1 w-20 cursor-pointer accent-[#E50914] sm:block" />
        <div className="flex-1" />
        {children}
        <button type="button" onClick={onToggleFullscreen} aria-label={fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'} className="rounded-full p-1.5 text-neutral-200 hover:text-white">
          {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
        </button>
      </div>
    </div>
  );
}
