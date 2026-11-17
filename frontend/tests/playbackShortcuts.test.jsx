import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, renderHook } from '@testing-library/react';
import usePlaybackShortcuts from '../src/hooks/usePlaybackShortcuts.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('playback shortcuts', () => {
  it('uses consistent seek, volume and playback keys', () => {
    const onSeek = vi.fn();
    const onVolume = vi.fn();
    const onPlayPause = vi.fn();
    const onMute = vi.fn();
    const onFullscreen = vi.fn();
    renderHook(() => usePlaybackShortcuts({
      getState: () => ({ paused: false, currentTime: 30, duration: 100, volume: 0.5, muted: false }),
      onSeek, onVolume, onPlayPause, onMute, onFullscreen,
    }));

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.keyDown(window, { key: 'l' });
    fireEvent.keyDown(window, { key: 'j' });
    fireEvent.keyDown(window, { key: '7' });
    fireEvent.keyDown(window, { key: 'Home' });
    fireEvent.keyDown(window, { key: 'End' });
    expect(onSeek.mock.calls.map(([value]) => value)).toEqual([35, 25, 40, 20, 70, 0, 100]);

    fireEvent.keyDown(window, { key: 'ArrowUp' });
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(onVolume.mock.calls.map(([value]) => value)).toEqual([0.55, 0.45]);
    fireEvent.keyDown(window, { key: ' ' });
    fireEvent.keyDown(window, { key: 'k' });
    fireEvent.keyDown(window, { key: 'm' });
    fireEvent.keyDown(window, { key: 'f' });
    expect(onPlayPause).toHaveBeenCalledTimes(2);
    expect(onMute).toHaveBeenCalledTimes(1);
    expect(onFullscreen).toHaveBeenCalledTimes(1);
  });

  it('leaves editable controls alone and lets Escape handle an open panel', () => {
    const onPlayPause = vi.fn();
    const onSeek = vi.fn();
    const onEscape = vi.fn();
    const { rerender } = renderHook(({ blocked }) => usePlaybackShortcuts({
      blocked,
      getState: () => ({ currentTime: 30, duration: 100 }),
      onPlayPause, onSeek, onEscape,
    }), { initialProps: { blocked: false } });
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: ' ' });
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    expect(onPlayPause).not.toHaveBeenCalled();
    expect(onSeek).not.toHaveBeenCalled();

    rerender({ blocked: true });
    fireEvent.keyDown(window, { key: ' ' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onPlayPause).not.toHaveBeenCalled();
    expect(onSeek).not.toHaveBeenCalled();
    expect(onEscape).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledTimes(2);
    input.remove();
  });
});
