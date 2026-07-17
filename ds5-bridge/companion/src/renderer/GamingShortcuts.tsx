import { useEffect, useMemo, useState } from 'react';
import controllerImage from '../../../assets/controllers/dualsense-edge-front.svg';
import type { ProviderCapabilities } from '../main/gaming-shortcuts/providers/detect-environment';
import {
  DEFAULT_GAMING_SHORTCUTS_SETTINGS,
  type GamingShortcutAction,
  type GamingShortcutsSettings
} from '../shared/gaming-shortcuts';
import type { ControllerButton } from '../shared/controller-input';
import type { BridgeSnapshot } from '../shared/types';
import type { TriggerProfile } from '../shared/trigger-profiles';

const BUTTONS: Array<{ value: Exclude<ControllerButton, 'ps'>; label: string }> = [
  { value: 'create', label: 'Create' }, { value: 'options', label: 'Options' }, { value: 'touchpad', label: 'Touchpad' }, { value: 'mute', label: 'Mute' },
  { value: 'cross', label: 'Cross' }, { value: 'circle', label: 'Circle' }, { value: 'square', label: 'Square' }, { value: 'triangle', label: 'Triangle' },
  { value: 'l1', label: 'L1' }, { value: 'r1', label: 'R1' }, { value: 'l2', label: 'L2' }, { value: 'r2', label: 'R2' },
  { value: 'l3', label: 'L3' }, { value: 'r3', label: 'R3' }, { value: 'dpad-up', label: 'D-pad Up' }, { value: 'dpad-down', label: 'D-pad Down' },
  { value: 'dpad-left', label: 'D-pad Left' }, { value: 'dpad-right', label: 'D-pad Right' }
];

type ActionKind = GamingShortcutAction['type'];
const ACTIONS: Array<{ value: ActionKind; label: string }> = [
  { value: 'none', label: 'No action' }, { value: 'passthrough', label: 'Pass through only' }, { value: 'open-opends5', label: 'Open or focus OpenDS5' },
  { value: 'launch-app', label: 'Open or focus an application' }, { value: 'focus-app', label: 'Focus application by ID' }, { value: 'screenshot', label: 'Take screenshot' },
  { value: 'recording-toggle', label: 'Toggle recording' }, { value: 'performance-hud-toggle', label: 'Toggle performance HUD' }, { value: 'volume', label: 'Volume' },
  { value: 'microphone-mute-toggle', label: 'Toggle microphone mute' }, { value: 'on-screen-keyboard', label: 'Open on-screen keyboard' }, { value: 'switch-application', label: 'Switch application' },
  { value: 'quit-active-game', label: 'Quit active game (confirm)' }, { value: 'custom-executable', label: 'Custom executable' }
];

const GESTURES = [
  ['singlePress', 'Press', 'Tap PS once'],
  ['doublePress', 'Double press', 'Tap PS twice'],
  ['longPress', 'Hold', 'Hold PS']
] as const;

function actionForKind(kind: ActionKind): GamingShortcutAction {
  switch (kind) {
    case 'volume': return { type: 'volume', direction: 'up' };
    case 'launch-app': return { type: 'launch-app', executable: '', args: [] };
    case 'focus-app': return { type: 'focus-app', appId: '' };
    case 'screenshot': return { type: 'screenshot', provider: 'auto' };
    case 'recording-toggle': return { type: 'recording-toggle', provider: 'auto' };
    case 'performance-hud-toggle': return { type: 'performance-hud-toggle', provider: 'auto' };
    case 'on-screen-keyboard': return { type: 'on-screen-keyboard', provider: 'auto' };
    case 'switch-application': return { type: 'switch-application', direction: 'next' };
    case 'quit-active-game': return { type: 'quit-active-game', confirmation: true };
    case 'custom-executable': return { type: 'custom-executable', executable: '', args: [] };
    default: return { type: kind } as GamingShortcutAction;
  }
}

function actionLabel(action: GamingShortcutAction): string {
  if (action.type === 'volume') return `Volume ${action.direction}`;
  if (action.type === 'switch-application') return `Switch ${action.direction}`;
  return ACTIONS.find((item) => item.value === action.type)?.label ?? 'No action';
}

function isProviderAction(action: GamingShortcutAction): action is Extract<GamingShortcutAction, { provider: string }> {
  return action.type === 'screenshot' || action.type === 'recording-toggle' || action.type === 'performance-hud-toggle' || action.type === 'on-screen-keyboard';
}

function ActionEditor({ action, onChange, capabilities }: { action: GamingShortcutAction; onChange: (next: GamingShortcutAction) => void; capabilities: ProviderCapabilities | null }) {
  const providerOptions = action.type === 'screenshot' ? capabilities?.screenshot ?? [] : action.type === 'recording-toggle' ? capabilities?.recording ?? [] : action.type === 'performance-hud-toggle' ? capabilities?.hud ?? [] : capabilities?.keyboard ?? [];
  const textInput = (label: string, value: string, change: (value: string) => void) => <input aria-label={label} value={value} onChange={(event) => change(event.target.value)} />;
  return <div className="gaming-shortcut-action-editor">
    <select aria-label="Shortcut action" value={action.type} onChange={(event) => onChange(actionForKind(event.target.value as ActionKind))}>{ACTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
    {action.type === 'volume' && <select aria-label="Volume direction" value={action.direction} onChange={(event) => onChange({ type: 'volume', direction: event.target.value as 'up' | 'down' | 'mute' })}><option value="up">Up</option><option value="down">Down</option><option value="mute">Mute</option></select>}
    {action.type === 'switch-application' && <select aria-label="Application direction" value={action.direction} onChange={(event) => onChange({ type: 'switch-application', direction: event.target.value as 'next' | 'previous' })}><option value="next">Next</option><option value="previous">Previous</option></select>}
    {isProviderAction(action) && <select aria-label="Provider" value={action.provider} onChange={(event) => onChange({ ...action, provider: event.target.value } as GamingShortcutAction)}><option value="auto">Automatic</option>{providerOptions.map((provider) => <option key={provider} value={provider}>{provider}</option>)}</select>}
    {(action.type === 'launch-app' || action.type === 'custom-executable') && <>{textInput('Executable', action.executable, (executable) => onChange({ ...action, executable }))}{textInput('Arguments', action.args.join(' '), (value) => onChange({ ...action, args: value.trim() ? value.trim().split(/\s+/) : [] }))}</>}
    {action.type === 'focus-app' && textInput('Application ID', action.appId, (appId) => onChange({ ...action, appId }))}
  </div>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return <button type="button" role="switch" aria-label={label} aria-checked={checked} className={`switch ${checked ? 'on' : ''}`} onClick={onChange}><span /></button>;
}

function ControllerPreview({ settings, status, selectedGameName }: { settings: GamingShortcutsSettings; status: BridgeSnapshot | null; selectedGameName?: string }) {
  const connection = status?.state !== 'connected' ? 'Bridge offline' : status.status?.controllerConnected ? 'Controller connected' : 'Controller not connected';
  const type = status?.status?.controllerType === 'dualsense-edge' ? 'DualSense Edge' : status?.status?.controllerType === 'dualsense' ? 'DualSense' : 'DualSense controller';
  return <section className="gaming-shortcuts-preview system-card" aria-label="Static controller preview">
    <div className="gaming-preview-heading"><div><span className="eyebrow">Static controller preview</span><h3>{selectedGameName ? `${selectedGameName} shortcuts` : 'Your PS button layout'}</h3></div><span className={`gaming-controller-state ${status?.status?.controllerConnected ? 'connected' : ''}`}><span aria-hidden="true" />{connection}</span></div>
    <div className="gaming-controller-stage">
      <img src={controllerImage} alt={`${type} preview`} />
      <div className="gaming-ps-chip" aria-label="PS button preview"><span>PS</span><strong>{actionLabel(settings.singlePress)}</strong><small>Press</small></div>
    </div>
    <div className="gaming-preview-bindings" aria-label="Preview bindings">
      <div><span>PS ×2</span><strong>{actionLabel(settings.doublePress)}</strong></div><div><span>PS hold</span><strong>{actionLabel(settings.longPress)}</strong></div>
    </div>
    <p className="gaming-shortcuts-help">Preview updates as you configure actions. Live hardware illumination is unavailable here; hardware output is never sent by this preview.</p>
  </section>;
}

export function GamingShortcuts({ active, profiles, activeProfileId, snapshot = null }: { active: boolean; profiles: TriggerProfile[]; activeProfileId: string | null; snapshot?: BridgeSnapshot | null }) {
  const [settings, setSettings] = useState<GamingShortcutsSettings>(DEFAULT_GAMING_SHORTCUTS_SETTINGS);
  const [capabilities, setCapabilities] = useState<ProviderCapabilities | null>(null);
  const [status, setStatus] = useState('');
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [previewOpened, setPreviewOpened] = useState(false);
  const gameProfiles = profiles.filter((profile) => profile.id !== 'default');
  useEffect(() => { void window.bridge.getGamingShortcutsSettings().then(setSettings); void window.bridge.getGamingShortcutProviders().then(setCapabilities); }, []);
  useEffect(() => {
    if (!previewOpened) return;
    const timeout = window.setTimeout(() => setPreviewOpened(false), 2600);
    return () => window.clearTimeout(timeout);
  }, [previewOpened]);
  useEffect(() => { if (selectedGameId && gameProfiles.some((profile) => profile.id === selectedGameId)) return; setSelectedGameId(activeProfileId && gameProfiles.some((profile) => profile.id === activeProfileId) ? activeProfileId : gameProfiles[0]?.id ?? null); }, [activeProfileId, profiles, selectedGameId]);
  const update = (next: GamingShortcutsSettings) => { setSettings(next); setStatus('Saving…'); void window.bridge.saveGamingShortcutsSettings(next).then((saved) => { setSettings(saved); setStatus('Saved'); }).catch(() => setStatus('Could not save settings')); };
  const addChord = (existing: GamingShortcutsSettings['chords']) => { const button = BUTTONS.find((candidate) => !existing.some((chord) => chord.button === candidate.value))?.value; return button ? [...existing, { button, action: { type: 'none' } as GamingShortcutAction }] : existing; };
  const selectedOverride = selectedGameId ? settings.perGameOverrides[selectedGameId] : undefined;
  const setGameOverride = (next: NonNullable<typeof selectedOverride>) => { if (selectedGameId) update({ ...settings, perGameOverrides: { ...settings.perGameOverrides, [selectedGameId]: next } }); };
  const clearGameOverride = () => { if (selectedGameId) { const perGameOverrides = { ...settings.perGameOverrides }; delete perGameOverrides[selectedGameId]; update({ ...settings, perGameOverrides }); } };
  const defaultPreset = useMemo(() => ({ ...DEFAULT_GAMING_SHORTCUTS_SETTINGS, enabled: true, psPressAction: 'enter-shortcut-mode' as const, directChordsEnabled: true, shortcutModeEnabled: true, doublePress: { type: 'switch-application', direction: 'previous' } as GamingShortcutAction, chords: [{ button: 'create' as const, action: { type: 'screenshot', provider: 'auto' } as GamingShortcutAction }, { button: 'triangle' as const, action: { type: 'performance-hud-toggle', provider: 'auto' } as GamingShortcutAction }, { button: 'mute' as const, action: { type: 'microphone-mute-toggle' } as GamingShortcutAction }, { button: 'dpad-up' as const, action: { type: 'volume', direction: 'up' } as GamingShortcutAction }, { button: 'dpad-down' as const, action: { type: 'volume', direction: 'down' } as GamingShortcutAction }, { button: 'dpad-left' as const, action: { type: 'switch-application', direction: 'previous' } as GamingShortcutAction }, { button: 'dpad-right' as const, action: { type: 'switch-application', direction: 'next' } as GamingShortcutAction }] }), []);
  const selectedGameName = gameProfiles.find((profile) => profile.id === selectedGameId)?.name;
  return <div className={`control-page gaming-shortcuts-page ${active ? 'active' : ''}`} role="tabpanel" id="control-panel-gaming-shortcuts" aria-labelledby="control-tab-gaming-shortcuts" aria-hidden={!active}>
    <div className="feature-heading system-heading"><div><span className="eyebrow">Controller customization</span><h2>Gaming Shortcuts</h2><p>Turn the PS button into a configurable Linux gaming shortcut layer.</p></div><span className="gaming-shortcuts-save-status" role="status" aria-live="polite">{status}</span></div>
    <div className="gaming-shortcuts-layout"><div className="gaming-shortcuts-config">
      <section className="system-card gaming-shortcuts-card gaming-shortcuts-overview"><div><strong>Enable Gaming Shortcuts</strong><p>Use PS gestures and chords for quick actions while gaming.</p></div><Toggle label="Enable Gaming Shortcuts" checked={settings.enabled} onChange={() => update({ ...settings, enabled: !settings.enabled })} /></section>
      <section className="system-card gaming-shortcuts-card"><div className="feature-card-title system-card-heading"><div><strong>PS button gestures</strong><p className="gaming-shortcuts-help">Choose what each gesture does. Actions use the existing safe execution and notification paths.</p></div><button type="button" className="secondary-action" onClick={() => update(defaultPreset)}>Apply preset</button></div><div className="gaming-gesture-list">{GESTURES.map(([key, label, hint]) => <div className="gaming-gesture-row" key={key}><div><strong>{label}</strong><span>{hint}</span></div><ActionEditor action={settings[key]} onChange={(action) => update({ ...settings, [key]: action })} capabilities={capabilities} /></div>)}</div></section>
      <section className="system-card gaming-shortcuts-card"><div className="feature-card-title system-card-heading"><div><strong>Shortcut mode</strong><p className="gaming-shortcuts-help">Choose the single PS press behavior used when no direct chord matches.</p></div></div><div className="gaming-shortcut-options"><label>PS press behavior<select aria-label="PS press behavior" value={settings.psPressAction} onChange={(event) => update({ ...settings, psPressAction: event.target.value as GamingShortcutsSettings['psPressAction'] })}><option value="enter-shortcut-mode">Enter shortcut mode</option><option value="show-shortcut-reference">Show shortcut reference</option><option value="open-opends5">Open or focus OpenDS5</option><option value="none">No action</option></select></label><label>Mode timeout<input aria-label="Shortcut mode timeout" type="number" min="1000" max="10000" step="100" value={settings.shortcutModeTimeoutMs} onChange={(event) => update({ ...settings, shortcutModeTimeoutMs: Number(event.target.value) })} /><span>ms</span></label></div></section>
      <section className="system-card gaming-shortcuts-card"><div className="feature-card-title system-card-heading"><div><strong>PS chords</strong><p className="gaming-shortcuts-help">Hold PS and press another button. Direct chords take precedence over PS gestures.</p></div><button type="button" className="secondary-action" onClick={() => update({ ...settings, chords: addChord(settings.chords) })}>Add chord</button></div><div className="gaming-shortcut-options"><label>Direct chords<Toggle label="Enable direct PS chords" checked={settings.directChordsEnabled} onChange={() => update({ ...settings, directChordsEnabled: !settings.directChordsEnabled })} /></label><label>Shortcut mode<Toggle label="Enable temporary shortcut mode" checked={settings.shortcutModeEnabled} onChange={() => update({ ...settings, shortcutModeEnabled: !settings.shortcutModeEnabled })} /></label></div>{settings.chords.length === 0 ? <p className="muted-copy">No chords configured.</p> : settings.chords.map((chord, index) => <div className="gaming-shortcut-row" key={`${chord.button}-${index}`}><select aria-label="Chord button" value={chord.button} onChange={(event) => { const chords = [...settings.chords]; chords[index] = { ...chord, button: event.target.value as Exclude<ControllerButton, 'ps'> }; update({ ...settings, chords }); }}>{BUTTONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select><ActionEditor action={chord.action} onChange={(action) => { const chords = [...settings.chords]; chords[index] = { ...chord, action }; update({ ...settings, chords }); }} capabilities={capabilities} /><button type="button" className="icon-action" aria-label={`Remove ${BUTTONS.find((button) => button.value === chord.button)?.label ?? 'chord'}`} onClick={() => update({ ...settings, chords: settings.chords.filter((_, itemIndex) => itemIndex !== index) })}>×</button></div>)}</section>
      <section className="system-card gaming-shortcuts-card"><div className="feature-card-title system-card-heading"><div><strong>Timing & notifications</strong><p className="gaming-shortcuts-help">Fine-tune gesture recognition and feedback.</p></div><button type="button" className="secondary-action" onClick={() => update(DEFAULT_GAMING_SHORTCUTS_SETTINGS)}>Reset</button></div><div className="gaming-timing-grid"><label>Double press window<input type="number" min="100" max="1000" step="10" value={settings.doublePressWindowMs} onChange={(event) => update({ ...settings, doublePressWindowMs: Number(event.target.value) })} /><span>ms</span></label><label>Hold threshold<input type="number" min="300" max="2000" step="10" value={settings.longPressThresholdMs} onChange={(event) => update({ ...settings, longPressThresholdMs: Number(event.target.value) })} /><span>ms</span></label><label>Chord window<input type="number" min="50" max="500" step="10" value={settings.chordWindowMs} onChange={(event) => update({ ...settings, chordWindowMs: Number(event.target.value) })} /><span>ms</span></label></div><div className="gaming-shortcut-options"><label>Success notifications<Toggle label="Show success notifications" checked={settings.showSuccessNotifications} onChange={() => update({ ...settings, showSuccessNotifications: !settings.showSuccessNotifications })} /></label><label>Error notifications<Toggle label="Show error notifications" checked={settings.showErrorNotifications} onChange={() => update({ ...settings, showErrorNotifications: !settings.showErrorNotifications })} /></label></div><button type="button" className="secondary-action gaming-preview-button" onClick={() => { setPreviewOpened(true); void window.bridge.previewGamingShortcutNotification(); }}>Preview notification</button></section>
      <section className="system-card gaming-shortcuts-card"><div className="feature-card-title system-card-heading"><div><strong>Per-game overrides</strong><p className="gaming-shortcuts-help">Override gesture and chord bindings for a game profile.</p></div>{selectedOverride && <button type="button" className="secondary-action" onClick={clearGameOverride}>Use global settings</button>}</div>{gameProfiles.length === 0 ? <p className="muted-copy">Create a Game Profile to customize shortcuts for a specific game.</p> : <label className="gaming-shortcut-row"><span>Game profile</span><select aria-label="Game profile" value={selectedGameId ?? ''} onChange={(event) => setSelectedGameId(event.target.value || null)}>{gameProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>}{selectedGameId && <><div className="gaming-gesture-list">{GESTURES.map(([key, label]) => <div className="gaming-gesture-row" key={key}><div><strong>{label}</strong><span>Inherits global setting until changed</span></div><ActionEditor action={selectedOverride?.[key] ?? settings[key]} onChange={(action) => setGameOverride({ ...selectedOverride, [key]: action })} capabilities={capabilities} /></div>)}</div><div className="feature-card-title system-card-heading gaming-game-chords-heading"><strong>Game PS chords</strong><button type="button" className="secondary-action" onClick={() => setGameOverride({ ...selectedOverride, chords: addChord(selectedOverride?.chords ?? []) })}>Add chord</button></div>{(selectedOverride?.chords ?? []).map((chord, index) => <div className="gaming-shortcut-row" key={`${chord.button}-${index}`}><select aria-label="Game chord button" value={chord.button} onChange={(event) => { const chords = [...(selectedOverride?.chords ?? [])]; chords[index] = { ...chord, button: event.target.value as Exclude<ControllerButton, 'ps'> }; setGameOverride({ ...selectedOverride, chords }); }}>{BUTTONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select><ActionEditor action={chord.action} onChange={(action) => { const chords = [...(selectedOverride?.chords ?? [])]; chords[index] = { ...chord, action }; setGameOverride({ ...selectedOverride, chords }); }} capabilities={capabilities} /><button type="button" className="icon-action" aria-label="Remove game chord" onClick={() => setGameOverride({ ...selectedOverride, chords: (selectedOverride?.chords ?? []).filter((_, itemIndex) => itemIndex !== index) })}>×</button></div>)}</>}</section>
    </div><div className="gaming-shortcuts-rail"><ControllerPreview settings={settings} status={snapshot} selectedGameName={selectedGameName} /><section className="system-card gaming-shortcuts-card gaming-provider-status" aria-label="Environment and provider status"><strong>{capabilities?.environment ?? 'Detecting environment…'}</strong><span>Screenshot: {capabilities?.screenshot.join(', ') || 'Unavailable'}</span><span>Recording: {capabilities?.recording.join(', ') || 'Unavailable'}</span><span>HUD: {capabilities?.hud.join(', ') || 'Unavailable'}</span></section></div></div>
    {previewOpened && <div className="gaming-preview-note" role="status" aria-live="polite">Shortcut notification preview sent.</div>}
  </div>;
}
