import { BrowserWindow, clipboard, ipcMain, shell } from 'electron';
import fs from 'node:fs';
import { SETUP_CHANNELS } from './setup-ipc';
import type { SetupService } from './setup-service';

export function shouldShowSetupWizard(opts: {
  platform: string;
  needed: boolean;
  skipped: boolean;
}): boolean {
  return opts.platform === 'linux' && opts.needed && !opts.skipped;
}

export function openSetupWindow(opts: {
  service: SetupService;
  indexPath: string;
  preloadPath: string;
  icon?: Electron.NativeImage;
  onSkip: () => void;
  onFinish: () => void;
}): BrowserWindow {
  const win = new BrowserWindow({
    width: 720,
    height: 520,
    resizable: false,
    frame: false,
    title: 'OpenDS5 Setup',
    backgroundColor: '#0b1017',
    ...(opts.icon ? { icon: opts.icon } : {}),
    webPreferences: {
      preload: opts.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  let logPath: string | null = null;
  let finished = false;

  ipcMain.handle(SETUP_CHANNELS.getPlan, async () => {
    try {
      const out = await opts.service.dryRunPlan();
      const steps = out
        .split('\n')
        .filter((l) => /^ {2}\d+\. /.test(l))
        .map((l) => l.replace(/^ {2}\d+\. /, ''));
      return { steps };
    } catch (err) {
      return { unsupported: String(err instanceof Error ? err.message : err) };
    }
  });
  ipcMain.handle(SETUP_CHANNELS.install, async () => {
    await opts.service.install((event) => {
      if (event.event === 'plan') {
        logPath = event.log;
      }
      if (!win.isDestroyed()) {
        win.webContents.send(SETUP_CHANNELS.progress, event);
      }
    });
  });
  ipcMain.handle(SETUP_CHANNELS.skip, () => {
    finished = true;
    opts.onSkip();
    win.close();
  });
  ipcMain.handle(SETUP_CHANNELS.finish, () => {
    finished = true;
    opts.onFinish();
    win.close();
  });
  ipcMain.handle(SETUP_CHANNELS.openLog, () => {
    if (logPath) {
      void shell.openPath(logPath);
    }
  });
  ipcMain.handle(SETUP_CHANNELS.copyDiagnostics, () => {
    let tail = '';
    if (logPath && fs.existsSync(logPath)) {
      const lines = fs.readFileSync(logPath, 'utf8').split('\n');
      tail = lines.slice(-80).join('\n');
    }
    clipboard.writeText(`OpenDS5 install diagnostics\n${tail}`);
  });

  win.on('closed', () => {
    // reopen stays registered app-wide (main.ts owns it)
    for (const channel of Object.values(SETUP_CHANNELS)) {
      if (channel !== SETUP_CHANNELS.reopen) {
        ipcMain.removeHandler(channel);
      }
    }
    if (!finished) {
      // Window closed via WM without choosing: treat as skip-for-now.
      opts.onSkip();
    }
  });

  void win.loadFile(opts.indexPath, { query: { setup: '1' } });
  return win;
}
