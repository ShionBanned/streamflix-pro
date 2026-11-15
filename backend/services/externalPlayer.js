import { spawn } from 'child_process';
import fs from 'fs';

const VLC_PATHS = [
  'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe',
  'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe',
  '/Applications/VLC.app/Contents/MacOS/VLC',
  '/usr/bin/vlc',
  '/usr/local/bin/vlc',
];

const MPV_PATHS = [
  'mpv',
  'C:\\mpv\\mpv.exe',
  'C:\\ProgramData\\chocolatey\\bin\\mpv.exe',
  '/usr/bin/mpv',
  '/usr/local/bin/mpv',
];

/**
 * Lanza un reproductor de escritorio nativo (VLC o MPV)
 */
export function launchExternalPlayer(playerType = 'vlc', streamUrl, subtitleUrl = null, title = 'StreamFlix') {
  if (!streamUrl) {
    throw new Error('streamUrl es requerido para abrir el reproductor');
  }

  const isMpv = playerType.toLowerCase() === 'mpv';

  if (isMpv) {
    const mpvExecutable = MPV_PATHS.find((p) => p === 'mpv' || fs.existsSync(p)) || 'mpv';
    const args = [streamUrl, `--force-media-title=${title}`];
    if (subtitleUrl) {
      args.push(`--sub-file=${subtitleUrl}`);
    }

    try {
      const child = spawn(mpvExecutable, args, {
        detached: true,
        stdio: 'ignore',
        shell: true,
      });
      child.unref();

      return {
        success: true,
        player: 'MPV',
        executable: mpvExecutable,
        message: 'Lanzando stream en MPV con soporte para códecs de audio AC3/DTS',
      };
    } catch (err) {
      console.error('[ExternalPlayer Error MPV]:', err.message);
      return {
        success: false,
        player: 'MPV',
        error: 'No se pudo iniciar MPV. Asegúrate de tenerlo instalado y en el PATH.',
      };
    }
  }

  // Reproductor VLC
  const vlcExecutable = VLC_PATHS.find((p) => fs.existsSync(p)) || 'vlc';
  const args = [streamUrl, `--meta-title=${title}`];

  if (subtitleUrl) {
    args.push(`--sub-file=${subtitleUrl}`);
  }

  try {
    const child = spawn(vlcExecutable, args, {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();

    return {
      success: true,
      player: 'VLC',
      executable: vlcExecutable,
      message: 'Lanzando stream en VLC con aceleración por hardware y audio multi-canal',
    };
  } catch (err) {
    console.error('[ExternalPlayer Error VLC]:', err.message);
    try {
      // Fallback a comando vlc en PATH
      const fallbackChild = spawn('vlc', args, { detached: true, stdio: 'ignore' });
      fallbackChild.unref();
      return {
        success: true,
        player: 'VLC',
        executable: 'vlc',
        message: 'Lanzando stream en VLC (PATH)',
      };
    } catch (e) {
      return {
        success: false,
        player: 'VLC',
        error: 'No se pudo iniciar VLC. Asegúrate de tener VLC instalado en C:\\Program Files\\VideoLAN\\VLC.',
      };
    }
  }
}

export default {
  launchExternalPlayer,
};
