import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import CustomSelect from '../src/components/CustomSelect.jsx';
import useUserMedia from '../src/hooks/useUserMedia.js';
import useOfflineDownloads from '../src/hooks/useOfflineDownloads.js';
import { formatPlayerTime } from '../src/hooks/usePlayerControls.js';
import api from '../src/services/api.js';

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('CustomSelect', () => {
  const options = [
    { value: 'latino', label: 'Español latino' },
    { value: 'vose', label: 'VOSE' },
  ];

  it('opens, selects an option and closes', () => {
    const onChange = vi.fn();
    render(<CustomSelect options={options} value="vose" onChange={onChange} label="Idioma" />);
    const trigger = screen.getByRole('button', { name: /Idioma.*VOSE/ });
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('option', { name: 'Español latino' }));
    expect(onChange).toHaveBeenCalledWith('latino');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('supports keyboard navigation', () => {
    const onChange = vi.fn();
    render(<CustomSelect options={options} value="vose" onChange={onChange} />);
    const trigger = screen.getByRole('button', { name: /VOSE/ });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('latino');
  });
});

describe('useUserMedia', () => {
  it('restores progress and tolerates damaged saved data', () => {
    localStorage.setItem('streamflix_continue_watching', JSON.stringify([{ tmdbId: 42, currentTime: 125 }]));
    localStorage.setItem('streamflix_watchlist', '{damaged');
    const { result } = renderHook(() => useUserMedia());
    expect(result.current.getSavedProgress(42)).toBe(125);
    expect(result.current.watchlist).toEqual([]);
  });

  it('saves progress and removes a completed title', () => {
    const { result } = renderHook(() => useUserMedia());
    const item = { id: 42, title: 'Prueba' };
    act(() => result.current.saveProgress({ item, currentTime: 120, duration: 600 }));
    expect(result.current.getSavedProgress(42)).toBe(120);
    expect(JSON.parse(localStorage.getItem('streamflix_continue_watching'))[0].currentTime).toBe(120);
    act(() => result.current.saveProgress({ item, currentTime: 590, duration: 600 }));
    expect(result.current.getSavedProgress(42)).toBe(0);
  });
});

it('formats player time at minute and hour boundaries', () => {
  expect(formatPlayerTime(0)).toBe('00:00');
  expect(formatPlayerTime(59)).toBe('00:59');
  expect(formatPlayerTime(61)).toBe('01:01');
  expect(formatPlayerTime(3661)).toBe('1:01:01');
});

it('offers a VOD HLS source for offline download and excludes a web page', async () => {
  vi.spyOn(api, 'resolveSource').mockResolvedValue({
    streams: [
      { url: 'https://media.example.org/movie.m3u8', source: 'hls' },
      { url: 'https://media.example.org/watch.html', source: 'page' },
    ],
  });
  const { result } = renderHook(() => useOfflineDownloads({
    item: { id: 42, title: 'Prueba' }, details: null, mediaType: 'movie', isTv: false,
    selectedSeason: 1, episodes: [], preferredLanguage: 'latino',
  }));
  await act(async () => result.current.loadDownloadSources(1));
  expect(result.current.downloadSources).toHaveLength(1);
  expect(result.current.downloadSources[0].url).toMatch(/\.m3u8$/);
});
