import { contextBridge, ipcRenderer } from 'electron';
import type {
  AdaptiveTriggerPreviewEffect,
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
} from './shared/protocol';
import type {
  AudioHapticsSession,
  BridgeDiagnostics,
  BridgeSnapshot,
  PicoFirmwareActionResult,
  UiThemePreset,
  WindowsDeviceCleanupResult
} from './shared/types';
import type { EngineStatus, TriggerProfile, TriggerSlotConfig } from './shared/trigger-profiles';
import type { GameSettingsStatus } from './main/game-settings-coordinator';
import type { GameArtworkEntry, GameArtworkSearchResult } from './main/game-artwork';
import type { LibraryCatalog, LibraryEntry } from './main/profile-library';
import type { ImportResult } from './main/trigger-profile-store';
import type { GameProcessCandidate } from './main/game-watcher';
import type { SetupProgressEvent } from './main/setup-service';
import type { UpdateState } from './main/update-service';

// The preload runs sandboxed: only `require('electron')` is available, so the
// setup channel names are inlined rather than imported from ./main/setup-ipc.
// setup-ipc.test.ts pins these literals to SETUP_CHANNELS so they cannot drift.
const SETUP_CHANNELS = {
  getPlan: 'setup:get-plan',
  install: 'setup:install',
  progress: 'setup:progress',
  skip: 'setup:skip',
  finish: 'setup:finish',
  openLog: 'setup:open-log',
  copyDiagnostics: 'setup:copy-diagnostics',
  reopen: 'setup:reopen'
} as const;

const api = {
  getStatus: (): Promise<BridgeSnapshot> => ipcRenderer.invoke('bridge:getStatus'),
  listDevices: () => ipcRenderer.invoke('bridge:listDevices'),
  listAudioHapticsSessions: (): Promise<AudioHapticsSession[]> => (
    ipcRenderer.invoke('bridge:listAudioHapticsSessions')
  ),
  applyPreset: (value: BridgePresetId): Promise<BridgeSnapshot> => ipcRenderer.invoke('bridge:applyPreset', value),
  selectControllerProfile: (profileId: string): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:selectControllerProfile', profileId)
  ),
  saveControllerProfile: (name?: string): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:saveControllerProfile', name)
  ),
  updateControllerProfile: (profileId: string): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:updateControllerProfile', profileId)
  ),
  renameControllerProfile: (profileId: string, name: string): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:renameControllerProfile', profileId, name)
  ),
  deleteControllerProfile: (profileId: string): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:deleteControllerProfile', profileId)
  ),
  setHapticsGain: (value: number): Promise<BridgeSnapshot> => ipcRenderer.invoke('bridge:setHapticsGain', value),
  setHapticsEnabled: (value: boolean): Promise<BridgeSnapshot> => ipcRenderer.invoke('bridge:setHapticsEnabled', value),
  setFeedbackBoostEnabled: (value: boolean): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:setFeedbackBoostEnabled', value)
  ),
  setHapticsBufferLength: (value: number): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:setHapticsBufferLength', value)
  ),
  setClassicRumbleGain: (value: number): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:setClassicRumbleGain', value)
  ),
  setClassicRumbleEnabled: (value: boolean): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:setClassicRumbleEnabled', value)
  ),
  setClassicRumbleV1Enabled: (value: boolean): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:setClassicRumbleV1Enabled', value)
  ),
  setTriggerEffectIntensity: (value: number): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:setTriggerEffectIntensity', value)
  ),
  setTriggerTestMode: (value: TriggerTestMode): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:setTriggerTestMode', value)
  ),
  setAdaptiveTriggersEnabled: (value: boolean): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:setAdaptiveTriggersEnabled', value)
  ),
  setSpeakerVolume: (value: number): Promise<BridgeSnapshot> => ipcRenderer.invoke('bridge:setSpeakerVolume', value),
  setSpeakerGainLevel: (value: number): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:setSpeakerGainLevel', value)
  ),
  setSpeakerEnabled: (value: boolean): Promise<BridgeSnapshot> => ipcRenderer.invoke('bridge:setSpeakerEnabled', value),
  setMicVolume: (value: number): Promise<BridgeSnapshot> => ipcRenderer.invoke('bridge:setMicVolume', value),
  setMicMute: (value: boolean): Promise<BridgeSnapshot> => ipcRenderer.invoke('bridge:setMicMute', value),
  setAudioReactiveHapticsConfig: (value: Partial<AudioReactiveHapticsConfig>): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:setAudioReactiveHapticsConfig', value)
  ),
  setDuplexMicEnabled: (value: boolean): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:setDuplexMicEnabled', value)
  ),
  setLightbarColor: (color: string, brightness: number): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:setLightbarColor', color, brightness)
  ),
  setLightbarEnabled: (value: boolean): Promise<BridgeSnapshot> => ipcRenderer.invoke('bridge:setLightbarEnabled', value),
  setLightbarOverrideEnabled: (value: boolean): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:setLightbarOverrideEnabled', value)
  ),
  setMuteButtonAction: (
    mode: MuteButtonMode,
    usage: number,
    modifiers: number,
    behavior: MuteKeyboardBehavior,
    chordStarterEnabled?: boolean
  ): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:setMuteButtonAction', mode, usage, modifiers, behavior, chordStarterEnabled)
  ),
  setLedEnabled: (value: boolean): Promise<BridgeSnapshot> => ipcRenderer.invoke('bridge:setLedEnabled', value),
  setPlayerLedEnabled: (value: boolean): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:setPlayerLedEnabled', value)
  ),
  setIdleDisconnectEnabled: (value: boolean): Promise<BridgeSnapshot> => ipcRenderer.invoke('bridge:setIdleDisconnectEnabled', value),
  setIdleDisconnectTimeoutMinutes: (value: number): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:setIdleDisconnectTimeoutMinutes', value)
  ),
  setUsbSuspendDisconnectEnabled: (value: boolean): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:setUsbSuspendDisconnectEnabled', value)
  ),
  setSleepKeybindEnabled: (value: boolean): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:setSleepKeybindEnabled', value)
  ),
  setSpeakerVolumeShortcutEnabled: (value: boolean): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:setSpeakerVolumeShortcutEnabled', value)
  ),
  setControllerPowerSavingEnabled: (value: boolean): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:setControllerPowerSavingEnabled', value)
  ),
  setLaunchAtStartupEnabled: (value: boolean): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:setLaunchAtStartupEnabled', value)
  ),
  setShowBatteryPercentTrayIcon: (value: boolean): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:setShowBatteryPercentTrayIcon', value)
  ),
  setUiScalePercent: (value: number): Promise<BridgeSnapshot> => ipcRenderer.invoke('bridge:setUiScalePercent', value),
  setUiThemePreset: (value: UiThemePreset): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:setUiThemePreset', value)
  ),
  setPollingRateMode: (value: PollingRateMode): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:setPollingRateMode', value)
  ),
  setHostPersonaMode: (value: HostPersonaMode): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:setHostPersonaMode', value)
  ),
  sleepController: (): Promise<BridgeSnapshot> => ipcRenderer.invoke('bridge:sleepController'),
  mountPicoBootloader: (): Promise<PicoFirmwareActionResult> => (
    ipcRenderer.invoke('bridge:mountPicoBootloader')
  ),
  flashPicoFirmware: (): Promise<PicoFirmwareActionResult> => (
    ipcRenderer.invoke('bridge:flashPicoFirmware')
  ),
  nukePicoFlash: (): Promise<PicoFirmwareActionResult> => (
    ipcRenderer.invoke('bridge:nukePicoFlash')
  ),
  setNotifyControllerConnection: (value: boolean): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:setNotifyControllerConnection', value)
  ),
  setNotifyLowBattery: (value: boolean): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:setNotifyLowBattery', value)
  ),
  setTouchpadMouseEnabled: (value: boolean): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:setTouchpadMouseEnabled', value)
  ),
  testNotification: (): Promise<BridgeSnapshot> => ipcRenderer.invoke('bridge:testNotification'),
  testHaptics: (): Promise<BridgeSnapshot> => ipcRenderer.invoke('bridge:testHaptics'),
  testSpeaker: (): Promise<BridgeSnapshot> => ipcRenderer.invoke('bridge:testSpeaker'),
  testClassicRumble: (): Promise<BridgeSnapshot> => ipcRenderer.invoke('bridge:testClassicRumble'),
  testAdaptiveTriggers: (mode?: TriggerTestMode, target?: TriggerTestTarget): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:testAdaptiveTriggers', mode, target)
  ),
  previewAdaptiveTriggerEffect: (effect: AdaptiveTriggerPreviewEffect): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:previewAdaptiveTriggerEffect', effect)
  ),
  resetAdaptiveTriggers: (): Promise<BridgeSnapshot> => ipcRenderer.invoke('bridge:resetAdaptiveTriggers'),
  restoreDefaults: (): Promise<BridgeSnapshot> => ipcRenderer.invoke('bridge:restoreDefaults'),
  setButtonRemap: (buttonId: RemapButtonId, targetId: RemapButtonId): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:setButtonRemap', buttonId, targetId)
  ),
  selectButtonRemappingProfile: (profileId: string): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:selectButtonRemappingProfile', profileId)
  ),
  saveButtonRemappingProfile: (name?: string): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:saveButtonRemappingProfile', name)
  ),
  updateButtonRemappingProfile: (profileId: string): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:updateButtonRemappingProfile', profileId)
  ),
  renameButtonRemappingProfile: (profileId: string, name: string): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:renameButtonRemappingProfile', profileId, name)
  ),
  deleteButtonRemappingProfile: (profileId: string): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:deleteButtonRemappingProfile', profileId)
  ),
  restoreButtonRemappingDefaults: (): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:restoreButtonRemappingDefaults')
  ),
  setChordConfiguration: (functions: ChordFunction[], assignments: ChordAssignment[]): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:setChordConfiguration', functions, assignments)
  ),
  setChordFunctions: (functions: ChordFunction[]): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:setChordFunctions', functions)
  ),
  setChordAssignments: (assignments: ChordAssignment[]): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:setChordAssignments', assignments)
  ),
  repairWindowsDeviceCache: (): Promise<WindowsDeviceCleanupResult> => (
    ipcRenderer.invoke('bridge:repairWindowsDeviceCache')
  ),
  getDiagnostics: (): Promise<BridgeDiagnostics> => ipcRenderer.invoke('bridge:getDiagnostics'),
  minimizeWindow: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: (): Promise<void> => ipcRenderer.invoke('window:toggleMaximize'),
  isWindowMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
  hideWindow: (): Promise<void> => ipcRenderer.invoke('window:hide'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('window:openExternal', url),
  onWindowMaximizedChange: (callback: (maximized: boolean) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, maximized: boolean) => callback(maximized);
    ipcRenderer.on('window:maximizedChanged', listener);
    return () => ipcRenderer.removeListener('window:maximizedChanged', listener);
  },
  onSnapshot: (callback: (snapshot: BridgeSnapshot) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: BridgeSnapshot) => callback(snapshot);
    ipcRenderer.on('bridge:snapshot', listener);
    return () => ipcRenderer.removeListener('bridge:snapshot', listener);
  },
  listTriggerProfiles: (): Promise<TriggerProfile[]> => ipcRenderer.invoke('bridge:listTriggerProfiles'),
  saveTriggerProfile: (profile: TriggerProfile): Promise<TriggerProfile> => (
    ipcRenderer.invoke('bridge:saveTriggerProfile', profile)
  ),
  deleteTriggerProfile: (id: string): Promise<boolean> => ipcRenderer.invoke('bridge:deleteTriggerProfile', id),
  exportTriggerProfile: (id: string): Promise<{ saved: boolean; path?: string }> => (
    ipcRenderer.invoke('bridge:exportTriggerProfile', id)
  ),
  importTriggerProfiles: (): Promise<Array<{ file: string; ok: boolean; error?: string; name?: string }>> => (
    ipcRenderer.invoke('bridge:importTriggerProfiles')
  ),
  getProfileLibraryCatalog: (): Promise<LibraryCatalog> => (
    ipcRenderer.invoke('bridge:getProfileLibraryCatalog')
  ),
  installLibraryProfile: (entry: LibraryEntry): Promise<ImportResult> => (
    ipcRenderer.invoke('bridge:installLibraryProfile', entry)
  ),
  resetLibraryProfile: (id: string): Promise<ImportResult> => (
    ipcRenderer.invoke('bridge:resetLibraryProfile', id)
  ),
  setTriggerProfilesEnabled: (enabled: boolean): Promise<EngineStatus> => (
    ipcRenderer.invoke('bridge:setTriggerProfilesEnabled', enabled)
  ),
  pinTriggerProfile: (id: string | null): Promise<EngineStatus> => (
    ipcRenderer.invoke('bridge:pinTriggerProfile', id)
  ),
  getTriggerProfileEngineStatus: (): Promise<EngineStatus> => (
    ipcRenderer.invoke('bridge:getTriggerProfileEngineStatus')
  ),
  previewTriggerProfileDraft: (
    triggers: { l2: TriggerSlotConfig | null; r2: TriggerSlotConfig | null } | null
  ): Promise<EngineStatus> => (
    ipcRenderer.invoke('bridge:previewTriggerProfileDraft', triggers)
  ),
  listCandidateGameProcesses: (): Promise<GameProcessCandidate[]> => (
    ipcRenderer.invoke('bridge:listCandidateGameProcesses')
  ),
  onTriggerProfileEngineStatus: (listener: (status: EngineStatus) => void): (() => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, status: EngineStatus) => listener(status);
    ipcRenderer.on('bridge:triggerProfileEngineStatus', wrapped);
    return () => ipcRenderer.removeListener('bridge:triggerProfileEngineStatus', wrapped);
  },
  getGameSettingsStatus: (): Promise<GameSettingsStatus> => ipcRenderer.invoke('bridge:getGameSettingsStatus'),
  enterGameSettingsScope: (id: string): Promise<GameSettingsStatus> => (
    ipcRenderer.invoke('bridge:enterGameSettingsScope', id)
  ),
  exitGameSettingsScope: (): Promise<GameSettingsStatus> => ipcRenderer.invoke('bridge:exitGameSettingsScope'),
  onGameSettingsStatus: (listener: (status: GameSettingsStatus) => void): (() => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, status: GameSettingsStatus) => listener(status);
    ipcRenderer.on('bridge:gameSettingsStatus', wrapped);
    return () => ipcRenderer.removeListener('bridge:gameSettingsStatus', wrapped);
  },
  setSteamGridDbApiKey: (apiKey: string): Promise<BridgeSnapshot> => (
    ipcRenderer.invoke('bridge:setSteamGridDbApiKey', apiKey)
  ),
  getGameArtwork: (): Promise<Record<string, string>> => ipcRenderer.invoke('bridge:getGameArtwork'),
  searchGameArtwork: (term: string): Promise<
    { ok: true; results: GameArtworkSearchResult[] } | { ok: false; error: string }
  > => ipcRenderer.invoke('bridge:searchGameArtwork', term),
  applyGameArtwork: (id: string, game: { id: number; name: string } | null): Promise<
    { ok: true; entry: GameArtworkEntry } | { ok: false; error: string }
  > => ipcRenderer.invoke('bridge:applyGameArtwork', id, game),
  removeGameArtwork: (id: string): Promise<Record<string, string>> => (
    ipcRenderer.invoke('bridge:removeGameArtwork', id)
  )
};

contextBridge.exposeInMainWorld('bridge', api);

const setupApi = {
  getPlan: (): Promise<{ steps: string[] } | { unsupported: string }> =>
    ipcRenderer.invoke(SETUP_CHANNELS.getPlan),
  install: (): Promise<void> => ipcRenderer.invoke(SETUP_CHANNELS.install),
  onProgress: (cb: (e: SetupProgressEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: SetupProgressEvent) =>
      cb(payload);
    ipcRenderer.on(SETUP_CHANNELS.progress, listener);
    return () => ipcRenderer.removeListener(SETUP_CHANNELS.progress, listener);
  },
  skip: (): Promise<void> => ipcRenderer.invoke(SETUP_CHANNELS.skip),
  finish: (): Promise<void> => ipcRenderer.invoke(SETUP_CHANNELS.finish),
  openLog: (): Promise<void> => ipcRenderer.invoke(SETUP_CHANNELS.openLog),
  copyDiagnostics: (): Promise<void> => ipcRenderer.invoke(SETUP_CHANNELS.copyDiagnostics),
  reopen: (): Promise<void> => ipcRenderer.invoke(SETUP_CHANNELS.reopen),
};
contextBridge.exposeInMainWorld('setup', setupApi);

// Channel names are inlined string literals: ipc-contract.test.ts pairs preload
// invokes against main handlers by matching the source text, so a constants
// object would hide these channels from it.
const updateApi = {
  check: (): Promise<UpdateState> => ipcRenderer.invoke('update:check'),
  start: (): Promise<void> => ipcRenderer.invoke('update:start'),
  rebuild: (): Promise<void> => ipcRenderer.invoke('update:rebuild'),
  skip: (version: string): Promise<void> => ipcRenderer.invoke('update:skip', version),
  dismiss: (): Promise<void> => ipcRenderer.invoke('update:dismiss'),
  restart: (): Promise<void> => ipcRenderer.invoke('update:restart'),
  openReleasePage: (): Promise<void> => ipcRenderer.invoke('update:open-release-page'),
  onState: (cb: (state: UpdateState) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: UpdateState) => cb(payload);
    ipcRenderer.on('update:state', listener);
    return () => ipcRenderer.removeListener('update:state', listener);
  },
};
contextBridge.exposeInMainWorld('update', updateApi);

export type BridgeApi = typeof api;
export type SetupApi = typeof setupApi;
export type UpdateApi = typeof updateApi;
