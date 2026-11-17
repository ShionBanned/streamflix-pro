import { useEffect, useRef, useState } from 'react';

const isEditing = (target) => Boolean(target?.closest?.('input, textarea, select, button, a, [contenteditable="true"], [role="textbox"]'));

export default function usePlaybackShortcuts(options) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const feedbackTimerRef = useRef(null);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    const announce = (kind, label) => {
      clearTimeout(feedbackTimerRef.current);
      setFeedback({ kind, label, id: Date.now() });
      feedbackTimerRef.current = setTimeout(() => setFeedback(null), 850);
    };

    const onKeyDown = (event) => {
      const {
        enabled = true, blocked = false, isActive, getState, onPlayPause, onSeek,
        onVolume, onMute, onFullscreen, onEscape, onActivity,
      } = optionsRef.current;

      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'Escape' && onEscape) {
        event.preventDefault();
        onEscape();
        return;
      }
      if (!enabled || blocked || (isActive && !isActive()) || isEditing(event.target)) return;

      const key = event.key.toLowerCase();
      const state = getState?.() || {};
      const duration = Number(state.duration);
      const currentTime = Number(state.currentTime);
      const volume = Number(state.volume);
      const canSeek = Boolean(onSeek && Number.isFinite(duration) && duration > 0 && Number.isFinite(currentTime));

      const seekBy = (delta) => {
        if (!canSeek) return false;
        onSeek(Math.max(0, Math.min(duration, currentTime + delta)));
        announce('seek', delta > 0 ? `+${delta} s` : `${delta} s`);
        return true;
      };

      let handled = false;
      if ((key === ' ' || key === 'k') && onPlayPause && !event.repeat) {
        onPlayPause();
        announce(state.paused ? 'play' : 'pause', state.paused ? 'Reproduciendo' : 'Pausa');
        handled = true;
      } else if (key === 'arrowright') handled = seekBy(5);
      else if (key === 'arrowleft') handled = seekBy(-5);
      else if (key === 'l') handled = seekBy(10);
      else if (key === 'j') handled = seekBy(-10);
      else if (key === 'home' && canSeek) {
        onSeek(0); announce('seek', 'Inicio'); handled = true;
      } else if (key === 'end' && canSeek) {
        onSeek(duration); announce('seek', 'Final'); handled = true;
      } else if (/^[0-9]$/.test(key) && canSeek) {
        const percent = Number(key) * 10;
        onSeek(duration * percent / 100);
        announce('seek', `${percent}%`);
        handled = true;
      } else if ((key === 'arrowup' || key === 'arrowdown') && onVolume && Number.isFinite(volume)) {
        const next = Math.max(0, Math.min(1, Math.round((volume + (key === 'arrowup' ? 0.05 : -0.05)) * 100) / 100));
        onVolume(next);
        announce('volume', `Volumen ${Math.round(next * 100)}%`);
        handled = true;
      } else if (key === 'm' && onMute && !event.repeat) {
        onMute(); announce('volume', state.muted ? 'Sonido activado' : 'Silenciado'); handled = true;
      } else if (key === 'f' && onFullscreen && !event.repeat) {
        onFullscreen(); announce('fullscreen', document.fullscreenElement ? 'Salir de pantalla completa' : 'Pantalla completa'); handled = true;
      }

      if (handled) {
        event.preventDefault();
        onActivity?.();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  return feedback;
}
