import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import UpdateNotifier from '../src/components/UpdateNotifier.jsx';

describe('UpdateNotifier', () => {
  let progressCallback = null;
  let downloadedCallback = null;
  let postponeMock = vi.fn();
  let installMock = vi.fn();

  beforeEach(() => {
    progressCallback = null;
    downloadedCallback = null;
    postponeMock = vi.fn();
    installMock = vi.fn();

    window.electronAPI = {
      isElectron: true,
      onUpdateProgress: (cb) => {
        progressCallback = cb;
        return () => {};
      },
      onUpdateDownloaded: (cb) => {
        downloadedCallback = cb;
        return () => {};
      },
      postponeUpdate: postponeMock,
      installUpdate: installMock,
    };
  });

  afterEach(() => {
    cleanup();
    delete window.electronAPI;
    vi.restoreAllMocks();
  });

  it('1. Silencio absoluto cuando la app está al día: no renderiza nada', () => {
    const { container } = render(<UpdateNotifier />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText(/Actualización/i)).toBeNull();
  });

  it('2. Descarga terminada con aviso y botones «Instalar ahora» y «Más tarde»', () => {
    render(<UpdateNotifier />);

    act(() => {
      downloadedCallback({ version: '5.9.1' });
    });

    expect(screen.getByText(/Actualización lista: v5\.9\.1/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Instalar ahora/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Más tarde/i })).toBeTruthy();
  });

  it('3. Al hacer clic en «Más tarde», pospone y oculta la notificación de inmediato', () => {
    render(<UpdateNotifier />);

    act(() => {
      downloadedCallback({ version: '5.9.1' });
    });
    const postponeBtn = screen.getByRole('button', { name: /Más tarde/i });

    act(() => {
      fireEvent.click(postponeBtn);
    });

    expect(postponeMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Actualización lista: v5\.9\.1/i)).toBeNull();
  });

  it('4. Muestra progreso porcentual durante la descarga en segundo plano', () => {
    render(<UpdateNotifier />);

    act(() => {
      progressCallback({ percent: 42 });
    });

    expect(screen.getByText(/Descargando actualización en segundo plano/i)).toBeTruthy();
    expect(screen.getByText(/42%/i)).toBeTruthy();
  });
});
