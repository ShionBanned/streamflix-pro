import { useCallback, useEffect } from 'react';

export function formatPlayerTime(seconds) {
  if (!Number.isFinite(Number(seconds)) || Number(seconds) <= 0) return '00:00';
  const value = Math.floor(Number(seconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const remaining = value % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
}

export default function usePlayerControls({
  videoRef, audioCtxRef, ensureWebAudioChain, triggerHudVisibility,
  setIsPlaying, setCurrentTime, setVolume, setIsMuted, setIsFullscreen,
  setTranscodeStart, trackedTimeRef, forceTranscode, duration, volume,
  isMuted, activeServer, activeDrawer, setActiveDrawer, handleSafeClose,
}) {
  const toggleFullscreen = useCallback(() => {
    const element = document.getElementById('smart-player-container');
    if (!element) return;
    if (!document.fullscreenElement) {
      element.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, [setIsFullscreen]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume().catch(() => {});
    ensureWebAudioChain();
    triggerHudVisibility();
    if (video.paused) {
      video.play().catch(() => {});
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, [videoRef, audioCtxRef, ensureWebAudioChain, triggerHudVisibility, setIsPlaying]);

  const seekTo = useCallback((next) => {
    if (!videoRef.current || !Number.isFinite(next)) return;
    const target = Math.max(0, next);
    if (forceTranscode) setTranscodeStart(target);
    else videoRef.current.currentTime = target;
    setCurrentTime(target);
    trackedTimeRef.current = Math.floor(target);
  }, [videoRef, forceTranscode, setTranscodeStart, setCurrentTime, trackedTimeRef]);

  const handleSeek = useCallback((event) => seekTo(Number(event.target.value)), [seekTo]);

  const handleVolumeChange = useCallback((event) => {
    const next = Math.max(0, Math.min(1, Number(event.target.value)));
    if (!Number.isFinite(next)) return;
    setVolume(next);
    if (videoRef.current) {
      videoRef.current.volume = next;
      videoRef.current.muted = next === 0;
      setIsMuted(next === 0);
    }
  }, [videoRef, setVolume, setIsMuted]);

  const toggleMute = useCallback(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    if (isMuted) videoRef.current.volume = volume || 0.5;
    setIsMuted(!isMuted);
  }, [videoRef, isMuted, volume, setIsMuted]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (activeDrawer) setActiveDrawer(null);
        else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
        else handleSafeClose();
        return;
      }
      if (activeServer !== 'p2p' || !videoRef.current ||
          ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(event.target?.tagName)) return;
      const key = event.key.toLowerCase();
      if (key === ' ' || key === 'k') { event.preventDefault(); togglePlay(); }
      else if (key === 'arrowright') { event.preventDefault(); seekTo(Math.min(duration || 0, trackedTimeRef.current + 10)); }
      else if (key === 'arrowleft') { event.preventDefault(); seekTo(Math.max(0, trackedTimeRef.current - 10)); }
      else if (key === 'f') { event.preventDefault(); toggleFullscreen(); }
      else if (key === 'm') { event.preventDefault(); toggleMute(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeDrawer, activeServer, duration, handleSafeClose, seekTo, setActiveDrawer,
      toggleFullscreen, toggleMute, togglePlay, trackedTimeRef, videoRef]);

  return { toggleFullscreen, togglePlay, handleSeek, handleVolumeChange, toggleMute };
}
