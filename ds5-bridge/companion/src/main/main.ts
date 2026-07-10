import { app, BrowserWindow, Menu, Notification, Tray, dialog, ipcMain, nativeImage, powerMonitor, screen, shell } from 'electron';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BridgeService } from './bridge-service';
import {
  PICO_UNIVERSAL_FLASH_NUKE_FILE,
  PICO_UNIVERSAL_FLASH_NUKE_SHA256_FILE,
  flashPicoFirmwareUf2,
  mountPicoBootloaderDrive,
  nukePicoFlash as copyPicoFlashNuke
} from './pico-firmware-updater';
import { SettingsStore } from './settings-store';
import { growBoundsToMinimum, loadWindowState, resolveWindowBounds, saveWindowState } from './window-state';
import { TriggerProfileStore } from './trigger-profile-store';
import { GameWatcher, listCandidateGameProcesses } from './game-watcher';
import { EvdevInputReader } from './evdev-input-reader';
import { TriggerProfileEngine, type DraftPreviewTriggers, type EngineStatus } from './trigger-profile-engine';
import type {
  AudioReactiveHapticsConfig,
  BridgePresetId,
  ChordAssignment,
  ChordFunction,
  HostPersonaMode,
  MuteButtonMode,
  MuteKeyboardBehavior,
  PollingRateMode,
  RemapButtonId,
  TriggerTestMode,
  TriggerTestTarget
} from '../shared/protocol';
import type { BridgeToast } from './bridge-service';
import type { TriggerProfile } from '../shared/trigger-profiles';
import type {
  AudioHapticsSession,
  BridgeSnapshot,
  PicoFirmwareAction,
  PicoFirmwareActionResult,
  UiScalePercent,
  UiThemePreset
} from '../shared/types';

const APP_NAME = 'DS5 Bridge';
const WINDOWS_APP_USER_MODEL_ID = 'io.github.sundaymoments.ds5bridge';
const WINDOWS_TOAST_ACTIVATOR_CLSID = '{A8B3700D-4BB5-4E22-BF57-0C43B7C2FDF6}';
const APP_MARK_PNG = path.join('assets', 'controllers', 'ds5-bridge_mark.png');
const APP_TRAY_ICON_ICO = path.join('assets', 'controllers', 'ds5-bridge_mark.ico');
const APP_TRAY_ICON_PNG = path.join('assets', 'controllers', 'ds5-bridge_mark.png');
const APP_ICON_ICO = path.join('assets', 'controllers', 'ds5-bridge_app-icon-tile.ico');
const PICO_UNIVERSAL_FLASH_NUKE_RELATIVE_PATH = path.join('firmware', PICO_UNIVERSAL_FLASH_NUKE_FILE);
const PICO_UNIVERSAL_FLASH_NUKE_SHA256_RELATIVE_PATH = path.join('firmware', PICO_UNIVERSAL_FLASH_NUKE_SHA256_FILE);
const BASE_WINDOW_WIDTH = 1120;
const BASE_WINDOW_HEIGHT = 630;
const START_IN_TRAY_ARG = '--start-in-tray';
const ALLOW_PARALLEL_AUTOMATION_INSTANCE = process.env.DS5_BRIDGE_ALLOW_PARALLEL_AUTOMATION_INSTANCE === '1';
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let trayDefaultIcon: Electron.NativeImage | null = null;
let bridgeService: BridgeService | null = null;
let triggerProfileEngine: TriggerProfileEngine | null = null;
let isQuitting = false;
let shutdownComplete = false;
const hasSingleInstanceLock = ALLOW_PARALLEL_AUTOMATION_INSTANCE || app.requestSingleInstanceLock();
const audioHapticsIconCache = new Map<string, Promise<string | null> | string | null>();
const TRAY_BATTERY_ICON_SIZE = 32;
const TRAY_BATTERY_ICON_SCALE_FACTOR = 2;
const TRAY_BATTERY_ICON_SHADOW = { red: 0, green: 0, blue: 0, alpha: 180 };
const TRAY_BATTERY_ICON_DISCHARGING = { red: 245, green: 248, blue: 255, alpha: 255 };
const TRAY_BATTERY_ICON_CHARGING = { red: 57, green: 215, blue: 125, alpha: 255 };
const trayBatteryIconCache = new Map<string, Electron.NativeImage>();

function windowsAppUserModelId(): string {
  return WINDOWS_APP_USER_MODEL_ID;
}

if (process.platform === 'win32') {
  app.setAppUserModelId(windowsAppUserModelId());
}

if (!hasSingleInstanceLock) {
  app.quit();
}

function appResourcePath(relativePath: string): string {
  const packagedPath = path.join(app.getAppPath(), relativePath);
  if (fs.existsSync(packagedPath)) {
    return packagedPath;
  }
  return path.resolve(app.getAppPath(), '..', relativePath);
}

function createImageAsset(relativePath: string): Electron.NativeImage {
  const image = nativeImage.createFromPath(appResourcePath(relativePath));
  return image.isEmpty() ? nativeImage.createEmpty() : image;
}

function createRuntimeIcon(): Electron.NativeImage {
  return createImageAsset(APP_MARK_PNG);
}

function sendToMainWindow(channel: string, ...args: unknown[]): void {
  const window = mainWindow;
  if (!window || window.isDestroyed() || window.webContents.isDestroyed()) {
    return;
  }
  window.webContents.send(channel, ...args);
}

let windowStateSaveTimer: NodeJS.Timeout | null = null;

function persistWindowState(): void {
  const window = mainWindow;
  if (!window || window.isDestroyed()) {
    return;
  }
  const maximized = window.isMaximized();
  const bounds = maximized ? window.getNormalBounds() : window.getBounds();
  saveWindowState(app.getPath('userData'), { ...bounds, maximized });
}

function scheduleWindowStateSave(): void {
  if (windowStateSaveTimer) {
    clearTimeout(windowStateSaveTimer);
  }
  windowStateSaveTimer = setTimeout(() => {
    windowStateSaveTimer = null;
    persistWindowState();
  }, 500);
}

async function createTrayIcon(): Promise<Electron.NativeImage> {
  const icon = createImageAsset(APP_TRAY_ICON_ICO);
  if (!icon.isEmpty()) {
    return icon;
  }

  const pngIcon = createImageAsset(APP_TRAY_ICON_PNG);
  return pngIcon.isEmpty() ? nativeImage.createEmpty() : pngIcon;
}

function scaledWindowSize(uiScalePercent: UiScalePercent): { width: number; height: number } {
  const scale = uiScalePercent / 100;
  return {
    width: Math.round(BASE_WINDOW_WIDTH * scale),
    height: Math.round(BASE_WINDOW_HEIGHT * scale)
  };
}

function applyWindowScale(window: BrowserWindow, uiScalePercent: UiScalePercent, recenter: boolean): void {
  const { width: minWidth, height: minHeight } = scaledWindowSize(uiScalePercent);
  window.webContents.setZoomFactor(uiScalePercent / 100);
  window.setMinimumSize(minWidth, minHeight);

  const currentBounds = window.getBounds();
  const workArea = screen.getDisplayMatching(currentBounds).workArea;
  const grown = growBoundsToMinimum(currentBounds, workArea, minWidth, minHeight);
  const x = recenter
    ? Math.round(Math.max(workArea.x, workArea.x + ((workArea.width - grown.width) / 2)))
    : grown.x;
  const y = recenter
    ? Math.round(Math.max(workArea.y, workArea.y + ((workArea.height - grown.height) / 2)))
    : grown.y;
  if (recenter || grown !== currentBounds) {
    window.setBounds({ x, y, width: grown.width, height: grown.height }, false);
  }
}

function applySnapshotWindowScale(snapshot: { settings: { uiScalePercent: UiScalePercent } }): void {
  if (mainWindow) {
    applyWindowScale(mainWindow, snapshot.settings.uiScalePercent, true);
  }
}

function currentUiScalePercent(): UiScalePercent {
  return bridgeService?.getSnapshot().settings.uiScalePercent ?? 100;
}

function trayControllerName(type: NonNullable<BridgeSnapshot['status']>['controllerType'] | undefined): string {
  if (type === 'dualsense-edge') return 'DualSense Edge';
  if (type === 'dualsense') return 'DualSense';
  return 'Controller';
}

function trayTooltipForSnapshot(snapshot: BridgeSnapshot): string {
  if (!snapshot.status?.controllerConnected) {
    return APP_NAME;
  }

  const name = trayControllerName(snapshot.status.controllerType);
  return snapshot.status.batteryPercent === null
    ? name
    : `${name} \u2014 ${snapshot.status.batteryPercent}%`;
}

type TrayBatteryIconColor = {
  red: number;
  green: number;
  blue: number;
  alpha: number;
};

const TRAY_BATTERY_DIGIT_SEGMENTS: Record<string, string> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abdeg',
  '3': 'abcdg',
  '4': 'bcfg',
  '5': 'acdfg',
  '6': 'acdefg',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcdfg'
};

function setTrayIconPixel(buffer: Buffer, x: number, y: number, color: TrayBatteryIconColor): void {
  if (x < 0 || y < 0 || x >= TRAY_BATTERY_ICON_SIZE || y >= TRAY_BATTERY_ICON_SIZE) {
    return;
  }
  const offset = ((y * TRAY_BATTERY_ICON_SIZE) + x) * 4;
  buffer[offset] = color.blue;
  buffer[offset + 1] = color.green;
  buffer[offset + 2] = color.red;
  buffer[offset + 3] = color.alpha;
}

function drawTrayIconRect(
  buffer: Buffer,
  x: number,
  y: number,
  width: number,
  height: number,
  color: TrayBatteryIconColor
): void {
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      setTrayIconPixel(buffer, column, row, color);
    }
  }
}

function drawTrayIconDigit(
  buffer: Buffer,
  digit: string,
  x: number,
  y: number,
  width: number,
  height: number,
  thickness: number,
  color: TrayBatteryIconColor
): void {
  const segments = TRAY_BATTERY_DIGIT_SEGMENTS[digit];
  if (!segments) {
    return;
  }

  const middleY = Math.floor((height - thickness) / 2);
  const lowerHeight = height - middleY - (thickness * 2);
  const rects: Record<string, [number, number, number, number]> = {
    a: [x + thickness, y, width - (thickness * 2), thickness],
    b: [x + width - thickness, y + thickness, thickness, middleY - thickness],
    c: [x + width - thickness, y + middleY + thickness, thickness, lowerHeight],
    d: [x + thickness, y + height - thickness, width - (thickness * 2), thickness],
    e: [x, y + middleY + thickness, thickness, lowerHeight],
    f: [x, y + thickness, thickness, middleY - thickness],
    g: [x + thickness, y + middleY, width - (thickness * 2), thickness]
  };

  for (const segment of segments) {
    const [segmentX, segmentY, segmentWidth, segmentHeight] = rects[segment];
    drawTrayIconRect(buffer, segmentX, segmentY, segmentWidth, segmentHeight, color);
  }
}

function drawTrayIconNumber(buffer: Buffer, text: string, color: TrayBatteryIconColor, offset = 0): void {
  const digitCount = text.length;
  const digitWidth = digitCount === 1 ? 14 : digitCount === 2 ? 12 : 9;
  const digitHeight = digitCount === 1 ? 24 : digitCount === 2 ? 24 : 22;
  const thickness = digitCount === 3 ? 2 : 3;
  const spacing = digitCount === 1 ? 0 : digitCount === 2 ? 2 : 1;
  const totalWidth = (digitCount * digitWidth) + ((digitCount - 1) * spacing);
  const startX = Math.floor((TRAY_BATTERY_ICON_SIZE - totalWidth) / 2) + offset;
  const startY = Math.floor((TRAY_BATTERY_ICON_SIZE - digitHeight) / 2) + offset;

  for (let index = 0; index < text.length; index += 1) {
    drawTrayIconDigit(
      buffer,
      text[index],
      startX + (index * (digitWidth + spacing)),
      startY,
      digitWidth,
      digitHeight,
      thickness,
      color
    );
  }
}

function batteryTrayIcon(percent: number, charging: boolean): Electron.NativeImage {
  const clampedPercent = Math.max(0, Math.min(100, Math.round(percent)));
  const text = String(clampedPercent);
  const key = `${text}:${charging ? 'charging' : 'discharging'}`;
  const cached = trayBatteryIconCache.get(key);
  if (cached) {
    return cached;
  }

  const buffer = Buffer.alloc(TRAY_BATTERY_ICON_SIZE * TRAY_BATTERY_ICON_SIZE * 4);
  drawTrayIconNumber(buffer, text, TRAY_BATTERY_ICON_SHADOW, 1);
  drawTrayIconNumber(buffer, text, charging ? TRAY_BATTERY_ICON_CHARGING : TRAY_BATTERY_ICON_DISCHARGING);
  const image = nativeImage.createFromBitmap(buffer, {
    width: TRAY_BATTERY_ICON_SIZE,
    height: TRAY_BATTERY_ICON_SIZE,
    scaleFactor: TRAY_BATTERY_ICON_SCALE_FACTOR
  });
  trayBatteryIconCache.set(key, image);
  return image;
}

function isChargingPowerState(rawPowerState: number | undefined): boolean {
  return rawPowerState === 0x01 || rawPowerState === 0x02;
}

function trayIconForSnapshot(snapshot: BridgeSnapshot): Electron.NativeImage | null {
  if (
    !snapshot.settings.showBatteryPercentTrayIcon
    || !snapshot.status?.controllerConnected
    || snapshot.status.batteryPercent === null
  ) {
    return trayDefaultIcon;
  }

  return batteryTrayIcon(snapshot.status.batteryPercent, isChargingPowerState(snapshot.status.rawPowerState));
}

function updateTrayTooltip(snapshot: BridgeSnapshot): void {
  tray?.setToolTip(trayTooltipForSnapshot(snapshot));
}

function updateTrayIcon(snapshot: BridgeSnapshot): void {
  const icon = trayIconForSnapshot(snapshot);
  if (icon) {
    tray?.setImage(icon);
  }
}

function updateTrayPresentation(snapshot: BridgeSnapshot): void {
  updateTrayTooltip(snapshot);
  updateTrayIcon(snapshot);
}

function restoreMainWindowScale(recenter: boolean): void {
  const window = mainWindow;
  if (!window || window.isDestroyed()) {
    return;
  }
  applyWindowScale(window, currentUiScalePercent(), recenter);
}

function scheduleMainWindowScaleRestore(recenter: boolean): void {
  setTimeout(() => restoreMainWindowScale(recenter), 0);
  setTimeout(() => restoreMainWindowScale(recenter), 250);
}

function shouldStartInTray(argv = process.argv): boolean {
  return argv.includes(START_IN_TRAY_ARG);
}

function loginItemArgs(): string[] {
  return process.defaultApp
    ? [app.getAppPath(), START_IN_TRAY_ARG]
    : [START_IN_TRAY_ARG];
}

function applyLaunchAtStartup(enabled: boolean): void {
  if (process.platform !== 'win32') {
    return;
  }

  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: enabled,
      path: process.execPath,
      args: loginItemArgs()
    });
  } catch (error) {
    console.warn('Failed to update launch at startup setting:', error);
  }
}

function normalizeFilePath(value: string): string {
  return path.normalize(value).toLowerCase();
}

function isAppFileUrl(url: string, appIndexPath: string): boolean {
  try {
    return normalizeFilePath(fileURLToPath(url)) === normalizeFilePath(appIndexPath);
  } catch {
    return false;
  }
}

function isAllowedExternalUrl(url: string): boolean {
  return /^https:\/\/ko-fi\.com\/lordvicky\/?$/i.test(url)
    || /^https:\/\/github\.com\/SundayMoments\/?$/i.test(url);
}

function createWindow(uiScalePercent: UiScalePercent): BrowserWindow {
  const { width: minWidth, height: minHeight } = scaledWindowSize(uiScalePercent);
  const savedState = loadWindowState(app.getPath('userData'));
  const workArea = screen.getPrimaryDisplay().workArea;
  const restoredBounds = resolveWindowBounds(savedState, workArea, minWidth, minHeight);
  const rendererIndexPath = path.join(__dirname, '..', '..', 'renderer', 'index.html');
  const window = new BrowserWindow({
    width: restoredBounds?.width ?? minWidth,
    height: restoredBounds?.height ?? minHeight,
    ...(restoredBounds ? { x: restoredBounds.x, y: restoredBounds.y } : {}),
    minWidth,
    minHeight,
    show: false,
    title: 'DS5 Bridge',
    frame: false,
    resizable: true,
    maximizable: true,
    fullscreenable: false,
    transparent: false,
    backgroundColor: '#0b1017',
    skipTaskbar: false,
    icon: createRuntimeIcon(),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(
      webContents === window.webContents
      && (permission === 'media' || permission === 'speaker-selection')
    );
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (isAppFileUrl(url, rendererIndexPath)) {
      return;
    }
    event.preventDefault();
  });

  window.on('close', (event) => {
    persistWindowState();
    if (!isQuitting) {
      event.preventDefault();
      window.hide();
    }
  });
  window.on('will-move', () => bridgeService?.pausePollingFor(1200));
  window.on('move', () => bridgeService?.pausePollingFor(700));
  window.on('resize', scheduleWindowStateSave);
  window.on('move', scheduleWindowStateSave);
  window.on('maximize', scheduleWindowStateSave);
  window.on('unmaximize', scheduleWindowStateSave);

  window.loadFile(rendererIndexPath);
  window.webContents.once('did-finish-load', () => {
    applyWindowScale(window, uiScalePercent, false);
    if (savedState?.maximized) {
      window.maximize();
    }
  });
  return window;
}

function sendWindowMaximizedState(): void {
  if (!mainWindow || mainWindow.webContents.isDestroyed()) return;
  mainWindow.webContents.send('window:maximizedChanged', mainWindow.isMaximized());
}

function showMainWindow(): void {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  restoreMainWindowScale(false);

  const windowBounds = mainWindow.getBounds();
  const visibleOnAnyDisplay = screen.getAllDisplays().some((display) => {
    const area = display.workArea;
    return windowBounds.x < area.x + area.width
      && windowBounds.x + windowBounds.width > area.x
      && windowBounds.y < area.y + area.height
      && windowBounds.y + windowBounds.height > area.y;
  });
  if (!visibleOnAnyDisplay) {
    const area = screen.getPrimaryDisplay().workArea;
    mainWindow.setPosition(
      Math.round(area.x + ((area.width - windowBounds.width) / 2)),
      Math.round(area.y + ((area.height - windowBounds.height) / 2)),
      false
    );
  }

  mainWindow.show();
  mainWindow.focus();
}

function powerShellString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function writeBasicWindowsShortcut(details: {
  shortcutPath: string;
  target: string;
  args: string;
  cwd: string;
  description: string;
  icon: string;
  iconIndex: number;
}): boolean {
  const script = `
$ErrorActionPreference = 'Stop'
$shortcutPath = ${powerShellString(details.shortcutPath)}
$target = ${powerShellString(details.target)}
$arguments = ${powerShellString(details.args)}
$cwd = ${powerShellString(details.cwd)}
$description = ${powerShellString(details.description)}
$icon = ${powerShellString(details.icon)}
$iconIndex = ${details.iconIndex}
$appUserModelId = ${powerShellString(WINDOWS_APP_USER_MODEL_ID)}
$toastActivatorClsid = ${powerShellString(WINDOWS_TOAST_ACTIVATOR_CLSID)}
$source = @'
using System;
using System.Runtime.InteropServices;
using System.Text;

namespace Ds5BridgeShortcut {
  [ComImport, Guid("00021401-0000-0000-C000-000000000046")]
  public class ShellLink { }

  [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("000214F9-0000-0000-C000-000000000046")]
  public interface IShellLinkW {
    void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszFile, int cchMaxPath, IntPtr pfd, uint fFlags);
    void GetIDList(out IntPtr ppidl);
    void SetIDList(IntPtr pidl);
    void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszName, int cchMaxName);
    void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string pszName);
    void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszDir, int cchMaxPath);
    void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string pszDir);
    void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszArgs, int cchMaxPath);
    void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string pszArgs);
    void GetHotkey(out short pwHotkey);
    void SetHotkey(short wHotkey);
    void GetShowCmd(out int piShowCmd);
    void SetShowCmd(int iShowCmd);
    void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszIconPath, int cchIconPath, out int piIcon);
    void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string pszIconPath, int iIcon);
    void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string pszPathRel, uint dwReserved);
    void Resolve(IntPtr hwnd, uint fFlags);
    void SetPath([MarshalAs(UnmanagedType.LPWStr)] string pszFile);
  }

  [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("0000010b-0000-0000-C000-000000000046")]
  public interface IPersistFile {
    void GetClassID(out Guid pClassID);
    [PreserveSig] int IsDirty();
    void Load([MarshalAs(UnmanagedType.LPWStr)] string pszFileName, uint dwMode);
    void Save([MarshalAs(UnmanagedType.LPWStr)] string pszFileName, bool fRemember);
    void SaveCompleted([MarshalAs(UnmanagedType.LPWStr)] string pszFileName);
    void GetCurFile([MarshalAs(UnmanagedType.LPWStr)] out string ppszFileName);
  }

  [StructLayout(LayoutKind.Sequential, Pack = 4)]
  public struct PropertyKey {
    public Guid fmtid;
    public uint pid;
    public PropertyKey(Guid fmtid, uint pid) { this.fmtid = fmtid; this.pid = pid; }
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct PropVariant {
    public ushort vt;
    public ushort wReserved1;
    public ushort wReserved2;
    public ushort wReserved3;
    public IntPtr p;
    public int p2;

    public static PropVariant FromString(string value) {
      return new PropVariant { vt = 31, p = Marshal.StringToCoTaskMemUni(value) };
    }

    public static PropVariant FromGuid(Guid value) {
      IntPtr pointer = Marshal.AllocCoTaskMem(16);
      Marshal.StructureToPtr(value, pointer, false);
      return new PropVariant { vt = 72, p = pointer };
    }
  }

  [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99")]
  public interface IPropertyStore {
    [PreserveSig] int GetCount(out uint cProps);
    [PreserveSig] int GetAt(uint iProp, out PropertyKey pkey);
    [PreserveSig] int GetValue(ref PropertyKey key, out PropVariant pv);
    [PreserveSig] int SetValue(ref PropertyKey key, ref PropVariant pv);
    [PreserveSig] int Commit();
  }

  public static class ShortcutWriter {
    [DllImport("ole32.dll", PreserveSig = true)]
    private static extern int PropVariantClear(ref PropVariant pvar);

    public static void Write(
      string shortcutPath,
      string target,
      string args,
      string cwd,
      string description,
      string icon,
      int iconIndex,
      string appUserModelId,
      string toastActivatorClsid
    ) {
      var link = (IShellLinkW)new ShellLink();
      link.SetPath(target);
      if (!String.IsNullOrEmpty(args)) link.SetArguments(args);
      if (!String.IsNullOrEmpty(cwd)) link.SetWorkingDirectory(cwd);
      if (!String.IsNullOrEmpty(description)) link.SetDescription(description);
      if (!String.IsNullOrEmpty(icon)) link.SetIconLocation(icon, iconIndex);

      var store = (IPropertyStore)link;
      var appKey = new PropertyKey(new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), 5);
      var appValue = PropVariant.FromString(appUserModelId);
      int hr = store.SetValue(ref appKey, ref appValue);
      PropVariantClear(ref appValue);
      if (hr != 0) Marshal.ThrowExceptionForHR(hr);

      if (!String.IsNullOrEmpty(toastActivatorClsid)) {
        var clsidKey = new PropertyKey(new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), 26);
        var clsidValue = PropVariant.FromGuid(new Guid(toastActivatorClsid));
        hr = store.SetValue(ref clsidKey, ref clsidValue);
        PropVariantClear(ref clsidValue);
        if (hr != 0) Marshal.ThrowExceptionForHR(hr);
      }

      hr = store.Commit();
      if (hr != 0) Marshal.ThrowExceptionForHR(hr);
      ((IPersistFile)link).Save(shortcutPath, true);
    }
  }
}
'@
Add-Type -TypeDefinition $source
[Ds5BridgeShortcut.ShortcutWriter]::Write(
  $shortcutPath,
  $target,
  $arguments,
  $cwd,
  $description,
  $icon,
  $iconIndex,
  $appUserModelId,
  $toastActivatorClsid
)
$registryPath = "HKCU:\\Software\\Classes\\AppUserModelId\\$appUserModelId"
New-Item -Path $registryPath -Force | Out-Null
New-ItemProperty -Path $registryPath -Name 'DisplayName' -Value $description -PropertyType String -Force | Out-Null
New-ItemProperty -Path $registryPath -Name 'IconUri' -Value $icon -PropertyType String -Force | Out-Null
`;
  const result = spawnSync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script
  ], {
    encoding: 'utf8',
    windowsHide: true
  });

  if (result.status !== 0) {
    console.warn('Failed to create Windows notification shortcut:', result.stderr.trim() || result.error);
    return false;
  }
  return fs.existsSync(details.shortcutPath);
}

function updateWindowsAppIconRegistry(iconPath: string): void {
  const script = `
$ErrorActionPreference = 'Stop'
$registryPath = "HKCU:\\Software\\Classes\\AppUserModelId\\${WINDOWS_APP_USER_MODEL_ID}"
New-Item -Path $registryPath -Force | Out-Null
New-ItemProperty -Path $registryPath -Name 'DisplayName' -Value ${powerShellString(`${APP_NAME} companion`)} -PropertyType String -Force | Out-Null
New-ItemProperty -Path $registryPath -Name 'IconUri' -Value ${powerShellString(iconPath)} -PropertyType String -Force | Out-Null
`;
  spawnSync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script
  ], {
    encoding: 'utf8',
    windowsHide: true
  });
}

function ensureWindowsNotificationShortcut(): void {
  if (process.platform !== 'win32') {
    return;
  }

  try {
    const programsPath = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
    const appPath = app.getAppPath();
    const appUserModelId = windowsAppUserModelId();
    const shortcutPath = path.join(programsPath, `${APP_NAME}.lnk`);
    const shortcutDetails = {
      shortcutPath,
      target: process.execPath,
      args: process.defaultApp ? `"${appPath}"` : '',
      cwd: process.defaultApp ? appPath : path.dirname(process.execPath),
      description: `${APP_NAME} companion`,
      icon: appResourcePath(APP_ICON_ICO),
      iconIndex: 0
    };

    updateWindowsAppIconRegistry(shortcutDetails.icon);
    fs.mkdirSync(programsPath, { recursive: true });
    const created = shell.writeShortcutLink(shortcutPath, 'replace', {
      target: shortcutDetails.target,
      args: shortcutDetails.args,
      cwd: shortcutDetails.cwd,
      description: shortcutDetails.description,
      icon: shortcutDetails.icon,
      iconIndex: shortcutDetails.iconIndex,
      appUserModelId,
      toastActivatorClsid: WINDOWS_TOAST_ACTIVATOR_CLSID
    });
    if (!created && !writeBasicWindowsShortcut(shortcutDetails)) {
      console.warn('Windows notification shortcut was not created.');
    }
  } catch {
    // Windows toasts may be unavailable, but shortcut setup should not block
    // the tray app from starting.
  }
}

function showBridgeNotification(toast: BridgeToast): void {
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: toast.title,
      body: toast.body,
      icon: createRuntimeIcon(),
      silent: false
    });
    notification.once('failed', (_event, error) => {
      console.warn('Windows notification failed:', error);
    });
    notification.show();
  }
}

async function addAudioHapticsSessionIcons(sessions: AudioHapticsSession[]): Promise<AudioHapticsSession[]> {
  return Promise.all(sessions.map(async (session) => ({
    ...session,
    iconDataUrl: await audioHapticsSessionIconDataUrl(session)
  })));
}

async function audioHapticsSessionIconDataUrl(session: AudioHapticsSession): Promise<string | null> {
  const cacheKey = audioHapticsSessionIconCacheKey(session);
  if (!cacheKey) {
    return null;
  }
  const cached = audioHapticsIconCache.get(cacheKey);
  if (cached !== undefined) {
    return cached instanceof Promise ? cached : cached;
  }
  const pending = loadAudioHapticsSessionIconDataUrl(session);
  audioHapticsIconCache.set(cacheKey, pending);
  const value = await pending;
  audioHapticsIconCache.set(cacheKey, value);
  return value;
}

function audioHapticsSessionIconCacheKey(session: AudioHapticsSession): string | null {
  return session.iconPath
    || session.processPath
    || session.executableName
    || (session.processId > 0 ? `pid:${session.processId}` : null);
}

async function loadAudioHapticsSessionIconDataUrl(session: AudioHapticsSession): Promise<string | null> {
  // 1. Try loading a native image directly from the icon path (handles
  //    UWP / packaged-app .png icons that the C# shell APIs miss).
  for (const imagePath of audioHapticsSessionIconFileCandidates(session.iconPath)) {
    const sessionIcon = nativeImageFromPath(imagePath);
    if (sessionIcon && !sessionIcon.isEmpty()) {
      return sessionIcon.resize({ width: 32, height: 32 }).toDataURL();
    }
  }

  // 2. Prefer the icon already resolved by the native helper via
  //    ExtractAssociatedIcon / SHGetFileInfo (best result for regular apps).
  if (session.iconDataUrl) {
    return session.iconDataUrl;
  }

  // 3. Fall back to Electron's shell icon extraction as a last resort.
  for (const iconPath of audioHapticsSessionIconFileCandidates(session.processPath, session.iconPath)) {
    try {
      const image = await app.getFileIcon(iconPath, { size: 'normal' });
      if (!image.isEmpty()) {
        return image.resize({ width: 32, height: 32 }).toDataURL();
      }
    } catch {
    }
  }
  return null;
}

function nativeImageFromPath(filePath: string | null): Electron.NativeImage | null {
  if (!filePath || !fs.existsSync(filePath) || !/\.(ico|png|jpg|jpeg|bmp)$/i.test(filePath)) {
    return null;
  }
  try {
    return nativeImage.createFromPath(filePath);
  } catch {
    return null;
  }
}

function audioHapticsSessionIconFileCandidates(...paths: Array<string | null | undefined>): string[] {
  const candidates = new Set<string>();
  for (const candidate of paths) {
    const normalized = normalizeAudioHapticsSessionIconPath(candidate);
    if (normalized) {
      candidates.add(normalized);
    }
  }
  // Fall back to raw trimmed paths for entries that didn't survive
  // normalization (e.g. paths that don't pass existsSync but can still
  // be resolved by Electron's getFileIcon).
  for (const candidate of paths) {
    const raw = candidate?.trim();
    if (raw) {
      candidates.add(raw);
    }
  }
  return [...candidates];
}

function normalizeAudioHapticsSessionIconPath(filePath: string | null | undefined): string | null {
  if (!filePath?.trim()) {
    return null;
  }
  const candidates = [
    filePath.trim(),
    stripAudioHapticsIconResourceIndex(filePath)
  ];
  for (const candidate of candidates) {
    if (!candidate?.trim()) {
      continue;
    }
    const normalized = candidate.trim().replace(/^@/, '').replace(/^"|"$/g, '');
    if (fs.existsSync(normalized)) {
      return normalized;
    }
  }
  return null;
}

function stripAudioHapticsIconResourceIndex(filePath: string): string | null {
  let value = filePath.trim();
  if (value.startsWith('@')) {
    value = value.slice(1).trim();
  }
  if (value.startsWith('"')) {
    const quoteEnd = value.indexOf('"', 1);
    return quoteEnd > 1 ? value.slice(1, quoteEnd) : value.replace(/^"|"$/g, '');
  }
  const commaIndex = value.lastIndexOf(',');
  if (commaIndex > 0 && /^-?\d+$/.test(value.slice(commaIndex + 1).trim())) {
    return value.slice(0, commaIndex).trim().replace(/^"|"$/g, '');
  }
  return value.replace(/^"|"$/g, '');
}

async function selectPicoFirmwareUf2Path(): Promise<string | null> {
  const options: Electron.OpenDialogOptions = {
    title: 'Choose Pico firmware UF2',
    properties: ['openFile'],
    filters: [
      { name: 'UF2 firmware', extensions: ['uf2'] },
      { name: 'All files', extensions: ['*'] }
    ]
  };
  const result = mainWindow && !mainWindow.isDestroyed()
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  return result.canceled ? null : result.filePaths[0] ?? null;
}

function picoFirmwareOptions(service: BridgeService, includeNukeUf2 = false) {
  return {
    enterBootloader: () => service.mountPicoBootloader(),
    ...(includeNukeUf2
      ? {
          nukeUf2Path: resolvePicoUniversalFlashNukePath(),
          nukeUf2Sha256Path: resolvePicoUniversalFlashNukeSha256Path()
        }
      : {})
  };
}

function resolvePicoUniversalFlashNukePath(): string {
  const packagedCandidate = process.resourcesPath
    ? path.join(process.resourcesPath, PICO_UNIVERSAL_FLASH_NUKE_RELATIVE_PATH)
    : null;
  const candidates = [
    packagedCandidate,
    path.resolve(process.cwd(), PICO_UNIVERSAL_FLASH_NUKE_RELATIVE_PATH),
    path.resolve(__dirname, '..', '..', '..', PICO_UNIVERSAL_FLASH_NUKE_RELATIVE_PATH)
  ].filter((candidate): candidate is string => Boolean(candidate));

  const nukePath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!nukePath) {
    throw new Error('Pico flash nuke UF2 is missing. Run tools\\build-pico-universal-flash-nuke.ps1 from the repository root.');
  }
  return nukePath;
}

function resolvePicoUniversalFlashNukeSha256Path(): string {
  const packagedCandidate = process.resourcesPath
    ? path.join(process.resourcesPath, PICO_UNIVERSAL_FLASH_NUKE_SHA256_RELATIVE_PATH)
    : null;
  const candidates = [
    packagedCandidate,
    path.resolve(process.cwd(), PICO_UNIVERSAL_FLASH_NUKE_SHA256_RELATIVE_PATH),
    path.resolve(__dirname, '..', '..', '..', PICO_UNIVERSAL_FLASH_NUKE_SHA256_RELATIVE_PATH)
  ].filter((candidate): candidate is string => Boolean(candidate));

  const sha256Path = candidates.find((candidate) => fs.existsSync(candidate));
  if (!sha256Path) {
    throw new Error('Pico flash nuke SHA-256 manifest is missing. Run tools\\build-pico-universal-flash-nuke.ps1 from the repository root.');
  }
  return sha256Path;
}

async function flashSelectedPicoFirmware(service: BridgeService): Promise<PicoFirmwareActionResult> {
  const sourcePath = await selectPicoFirmwareUf2Path();
  if (!sourcePath) {
    return {
      ok: false,
      action: 'flash',
      cancelled: true,
      message: 'Firmware flash cancelled.'
    };
  }
  return flashPicoFirmwareUf2(sourcePath, picoFirmwareOptions(service));
}

async function confirmPicoFlashNuke(): Promise<boolean> {
  const options: Electron.MessageBoxOptions = {
    type: 'warning',
    title: 'Nuke Pico flash?',
    message: 'Nuke Pico flash?',
    detail: 'This will copy the bundled Pico Universal Flash Nuke UF2 to the mounted Pico bootloader drive and erase the Pico flash.\n\nThe bridge will not work again until you flash the DS5 Bridge firmware back onto the Pico. Use this only when recovering from a bad or stuck firmware install.',
    buttons: ['Nuke Pico', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    noLink: true
  };
  const result = mainWindow && !mainWindow.isDestroyed()
    ? await dialog.showMessageBox(mainWindow, options)
    : await dialog.showMessageBox(options);
  return result.response === 0;
}

async function nukePicoFlash(service: BridgeService): Promise<PicoFirmwareActionResult> {
  if (!await confirmPicoFlashNuke()) {
    return {
      ok: false,
      action: 'nuke',
      cancelled: true,
      message: 'Pico flash nuke cancelled.'
    };
  }
  return copyPicoFlashNuke(picoFirmwareOptions(service, true));
}

function picoFirmwareErrorMessage(error: unknown): string {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : '';
  const cleaned = message
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim();

  if (/No companion bridge is connected/i.test(cleaned)) {
    return 'No companion bridge is connected. Connect the companion bridge, then try again.';
  }

  return cleaned || 'Pico firmware action failed.';
}

async function runPicoFirmwareIpcAction(
  action: PicoFirmwareAction,
  task: () => Promise<PicoFirmwareActionResult>
): Promise<PicoFirmwareActionResult> {
  try {
    return await task();
  } catch (error) {
    return {
      ok: false,
      action,
      message: picoFirmwareErrorMessage(error)
    };
  }
}

function registerIpc(
  service: BridgeService,
  triggerProfileStore: TriggerProfileStore,
  triggerProfileEngine: TriggerProfileEngine
): void {
  ipcMain.handle('bridge:listTriggerProfiles', () => triggerProfileStore.list());
  ipcMain.handle('bridge:saveTriggerProfile', (_event, profile: TriggerProfile) => {
    const saved = triggerProfileStore.save(profile);
    triggerProfileEngine.refreshProfiles();
    return saved;
  });
  ipcMain.handle('bridge:deleteTriggerProfile', (_event, id: string) => {
    const deleted = triggerProfileStore.delete(id);
    triggerProfileEngine.refreshProfiles();
    return deleted;
  });
  ipcMain.handle('bridge:setTriggerProfilesEnabled', async (_event, enabled: boolean) => {
    await triggerProfileEngine.setEnabled(enabled);
    const status = triggerProfileEngine.getStatus();
    triggerProfileStore.saveEngineState({
      enabled: status.enabled,
      pinnedProfileId: status.matchedBy === 'pin' ? status.activeProfileId : null
    });
    return status;
  });
  ipcMain.handle('bridge:pinTriggerProfile', (_event, id: string | null) => {
    triggerProfileEngine.pinProfile(id);
    const status = triggerProfileEngine.getStatus();
    triggerProfileStore.saveEngineState({
      enabled: status.enabled,
      pinnedProfileId: status.matchedBy === 'pin' ? status.activeProfileId : null
    });
    return status;
  });
  ipcMain.handle('bridge:getTriggerProfileEngineStatus', () => triggerProfileEngine.getStatus());
  ipcMain.handle('bridge:previewTriggerProfileDraft', async (_event, triggers: DraftPreviewTriggers | null) => {
    await triggerProfileEngine.setDraftPreview(triggers);
    return triggerProfileEngine.getStatus();
  });
  ipcMain.handle('bridge:listCandidateGameProcesses', () => {
    try {
      return listCandidateGameProcesses();
    } catch {
      return [];
    }
  });

  ipcMain.handle('bridge:getStatus', () => service.getSnapshot());
  ipcMain.handle('bridge:listDevices', () => service.listDevices());
  ipcMain.handle('bridge:listAudioHapticsSessions', async () => (
    addAudioHapticsSessionIcons(await service.listAudioHapticsSessions())
  ));
  ipcMain.handle('bridge:applyPreset', (_event, value: BridgePresetId) => service.applyPreset(value));
  ipcMain.handle('bridge:selectControllerProfile', (_event, profileId: string) => (
    service.selectControllerProfile(profileId)
  ));
  ipcMain.handle('bridge:saveControllerProfile', (_event, name?: string) => service.saveControllerProfile(name));
  ipcMain.handle('bridge:updateControllerProfile', (_event, profileId: string) => (
    service.updateControllerProfile(profileId)
  ));
  ipcMain.handle('bridge:renameControllerProfile', (_event, profileId: string, name: string) => (
    service.renameControllerProfile(profileId, name)
  ));
  ipcMain.handle('bridge:deleteControllerProfile', (_event, profileId: string) => (
    service.deleteControllerProfile(profileId)
  ));
  ipcMain.handle('bridge:setHapticsGain', (_event, value: number) => service.setHapticsGain(value));
  ipcMain.handle('bridge:setHapticsEnabled', (_event, value: boolean) => service.setHapticsEnabled(value));
  ipcMain.handle('bridge:setFeedbackBoostEnabled', (_event, value: boolean) => (
    service.setFeedbackBoostEnabled(value)
  ));
  ipcMain.handle('bridge:setHapticsBufferLength', (_event, value: number) => service.setHapticsBufferLength(value));
  ipcMain.handle('bridge:setClassicRumbleGain', (_event, value: number) => service.setClassicRumbleGain(value));
  ipcMain.handle('bridge:setClassicRumbleEnabled', (_event, value: boolean) => service.setClassicRumbleEnabled(value));
  ipcMain.handle('bridge:setClassicRumbleV1Enabled', (_event, value: boolean) => (
    service.setClassicRumbleV1Enabled(value)
  ));
  ipcMain.handle('bridge:setTriggerEffectIntensity', (_event, value: number) => (
    service.setTriggerEffectIntensity(value)
  ));
  ipcMain.handle('bridge:setTriggerTestMode', (_event, value: TriggerTestMode) => service.setTriggerTestMode(value));
  ipcMain.handle('bridge:setAdaptiveTriggersEnabled', async (_event, value: boolean) => {
    if (!value) {
      await triggerProfileEngine.suspend();
    }
    const result = await service.setAdaptiveTriggersEnabled(value);
    if (value) {
      await triggerProfileEngine.resume();
    }
    return result;
  });
  ipcMain.handle('bridge:setSpeakerVolume', (_event, value: number) => service.setSpeakerVolume(value));
  ipcMain.handle('bridge:setSpeakerGainLevel', (_event, value: number) => service.setSpeakerGainLevel(value));
  ipcMain.handle('bridge:setSpeakerEnabled', (_event, value: boolean) => service.setSpeakerEnabled(value));
  ipcMain.handle('bridge:setMicVolume', (_event, value: number) => service.setMicVolume(value));
  ipcMain.handle('bridge:setMicMute', (_event, value: boolean) => service.setMicMute(value));
  ipcMain.handle('bridge:setAudioReactiveHapticsConfig', (
    _event,
    value: Partial<AudioReactiveHapticsConfig>
  ) => (
    service.setAudioReactiveHapticsConfig(value)
  ));
  ipcMain.handle('bridge:setDuplexMicEnabled', (_event, value: boolean) => service.setDuplexMicEnabled(value));
  ipcMain.handle('bridge:setLightbarColor', (_event, color: string, brightness: number) => (
    service.setLightbarColor(color, brightness)
  ));
  ipcMain.handle('bridge:setLightbarEnabled', (_event, value: boolean) => service.setLightbarEnabled(value));
  ipcMain.handle('bridge:setLightbarOverrideEnabled', (_event, value: boolean) => (
    service.setLightbarOverrideEnabled(value)
  ));
  ipcMain.handle('bridge:setMuteButtonAction', (
    _event,
    mode: MuteButtonMode,
    usage: number,
    modifiers: number,
    behavior: MuteKeyboardBehavior,
    chordStarterEnabled?: boolean
  ) => (
    service.setMuteButtonAction(mode, usage, modifiers, behavior, chordStarterEnabled)
  ));
  ipcMain.handle('bridge:setLedEnabled', (_event, value: boolean) => service.setLedEnabled(value));
  ipcMain.handle('bridge:setPlayerLedEnabled', (_event, value: boolean) => service.setPlayerLedEnabled(value));
  ipcMain.handle('bridge:setIdleDisconnectEnabled', (_event, value: boolean) => service.setIdleDisconnectEnabled(value));
  ipcMain.handle('bridge:setIdleDisconnectTimeoutMinutes', (_event, value: number) => (
    service.setIdleDisconnectTimeoutMinutes(value)
  ));
  ipcMain.handle('bridge:setUsbSuspendDisconnectEnabled', (_event, value: boolean) => (
    service.setUsbSuspendDisconnectEnabled(value)
  ));
  ipcMain.handle('bridge:setSleepKeybindEnabled', (_event, value: boolean) => (
    service.setSleepKeybindEnabled(value)
  ));
  ipcMain.handle('bridge:setSpeakerVolumeShortcutEnabled', (_event, value: boolean) => (
    service.setSpeakerVolumeShortcutEnabled(value)
  ));
  ipcMain.handle('bridge:setControllerPowerSavingEnabled', (_event, value: boolean) => (
    service.setControllerPowerSavingEnabled(value)
  ));
  ipcMain.handle('bridge:setUiScalePercent', (_event, value: UiScalePercent) => {
    const snapshot = service.setUiScalePercent(value);
    applySnapshotWindowScale(snapshot);
    return snapshot;
  });
  ipcMain.handle('bridge:setUiThemePreset', (_event, value: UiThemePreset) => (
    service.setUiThemePreset(value)
  ));
  ipcMain.handle('bridge:setLaunchAtStartupEnabled', (_event, value: boolean) => {
    const snapshot = service.setLaunchAtStartupEnabled(Boolean(value));
    applyLaunchAtStartup(snapshot.settings.launchAtStartupEnabled);
    return snapshot;
  });
  ipcMain.handle('bridge:setShowBatteryPercentTrayIcon', (_event, value: boolean) => (
    service.setShowBatteryPercentTrayIcon(Boolean(value))
  ));
  ipcMain.handle('bridge:setPollingRateMode', (_event, value: PollingRateMode) => (
    service.setPollingRateMode(value)
  ));
  ipcMain.handle('bridge:setHostPersonaMode', (_event, value: HostPersonaMode) => (
    service.setHostPersonaMode(value)
  ));
  ipcMain.handle('bridge:sleepController', () => service.sleepController());
  ipcMain.handle('bridge:mountPicoBootloader', () => runPicoFirmwareIpcAction(
    'mount',
    () => mountPicoBootloaderDrive(picoFirmwareOptions(service))
  ));
  ipcMain.handle('bridge:flashPicoFirmware', () => runPicoFirmwareIpcAction(
    'flash',
    () => flashSelectedPicoFirmware(service)
  ));
  ipcMain.handle('bridge:nukePicoFlash', () => runPicoFirmwareIpcAction(
    'nuke',
    () => nukePicoFlash(service)
  ));
  ipcMain.handle('bridge:setNotifyControllerConnection', (_event, value: boolean) => (
    service.setNotifyControllerConnection(value)
  ));
  ipcMain.handle('bridge:setTouchpadMouseEnabled', (_event, value: boolean) => (
    service.setTouchpadMouseEnabled(value)
  ));
  ipcMain.handle('bridge:setNotifyLowBattery', (_event, value: boolean) => (
    service.setNotifyLowBattery(value)
  ));
  ipcMain.handle('bridge:testNotification', () => service.testNotification());
  ipcMain.handle('bridge:testHaptics', () => service.testHaptics());
  ipcMain.handle('bridge:testSpeaker', () => service.testSpeaker());
  ipcMain.handle('bridge:testClassicRumble', () => service.testClassicRumble());
  ipcMain.handle('bridge:testAdaptiveTriggers', async (_event, value?: TriggerTestMode, target?: TriggerTestTarget) => {
    await triggerProfileEngine.suspend();
    return service.testAdaptiveTriggers(value, target);
  });
  ipcMain.handle('bridge:resetAdaptiveTriggers', async () => {
    const result = await service.resetAdaptiveTriggers();
    await triggerProfileEngine.resume();
    return result;
  });
  ipcMain.handle('bridge:restoreDefaults', async () => {
    const snapshot = await service.restoreDefaults();
    applySnapshotWindowScale(snapshot);
    applyLaunchAtStartup(snapshot.settings.launchAtStartupEnabled);
    return snapshot;
  });
  ipcMain.handle('bridge:setButtonRemap', (_event, buttonId: RemapButtonId, targetId: RemapButtonId) => (
    service.setButtonRemap(buttonId, targetId)
  ));
  ipcMain.handle('bridge:selectButtonRemappingProfile', (_event, profileId: string) => (
    service.selectButtonRemappingProfile(profileId)
  ));
  ipcMain.handle('bridge:saveButtonRemappingProfile', (_event, name?: string) => (
    service.saveButtonRemappingProfile(name)
  ));
  ipcMain.handle('bridge:updateButtonRemappingProfile', (_event, profileId: string) => (
    service.updateButtonRemappingProfile(profileId)
  ));
  ipcMain.handle('bridge:renameButtonRemappingProfile', (_event, profileId: string, name: string) => (
    service.renameButtonRemappingProfile(profileId, name)
  ));
  ipcMain.handle('bridge:deleteButtonRemappingProfile', (_event, profileId: string) => (
    service.deleteButtonRemappingProfile(profileId)
  ));
  ipcMain.handle('bridge:restoreButtonRemappingDefaults', () => service.restoreButtonRemappingDefaults());
  ipcMain.handle('bridge:setChordConfiguration', (_event, functions: ChordFunction[], assignments: ChordAssignment[]) => (
    service.setChordConfiguration(functions, assignments)
  ));
  ipcMain.handle('bridge:setChordFunctions', (_event, functions: ChordFunction[]) => (
    service.setChordFunctions(functions)
  ));
  ipcMain.handle('bridge:setChordAssignments', (_event, assignments: ChordAssignment[]) => (
    service.setChordAssignments(assignments)
  ));
  ipcMain.handle('bridge:repairWindowsDeviceCache', () => service.repairWindowsDeviceCache());
  ipcMain.handle('bridge:getDiagnostics', () => service.getSnapshot().diagnostics);
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:toggleMaximize', () => {
    if (!mainWindow || !mainWindow.isMaximizable()) return;
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });
  ipcMain.handle('window:isMaximized', () => Boolean(mainWindow?.isMaximized()));
  ipcMain.handle('window:hide', () => mainWindow?.hide());
  ipcMain.handle('window:openExternal', (_event, url: string) => {
    if (!isAllowedExternalUrl(url)) {
      return;
    }
    void shell.openExternal(url);
  });
}

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) {
    return;
  }

  app.setName(APP_NAME);
  ensureWindowsNotificationShortcut();
  Menu.setApplicationMenu(null);
  const settingsStore = new SettingsStore(app.getPath('userData'));
  applyLaunchAtStartup(settingsStore.get().launchAtStartupEnabled);
  bridgeService = new BridgeService(settingsStore);
  const triggerProfileStore = new TriggerProfileStore(
    path.join(app.getPath('userData'), 'trigger-profiles')
  );
  triggerProfileEngine = new TriggerProfileEngine({
    sink: bridgeService,
    store: triggerProfileStore,
    watcher: new GameWatcher({}),
    reader: new EvdevInputReader()
  });
  triggerProfileEngine.refreshProfiles();
  // Restore the engine's persisted enabled/pin state; before this, every
  // launch silently started with the game watcher off while the UI still
  // looked like auto mode.
  const persistedEngineState = triggerProfileStore.loadEngineState();
  if (persistedEngineState.pinnedProfileId) {
    triggerProfileEngine.pinProfile(persistedEngineState.pinnedProfileId);
  }
  if (persistedEngineState.enabled) {
    void triggerProfileEngine.setEnabled(true);
  }
  triggerProfileEngine.on('status', (status: EngineStatus) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('bridge:triggerProfileEngineStatus', status);
    }
  });
  registerIpc(bridgeService, triggerProfileStore, triggerProfileEngine);

  mainWindow = createWindow(settingsStore.get().uiScalePercent);
  mainWindow.on('maximize', sendWindowMaximizedState);
  mainWindow.on('unmaximize', sendWindowMaximizedState);
  mainWindow.on('show', () => scheduleMainWindowScaleRestore(false));
  mainWindow.on('restore', () => scheduleMainWindowScaleRestore(false));
  mainWindow.on('focus', () => scheduleMainWindowScaleRestore(false));
  mainWindow.once('ready-to-show', () => {
    if (!shouldStartInTray()) {
      showMainWindow();
    }
  });
  powerMonitor.on('resume', () => scheduleMainWindowScaleRestore(true));
  powerMonitor.on('unlock-screen', () => scheduleMainWindowScaleRestore(true));
  screen.on('display-metrics-changed', () => scheduleMainWindowScaleRestore(true));

  trayDefaultIcon = await createTrayIcon();
  tray = new Tray(trayDefaultIcon);
  updateTrayPresentation(bridgeService.getSnapshot());
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `Open ${APP_NAME}`, click: showMainWindow },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]));
  tray.on('click', showMainWindow);

  bridgeService.on('snapshot', (snapshot) => {
    updateTrayPresentation(snapshot);
    sendToMainWindow('bridge:snapshot', snapshot);
  });
  bridgeService.on('toast', (toast) => {
    showBridgeNotification(toast);
  });
  bridgeService.start();
});

app.on('second-instance', (_event, argv) => {
  if (!shouldStartInTray(argv)) {
    showMainWindow();
  }
});

app.on('window-all-closed', () => {
  // Keep the companion alive as a tray app after the popover is closed.
});

app.on('before-quit', (event) => {
  if (shutdownComplete) {
    return;
  }
  event.preventDefault();
  isQuitting = true;
  const service = bridgeService;
  const engine = triggerProfileEngine;
  bridgeService = null;
  triggerProfileEngine = null;
  void (async () => {
    try {
      await engine?.setEnabled(false);
      await service?.stop();
    } finally {
      shutdownComplete = true;
      app.quit();
    }
  })();
});
