import React, { useEffect, useState } from 'react';
import { getActiveCues } from '../../../shared/subtitleUtils.mjs';

const SIZE_STYLES = {
  normal: 'clamp(1.15rem, 2.2vw, 2.1rem)',
  large: 'clamp(1.45rem, 2.95vw, 2.85rem)',
  xlarge: 'clamp(1.75rem, 3.6vw, 3.4rem)',
};

const BOTTOM_POSITIONS = {
  low: { hidden: '6%', hud: '14.5%' },
  raised: { hidden: '10.5%', hud: '17.5%' },
  high: { hidden: '15%', hud: '21%' },
};

const NETFLIX_FONT_STACK =
  "'Netflix Sans', 'DM Sans', 'Inter', 'Helvetica Neue', Arial, sans-serif";

const NETFLIX_TEXT_SHADOW =
  '0 2px 6px rgba(0, 0, 0, 0.96), 0 0 14px rgba(0, 0, 0, 0.85), 1.5px 1.5px 0 rgba(0, 0, 0, 0.92), -1.5px -1.5px 0 rgba(0, 0, 0, 0.92), 1.5px -1.5px 0 rgba(0, 0, 0, 0.92), -1.5px 1.5px 0 rgba(0, 0, 0, 0.92)';

function renderFormattedLine(line, lineIndex) {
  const tokens = [];
  const regex = /(<\/?(?:i|b|u)>)/gi;
  let lastIndex = 0;
  let match;
  let italic = false;
  let bold = false;
  let underline = false;
  let key = 0;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      const chunk = line.slice(lastIndex, match.index);
      tokens.push(
        <span
          key={`${lineIndex}-${key++}`}
          style={{
            fontStyle: italic ? 'italic' : 'normal',
            fontWeight: bold ? 700 : undefined,
            textDecoration: underline ? 'underline' : undefined,
          }}
        >
          {chunk}
        </span>
      );
    }
    const tag = match[1].toLowerCase();
    if (tag === '<i>') italic = true;
    else if (tag === '</i>') italic = false;
    else if (tag === '<b>') bold = true;
    else if (tag === '</b>') bold = false;
    else if (tag === '<u>') underline = true;
    else if (tag === '</u>') underline = false;
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < line.length) {
    tokens.push(
      <span
        key={`${lineIndex}-${key}`}
        style={{
          fontStyle: italic ? 'italic' : 'normal',
          fontWeight: bold ? 700 : undefined,
          textDecoration: underline ? 'underline' : undefined,
        }}
      >
        {line.slice(lastIndex)}
      </span>
    );
  }

  return tokens.length ? tokens : line;
}

export default function SubtitleOverlay({
  videoRef,
  videoKey = '',
  cues = [],
  offset = 0,
  rate = 1,
  transcodeOffset = 0,
  hudVisible = false,
  size = 'large',
  position = 'raised',
  backdrop = false,
}) {
  const [activeCues, setActiveCues] = useState([]);

  useEffect(() => {
    const video = videoRef?.current;
    if (!video || !cues.length) {
      setActiveCues([]);
      return;
    }

    let rafId = null;
    let lastKey = '';

    const update = () => {
      const mediaTime = (video.currentTime || 0) + (transcodeOffset || 0);
      const next = getActiveCues(cues, mediaTime, offset, rate);
      const key = next.map((c) => `${c.start}:${c.end}:${c.text}`).join('|');
      if (key !== lastKey) {
        lastKey = key;
        setActiveCues(next);
      }
    };

    const tick = () => {
      update();
      if (!video.paused && !video.ended) {
        rafId = requestAnimationFrame(tick);
      } else {
        rafId = null;
      }
    };

    const startLoop = () => {
      if (rafId === null) rafId = requestAnimationFrame(tick);
    };

    const stopLoop = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      update();
    };

    update();
    if (!video.paused && !video.ended) startLoop();

    video.addEventListener('play', startLoop);
    video.addEventListener('playing', startLoop);
    video.addEventListener('pause', stopLoop);
    video.addEventListener('ended', stopLoop);
    video.addEventListener('seeked', update);
    video.addEventListener('timeupdate', update);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      video.removeEventListener('play', startLoop);
      video.removeEventListener('playing', startLoop);
      video.removeEventListener('pause', stopLoop);
      video.removeEventListener('ended', stopLoop);
      video.removeEventListener('seeked', update);
      video.removeEventListener('timeupdate', update);
    };
  }, [videoRef, videoKey, cues, offset, rate, transcodeOffset]);

  if (!activeCues.length) return null;

  const pos = BOTTOM_POSITIONS[position] || BOTTOM_POSITIONS.raised;
  const bottom = hudVisible ? pos.hud : pos.hidden;
  const fontSize = SIZE_STYLES[size] || SIZE_STYLES.large;

  return (
    <div
      aria-live="off"
      className="pointer-events-none absolute left-0 right-0 z-20 flex flex-col items-center justify-end px-4 sm:px-10 transition-[bottom] duration-300 ease-out select-none"
      style={{ bottom }}
    >
      <div className="max-w-[82%] sm:max-w-[74%] flex flex-col items-center gap-1.5 text-center">
        {activeCues.map((cue, idx) => (
          <div
            key={`${cue.start}-${idx}`}
            className={
              backdrop
                ? 'px-3.5 py-1 rounded-md bg-black/65 backdrop-blur-[2px]'
                : ''
            }
            style={{
              fontFamily: NETFLIX_FONT_STACK,
              fontSize,
              fontWeight: 500,
              lineHeight: 1.28,
              letterSpacing: '0.01em',
              color: '#FFFFFF',
              textShadow: NETFLIX_TEXT_SHADOW,
              WebkitFontSmoothing: 'antialiased',
            }}
          >
            {cue.text.split('\n').map((line, lIdx) => (
              <div key={lIdx}>{renderFormattedLine(line, lIdx)}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
