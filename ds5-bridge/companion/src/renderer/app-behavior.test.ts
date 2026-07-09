import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  parseProcessNamesInput,
  mergeDetectedProcessName,
  formatEngineStatusLine,
  slugifyTriggerProfileName,
  uniqueTriggerProfileId,
  mergeTriggerProfiles,
  isProvisionalTriggerProfileId,
  mirrorTriggerSlotBase,
  filterTriggerProfiles,
  filterSelectOptionsByLabel,
  pickTriggerStripChips
} from './App';
import type { TriggerProfile } from '../shared/trigger-profiles';

const appSource = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'App.tsx'), 'utf8');
const stylesSource = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'styles.css'), 'utf8');

function extractFunction(name: string): string {
  const start = appSource.indexOf(`function ${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const nextFunction = appSource.indexOf('\n  function ', start + 1);
  return appSource.slice(start, nextFunction === -1 ? undefined : nextFunction);
}

describe('renderer behavior guards', () => {
  it('does not expose retired host encoder controls', () => {
    expect(appSource).not.toContain('toggleHost' + 'EncodedAudioEnabled');
    expect(appSource).not.toContain('setHost' + 'EncodedAudioEnabled');
    expect(appSource).not.toContain('Disable Host ' + 'Encoding?');
    expect(appSource).not.toContain('Enable host ' + 'encoded audio');
    expect(appSource).toContain('Bridge Local');
  });

  it('requires explicit confirmation and a disconnected controller before emergency device repair', () => {
    const openFunction = extractFunction('openDeviceCleanupConfirm');
    const runFunction = extractFunction('runWindowsDeviceCleanup');

    expect(appSource).toContain('IconTool');
    expect(openFunction).toContain('setDeviceCleanupConfirmVisible(true)');
    expect(runFunction).toContain('controllerConnected');
    expect(runFunction).toContain('repairWindowsDeviceCache');
    expect(appSource).toContain('Emergency Device Repair');
    expect(appSource).toContain('Only run this if you are running into persistent odd controller');
    expect(appSource).toContain('Disconnect the controller from the bridge');
    expect(appSource).toContain('Controller identity based profiles');
    expect(appSource).toContain('paired directly to Windows over Bluetooth may need to be paired again');
  });

  it('does not block haptic testing just because audio is active', () => {
    const start = appSource.indexOf('const testHapticsUnavailable =');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = appSource.indexOf('const hapticsStatusReady =', start);
    const unavailableSource = appSource.slice(start, end);

    expect(unavailableSource).not.toContain('gameStreamActive');
    expect(unavailableSource).not.toContain('audioRecent');
    expect(unavailableSource).not.toContain('host' + 'AudioActive');
    expect(unavailableSource).not.toContain('streamActive');
  });

  it('does not block rumble testing while game output is active', () => {
    const start = appSource.indexOf('const testRumbleUnavailable =');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = appSource.indexOf('const hapticsStatusReady =', start);
    const unavailableSource = appSource.slice(start, end);

    expect(unavailableSource).not.toContain('gameStreamActive');
    expect(unavailableSource).not.toContain('audioRecent');
    expect(unavailableSource).not.toContain('host' + 'AudioActive');
    expect(unavailableSource).not.toContain('streamActive');
  });

  it('keeps haptic test and cooldown labels as real test state', () => {
    const start = appSource.indexOf('<button className="primary-action" type="button" disabled={activeFeedbackTestUnavailable}');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = appSource.indexOf('</button>', start);
    const buttonSource = appSource.slice(start, end);

    expect(buttonSource).not.toContain('Audio Active');
    expect(buttonSource).toContain('testLocked');
    expect(buttonSource).toContain('snapshot.status?.testHapticsCooldown');
  });

  it('does not show generic command-pending copy in renderer status badges', () => {
    expect(appSource).not.toContain('Command Pending');
  });

  it('labels the HD haptics control as "HD Haptics" to distinguish it from rumble', () => {
    const selectorStart = appSource.indexOf('aria-label="Haptics control mode"');
    expect(selectorStart).toBeGreaterThanOrEqual(0);
    const selectorEnd = appSource.indexOf('</div>', selectorStart);
    const selectorSource = appSource.slice(selectorStart, selectorEnd);
    // The HD-vs-rumble selector should read "HD Haptics" | "Rumble".
    expect(selectorSource).toContain('HD Haptics');
    expect(selectorSource).toContain('Rumble');

    // The card heading reflects HD Haptics (not the bare word "Haptics") when
    // not in audio or rumble mode.
    const heading = appSource.slice(appSource.indexOf('<h2>{audioHapticsOpen'), appSource.indexOf('</h2>', appSource.indexOf('<h2>{audioHapticsOpen')));
    expect(heading).toContain("'HD Haptics'");
  });

  it('audio haptics header switch enables and disables the feature, not just the panel view', () => {
    // The labeled "Audio Haptics" switch must control the feature (audioReactiveHapticsEnabled),
    // reflecting its real enabled state, and open/close the panel to match.
    const start = appSource.indexOf('audio-haptics-switch');
    expect(start).toBeGreaterThanOrEqual(0);
    const buttonStart = appSource.lastIndexOf('<button', start);
    const buttonEnd = appSource.indexOf('</button>', start);
    const switchSource = appSource.slice(buttonStart, buttonEnd);

    // Reflects the feature state, not the panel-open state.
    expect(switchSource).toContain('aria-checked={audioReactiveHapticsEnabled}');
    expect(switchSource).toContain('onClick={toggleAudioHapticsFeature}');
    // The old view-only wiring must be gone from this switch.
    expect(switchSource).not.toContain('setAudioHapticsOpen((open) => !open)');

    // The handler flips the feature on/off and syncs the panel visibility.
    const handler = extractFunction('toggleAudioHapticsFeature');
    expect(handler).toContain('commitAudioReactiveHapticsConfig');
    expect(handler).toContain('!audioReactiveHapticsEnabled');
    expect(handler).toContain('setAudioHapticsOpen');
  });

  it('dims primary feature toggles when the controller is unavailable', () => {
    expect(appSource).toContain('const controllerControlsAvailable = connected && controllerConnected;');
    expect(appSource).toContain("controllerControlsAvailable ? '' : 'controller-unavailable'");
    expect(appSource).toContain('disabled={!controllerControlsAvailable || pendingAction !== null}');
    expect(appSource).toContain('!controllerControlsAvailable || !speakerVolumeSupported || pendingAction !== null');
    expect(appSource).toContain('!controllerControlsAvailable || !adaptiveTriggersSupported || pendingAction !== null');
    expect(appSource).toContain('!controllerControlsAvailable || !lightbarSupported || pendingAction !== null');
  });

  it('uses the device container border instead of a compact status dot', () => {
    expect(appSource).toContain('const sidebarDeviceTone =');
    expect(appSource).toContain('className={`hero-main device-status-${sidebarDeviceTone}`}');
    const start = appSource.indexOf('<div className="bridge-state compact-device-status">');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = appSource.indexOf('</div>', start);
    const compactStatusSource = appSource.slice(start, end);

    expect(compactStatusSource).not.toContain('className={`dot');
  });

  it('exposes the firmware-gated audio buffer length control', () => {
    expect(appSource).toContain('const AUDIO_BUFFER_LENGTH_MIN = 16;');
    expect(appSource).toContain('const AUDIO_BUFFER_LENGTH_MAX = 128;');
    expect(appSource).toContain('audioBufferLengthControlSupported');
    expect(appSource).toContain('firmwareFlags.hapticsBufferLengthControl');
    expect(appSource).toContain('window.bridge.setHapticsBufferLength(snappedValue)');
    expect(appSource).toContain('Audio Buffer Length');
    expect(appSource).toContain('audio-buffer-readout');
    expect(appSource).toContain("className={`audio-buffer-control framed-slider ${audioBufferLengthControlDisabled ? 'disabled' : ''}`}");
    expect(appSource).toContain('className="audio-buffer-title"');
    expect(appSource).toContain('aria-valuetext={`${audioBufferLengthValue}, ${audioBufferDelayLabel(audioBufferLengthValue)}, ${audioBufferZoneLabel(audioBufferLengthValue)}`}');
    const micPresetIndex = appSource.indexOf('{MIC_VOLUME_PRESETS.map(([label, value]) => (');
    const speakerPresetIndex = appSource.indexOf('{SPEAKER_VOLUME_PRESETS.map(([label, value]) => (');
    const bufferControlIndex = appSource.indexOf('className={`audio-buffer-control framed-slider');
    const testCardIndex = appSource.indexOf('<section className="feature-card test-card">', speakerPresetIndex);
    const bufferControlSource = appSource.slice(bufferControlIndex, testCardIndex);
    expect(micPresetIndex).toBeGreaterThanOrEqual(0);
    expect(speakerPresetIndex).toBeGreaterThan(micPresetIndex);
    expect(bufferControlIndex).toBeGreaterThan(speakerPresetIndex);
    expect(bufferControlIndex).toBeLessThan(testCardIndex);
    expect(bufferControlSource).not.toContain('showQuestionMark={true}');
    expect(appSource.slice(micPresetIndex, speakerPresetIndex)).not.toContain('audio-buffer-control');
    expect(appSource).not.toContain('Math.min(255, Math.round(length))');
  });

  it('does not expose Pico firmware maintenance actions (Linux port has no Pico)', () => {
    expect(appSource).not.toContain('function mountPicoBootloader()');
    expect(appSource).not.toContain('function flashPicoFirmware()');
    expect(appSource).not.toContain('function nukePicoFlash()');
    expect(appSource).not.toContain('pico-firmware-dual-action');
    expect(appSource).not.toContain('picoFirmwareMessage');
  });

  it('exposes the battery percentage tray icon preference in Bridge Settings', () => {
    expect(appSource).toContain('Battery Tray Icon');
    expect(appSource).toContain('Show controller battery percentage in the tray');
    expect(appSource).toContain('snapshot.settings.showBatteryPercentTrayIcon');
    expect(appSource).toContain('window.bridge.setShowBatteryPercentTrayIcon(!snapshot.settings.showBatteryPercentTrayIcon)');
  });

  it('keeps the haptics test button actionable instead of relabeling it as game-active', () => {
    const start = appSource.indexOf('<button className="primary-action" type="button" disabled={activeFeedbackTestUnavailable}');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = appSource.indexOf('</button>', start);
    const buttonSource = appSource.slice(start, end);
    const hapticsStart = buttonSource.indexOf(': connected && testLocked');
    expect(hapticsStart).toBeGreaterThanOrEqual(0);
    const hapticsButtonSource = buttonSource.slice(hapticsStart);

    expect(hapticsButtonSource).not.toContain('Game Active');
    expect(hapticsButtonSource).toContain('testLocked');
    expect(hapticsButtonSource).toContain('Test Haptics');
  });

  it('keeps the rumble test button actionable instead of relabeling it as game-active', () => {
    const start = appSource.indexOf('<button className="primary-action" type="button" disabled={activeFeedbackTestUnavailable}');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = appSource.indexOf('</button>', start);
    const buttonSource = appSource.slice(start, end);
    const classicStart = buttonSource.indexOf('{showClassicRumbleControl');
    expect(classicStart).toBeGreaterThanOrEqual(0);
    const hapticsStart = buttonSource.indexOf(': connected && testLocked', classicStart);
    expect(hapticsStart).toBeGreaterThanOrEqual(0);
    const classicButtonSource = buttonSource.slice(classicStart, hapticsStart);

    expect(classicButtonSource).not.toContain('Game Active');
    expect(classicButtonSource).toContain('testLocked');
    expect(classicButtonSource).toContain('Test Rumble');
  });

  it('does not let initial status overwrite a newer live snapshot', () => {
    const start = appSource.indexOf('let cancelled = false;');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = appSource.indexOf('return () => {', start);
    const startupSubscriptionSource = appSource.slice(start, end);

    expect(startupSubscriptionSource).toContain('let receivedLiveSnapshot = false;');
    expect(startupSubscriptionSource).toContain('if (!cancelled && !receivedLiveSnapshot)');
    expect(startupSubscriptionSource).toContain('receivedLiveSnapshot = true;');
  });

  it('does not snap snapshot values back to coarse slider notches', () => {
    const start = appSource.indexOf('function displayHapticsValue');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = appSource.indexOf('function sliderTickClass', start);
    expect(end).toBeGreaterThan(start);
    const displaySource = appSource.slice(start, end);

    expect(displaySource).not.toContain('snapHapticsValue');
    expect(displaySource).not.toContain('snapLightbarBrightness');
    expect(displaySource).not.toContain('snapTriggerEffectIntensity');
    expect(displaySource).toContain('snapshot.settings.hapticsGainPercent');
    expect(displaySource).toContain('snapshot.settings.lightbarBrightnessPercent');
    expect(displaySource).toContain('snapshot.settings.triggerEffectIntensityPercent');
  });

  it('shows mute as a chord starter when chord mode or keyboard chord starter is active', () => {
    expect(appSource).toContain("mute: { id: CHORD_MUTE_STARTER_ID, label: 'Mute Button', Icon: MicOff }");
    expect(appSource).toContain('[CHORD_STARTERS.mute.label, CHORD_MUTE_STARTER_ID]');
    expect(appSource).toContain('chords-starter-icon-glyph');
    expect(appSource).toContain('<Icon size={18} />');
    expect(appSource).toContain('function chordStarterOptionsFor(currentStarter?: ChordStarterId)');
    expect(appSource).toContain("currentStarter === CHORD_MUTE_STARTER_ID");
    expect(appSource).toContain('mute-starter-inactive');
    expect(appSource).toContain('muteButtonChordStarterActive');
    expect(appSource).toContain("snapshot?.settings.muteButtonMode === 'chord'");
    expect(appSource).toContain("snapshot?.settings.muteButtonMode === 'keyboard'");
    expect(appSource).toContain('snapshot.settings.muteKeyboardChordStarterEnabled');
    expect(appSource).toContain("assignment.starter === CHORD_MUTE_STARTER_ID && !muteButtonChordStarterActive");
    expect(appSource).toContain('Duplicate, inactive, or shortcut-shadowed chord bindings');
    expect(stylesSource).toContain('.chords-assignment-row.mute-starter-inactive .remap-glyph-option img');
    expect(stylesSource).toContain('opacity: var(--disabled-opacity);');
    expect(appSource).toContain("starter === CHORD_MUTE_STARTER_ID");
    expect(appSource).toContain('Chord Starter');
    expect(appSource).toContain("window.bridge.setMuteButtonAction(mode, keyUsage, keyModifiers, keyBehavior, keyChordStarterEnabled)");
    expect(appSource).toContain('Pair PS, LFN, RFN, or Mute with a button.');
  });

  it('offers Print Screen and numpad numerals as chord keyboard shortcut keys', () => {
    const optionsStart = appSource.indexOf('const CHORD_KEYBOARD_KEY_OPTIONS');
    expect(optionsStart).toBeGreaterThanOrEqual(0);
    const optionsEnd = appSource.indexOf('const CHORD_KEYBOARD_KEY_MAX_LABEL_LENGTH', optionsStart);
    expect(optionsEnd).toBeGreaterThan(optionsStart);
    const optionsSource = appSource.slice(optionsStart, optionsEnd);

    expect(optionsSource).toContain("['Print Screen', 'Print Screen']");
    expect(optionsSource).toContain('`Numpad ${digit}`');
    expect(optionsSource).toContain('`Numpad${digit}`');

    const normalizeSource = extractFunction('normalizeChordKeyLabel');
    expect(normalizeSource).toContain("case 'print screen':");
    expect(normalizeSource).toContain("case 'printscreen':");
    expect(normalizeSource).toContain("case 'prtsc':");
    expect(normalizeSource).toContain("case 'prtscn':");
    expect(normalizeSource).toContain("return 'Print Screen';");
  });
});

describe('trigger profiles panel helpers', () => {
  it('parses comma-separated process names, trimming and dropping empties', () => {
    expect(parseProcessNamesInput(' Game.exe, other , ,')).toEqual(['game.exe', 'other']);
  });

  it('merges a detected process candidate into the process names input, deduping and lowercasing', () => {
    expect(mergeDetectedProcessName('', 'Game.exe')).toBe('game.exe');
    expect(mergeDetectedProcessName('game.exe', 'other.exe')).toBe('game.exe, other.exe');
    expect(mergeDetectedProcessName('game.exe, other.exe', 'GAME.EXE')).toBe('game.exe, other.exe');
    expect(mergeDetectedProcessName(' Game.exe , ', 'other.exe')).toBe('game.exe, other.exe');
  });

  it('formats the engine status line', () => {
    expect(formatEngineStatusLine(
      { enabled: true, suspended: false, activeProfileId: 'shooter', matchedBy: 'process', matchedName: 'game.exe' },
      'Generic Shooter'
    )).toBe('Active: Generic Shooter (matched: game.exe)');
    expect(formatEngineStatusLine(
      { enabled: true, suspended: false, activeProfileId: 'shooter', matchedBy: 'pin', matchedName: null },
      'Generic Shooter'
    )).toBe('Active: Generic Shooter (pinned)');
    expect(formatEngineStatusLine(
      { enabled: true, suspended: true, activeProfileId: 'default', matchedBy: 'default', matchedName: null },
      'Default'
    )).toBe('Active: Default (suspended)');
  });
});

function makeTriggerProfile(id: string, name = id): TriggerProfile {
  return {
    version: 1,
    id,
    name,
    match: { processNames: [] },
    triggers: {
      l2: { base: null, modifiers: [] },
      r2: { base: null, modifiers: [] }
    },
    updatedAtMs: 0
  } as unknown as TriggerProfile;
}

describe('slugifyTriggerProfileName', () => {
  it('lowercases, replaces non-alphanumeric runs with dashes, and trims edge dashes', () => {
    expect(slugifyTriggerProfileName('My Cool Profile!')).toBe('my-cool-profile');
    expect(slugifyTriggerProfileName('  Leading/Trailing  ')).toBe('leading-trailing');
    expect(slugifyTriggerProfileName('___')).toBe('');
  });
});

describe('uniqueTriggerProfileId', () => {
  it('returns the plain slug when it is not taken', () => {
    expect(uniqueTriggerProfileId('Racing Setup', ['default', 'shooter'])).toBe('racing-setup');
  });

  it('appends -2, -3, ... on collision with existing ids', () => {
    expect(uniqueTriggerProfileId('Shooter', ['shooter'])).toBe('shooter-2');
    expect(uniqueTriggerProfileId('Shooter', ['shooter', 'shooter-2'])).toBe('shooter-3');
  });

  it('treats "default" as always taken', () => {
    expect(uniqueTriggerProfileId('Default', [])).toBe('default-2');
  });

  it('treats an empty slug as taken and still produces a suffixed id', () => {
    expect(uniqueTriggerProfileId('!!!', [])).toBe('-2');
  });
});

describe('isProvisionalTriggerProfileId', () => {
  it('recognizes draft-prefixed local ids and rejects saved ids', () => {
    expect(isProvisionalTriggerProfileId('draft-abc123-xyz')).toBe(true);
    expect(isProvisionalTriggerProfileId('shooter')).toBe(false);
    expect(isProvisionalTriggerProfileId('default')).toBe(false);
  });
});

describe('mergeTriggerProfiles', () => {
  it('prefers backend profiles and keeps unsaved local drafts whose ids are absent from the backend', () => {
    const local = [makeTriggerProfile('default'), makeTriggerProfile('draft-1', 'Unsaved Draft')];
    const backend = [makeTriggerProfile('default'), makeTriggerProfile('shooter')];
    const merged = mergeTriggerProfiles(local, backend);
    expect(merged.map((p) => p.id)).toEqual(['default', 'shooter', 'draft-1']);
  });

  it('excludes a given id from the merge even if it is still present locally (e.g. just deleted)', () => {
    const local = [makeTriggerProfile('default'), makeTriggerProfile('shooter')];
    const backend = [makeTriggerProfile('default')];
    const merged = mergeTriggerProfiles(local, backend, ['shooter']);
    expect(merged.map((p) => p.id)).toEqual(['default']);
  });

  it('drops a stale provisional id once it has been saved under its new slug id', () => {
    const local = [makeTriggerProfile('default'), makeTriggerProfile('draft-1', 'Racing')];
    const backend = [makeTriggerProfile('default'), makeTriggerProfile('racing', 'Racing')];
    const merged = mergeTriggerProfiles(local, backend, ['draft-1']);
    expect(merged.map((p) => p.id)).toEqual(['default', 'racing']);
  });
});

describe('mirrorTriggerSlotBase', () => {
  it('copies the source slot base onto the other slot and leaves the source untouched', () => {
    const triggers = {
      l2: { base: { mode: 'weapon', startPercent: 20, wallPercent: 60, forcePercent: 80 }, modifiers: [] },
      r2: { base: null, modifiers: [{ id: 'm1' }] }
    } as unknown as TriggerProfile['triggers'];
    const next = mirrorTriggerSlotBase(triggers, 'l2');
    expect(next.r2.base).toEqual(triggers.l2.base);
    // deep clone, not a shared reference
    expect(next.r2.base).not.toBe(triggers.l2.base);
    // r2 modifiers are preserved; l2 (source) is unchanged
    expect(next.r2.modifiers).toBe(triggers.r2.modifiers);
    expect(next.l2).toBe(triggers.l2);
  });

  it('mirrors a null base (no effect) from source to the other slot', () => {
    const triggers = {
      l2: { base: { mode: 'weapon', startPercent: 10, wallPercent: 40, forcePercent: 70 }, modifiers: [] },
      r2: { base: null, modifiers: [] }
    } as unknown as TriggerProfile['triggers'];
    const next = mirrorTriggerSlotBase(triggers, 'r2');
    expect(next.l2.base).toBeNull();
  });
});

describe('filterTriggerProfiles', () => {
  it('returns a copy of all profiles when the query is blank', () => {
    const profiles = [makeTriggerProfile('default'), makeTriggerProfile('shooter')];
    const result = filterTriggerProfiles(profiles, '   ');
    expect(result.map((p) => p.id)).toEqual(['default', 'shooter']);
    expect(result).not.toBe(profiles);
  });

  it('matches on profile name case-insensitively', () => {
    const profiles = [makeTriggerProfile('shooter', 'Shooter'), makeTriggerProfile('racing', 'Racing Setup')];
    expect(filterTriggerProfiles(profiles, 'race').map((p) => p.id)).toEqual([]);
    expect(filterTriggerProfiles(profiles, 'raci').map((p) => p.id)).toEqual(['racing']);
    expect(filterTriggerProfiles(profiles, 'SHOOT').map((p) => p.id)).toEqual(['shooter']);
  });

  it('matches on a process name substring', () => {
    const profiles = [makeTriggerProfile('shooter', 'Shooter')];
    profiles[0].match.processNames = ['CoolGame.exe'];
    expect(filterTriggerProfiles(profiles, 'coolgame').map((p) => p.id)).toEqual(['shooter']);
    expect(filterTriggerProfiles(profiles, 'nomatch')).toEqual([]);
  });
});

function makeStripProfile(id: string, updatedAtMs: number, name = id): TriggerProfile {
  const profile = makeTriggerProfile(id, name);
  (profile as { updatedAtMs: number }).updatedAtMs = updatedAtMs;
  return profile;
}

describe('filterSelectOptionsByLabel', () => {
  const options: Array<[string, string]> = [
    ['More profiles', ''],
    ['Racing Setup', 'racing'],
    ['Shooter', 'shooter']
  ];

  it('returns a copy of all options when the query is blank', () => {
    const result = filterSelectOptionsByLabel(options, '   ');
    expect(result).toEqual(options);
    expect(result).not.toBe(options);
  });

  it('matches labels by case-insensitive substring', () => {
    expect(filterSelectOptionsByLabel(options, 'SHOOT')).toEqual([['Shooter', 'shooter']]);
    expect(filterSelectOptionsByLabel(options, 'cing set')).toEqual([['Racing Setup', 'racing']]);
    expect(filterSelectOptionsByLabel(options, 'nomatch')).toEqual([]);
  });
});

describe('pickTriggerStripChips', () => {
  it('shows Default plus the most-recently-updated non-default when nothing is selected', () => {
    const profiles = [
      makeStripProfile('default', 0),
      makeStripProfile('a', 10),
      makeStripProfile('b', 30),
      makeStripProfile('c', 20)
    ];
    const { chips, overflow } = pickTriggerStripChips(profiles, null);
    expect(chips.map((p) => p.id)).toEqual(['default', 'b']);
    expect(overflow.map((p) => p.id)).toEqual(['a', 'c']);
  });

  it('always keeps Default first and uses the selected non-default as the second chip', () => {
    const profiles = [
      makeStripProfile('default', 0),
      makeStripProfile('a', 10),
      makeStripProfile('b', 30),
      makeStripProfile('c', 20)
    ];
    const { chips, overflow } = pickTriggerStripChips(profiles, 'a');
    expect(chips.map((p) => p.id)).toEqual(['default', 'a']);
    expect(overflow.map((p) => p.id)).toEqual(['b', 'c']);
  });

  it('falls back to most-recent non-default when Default itself is selected', () => {
    const profiles = [
      makeStripProfile('default', 0),
      makeStripProfile('a', 40),
      makeStripProfile('b', 5)
    ];
    const { chips } = pickTriggerStripChips(profiles, 'default');
    expect(chips.map((p) => p.id)).toEqual(['default', 'a']);
  });

  it('returns just Default (no overflow) when it is the only profile', () => {
    const profiles = [makeStripProfile('default', 0)];
    const { chips, overflow } = pickTriggerStripChips(profiles, null);
    expect(chips.map((p) => p.id)).toEqual(['default']);
    expect(overflow).toEqual([]);
  });

  it('never returns more than two chips regardless of library size', () => {
    const profiles = [makeStripProfile('default', 0)];
    for (let i = 0; i < 20; i += 1) profiles.push(makeStripProfile(`p${i}`, i));
    const { chips, overflow } = pickTriggerStripChips(profiles, 'p3');
    expect(chips.map((p) => p.id)).toEqual(['default', 'p3']);
    expect(chips).toHaveLength(2);
    expect(overflow).toHaveLength(19);
    expect(overflow.some((p) => p.id === 'p3')).toBe(false);
  });
});
