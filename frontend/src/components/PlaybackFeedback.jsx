import React from 'react';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';

export default function PlaybackFeedback({ feedback }) {
  if (!feedback || !['play', 'pause', 'seek'].includes(feedback.kind)) return null;
  const isSeek = feedback.kind === 'seek';
  const isBackward = feedback.label.startsWith('-') || feedback.label === 'Inicio' || feedback.label === '0%';
  const Icon = feedback.kind === 'play' ? Play
    : feedback.kind === 'pause' ? Pause
    : isBackward ? SkipBack : SkipForward;

  return (
    <div className="pointer-events-none absolute inset-0 z-[45]" aria-live="polite">
      <div className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 ${isSeek ? isBackward ? 'left-[30%]' : 'left-[70%]' : 'left-1/2'}`}>
        <div key={feedback.id} className="playback-shortcut-feedback flex flex-col items-center gap-1 text-white drop-shadow-lg">
          <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-black/35 backdrop-blur-sm">
            <Icon className="h-8 w-8 fill-white/20" />
          </span>
          {isSeek && <span className="text-xs font-semibold tracking-wide">{feedback.label}</span>}
          {!isSeek && <span className="sr-only">{feedback.label}</span>}
        </div>
      </div>
    </div>
  );
}
