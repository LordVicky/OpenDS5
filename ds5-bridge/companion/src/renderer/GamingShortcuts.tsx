import { useEffect, useMemo, useState } from 'react';
import type { ProviderCapabilities } from '../main/gaming-shortcuts/providers/detect-environment';
import {
  DEFAULT_GAMING_SHORTCUTS_SETTINGS,
  type GamingShortcutAction,
  type GamingShortcutsSettings
} from '../shared/gaming-shortcuts';
import type { ControllerButton } from '../shared/controller-input';

const BUTTONS: Array<{ value: Exclude<ControllerButton, 'ps'>; label: string }> = [
  { value: 'create', label: 'Create' }, { value: 'options', label: 'Options' }, { value: 'touchpad', label: 'Touchpad' }, { value: 'mute', label: 'Mute' },
  { value: 'cross', label: 'Cross' }, { value: 'circle', label: 'Circle' }, { value: 'square', label: 'Square' }, { value: 'triangle', label: 'Triangle' },
  { value: 'dpad-up', label: 'D-pad Up' }, { value: 'dpad-down', label: 'D-pad Down' }, { value: 'dpad-left', label: 'D-pad Left' }, { value: 'dpad-right', label: 'D-pad Right' }
];

type ActionKind = GamingShortcutAction['type'];

const ACTIONS: Array<{ value: ActionKind; label: string }> = [
  { value: 'none', label: 'No action' }, { value: 'passthrough', label: 'Pass through only' }, { value: 'open-opends5', label: 'Open or focus OpenDS5' },
  { value: 'launch-app', label: 'Open or focus an application' }, { value: 'focus-app', label: 'Focus application by ID' },
  { value: 'screenshot', label: 'Take screenshot' }, { value: 'recording-toggle', label: 'Toggle recording' },
  { value: 'performance-hud-toggle', label: 'Toggle performance HUD' }, { value: 'volume', label: 'Volume' },
  { value: 'microphone-mute-toggle', label: 'Toggle microphone mute' }, { value: 'on-screen-keyboard', label: 'Open on-screen keyboard' },
  { value: 'switch-application', label: 'Switch application' }, { value: 'quit-active-game', label: 'Quit active game (confirm)' },
  { value: 'custom-executable', label: 'Custom executable' }
];

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
  return ACTIONS.find((item) => item.value === action.type)?.label ?? 'No action';
}

function isProviderAction(action: GamingShortcutAction): action is Extract<GamingShortcutAction, { provider: string }> {
  return action.type === 'screenshot' || action.type === 'recording-toggle' || action.type === 'performance-hud-toggle' || action.type === 'on-screen-keyboard';
}

function ActionEditor({ action, onChange, capabilities }: {
  action: GamingShortcutAction;
  onChange: (next: GamingShortcutAction) => void;
  capabilities: ProviderCapabilities | null;
}) {
  const providerOptions = action.type === 'screenshot' ? capabilities?.screenshot ?? []
    : action.type === 'recording-toggle' ? capabilities?.recording ?? []
      : action.type === 'performance-hud-toggle' ? capabilities?.hud ?? []
        : capabilities?.keyboard ?? [];
  return <div className="gaming-shortcut-action-editor">
    <select aria-label="Shortcut action" value={action.type} onChange={(event) => onChange(actionForKind(event.target.value as ActionKind))}>
      {ACTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
    </select>
    {action.type === 'volume' && <select aria-label="Volume direction" value={action.direction} onChange={(event) => onChange({ type: 'volume', direction: event.target.value as 'up' | 'down' | 'mute' })}>
      <option value="up">Up</option><option value="down">Down</option><option value="mute">Mute</option>
    </select>}
    {action.type === 'switch-application' && <select aria-label="Application direction" value={action.direction} onChange={(event) => onChange({ type: 'switch-application', direction: event.target.value as 'next' | 'previous' })}>
      <option value="next">Next</option><option value="previous">Previous</option>
    </select>}
    {isProviderAction(action) && <select aria-label="Provider" value={action.provider} onChange={(event) => onChange({ ...action, provider: event.target.value } as GamingShortcutAction)}>
      <option value="auto">Automatic</option>{providerOptions.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
    </select>}
    {action.type === 'custom-executable' && <>
      <input aria-label="Executable" placeholder="Executable path" value={action.executable} onChange={(event) => onChange({ ...action, executable: event.target.value })} />
      <input aria-label="Arguments" placeholder="Arguments, separated by spaces" value={action.args.join(' ')} onChange={(event) => onChange({ ...action, args: event.target.value.trim() ? event.target.value.trim().split(/\s+/) : [] })} />
    </>}
    {action.type === 'launch-app' && <>
      <input aria-label="Application executable" placeholder="Application executable" value={action.executable} onChange={(event) => onChange({ ...action, executable: event.target.value })} />
      <input aria-label="Application arguments" placeholder="Arguments, separated by spaces" value={action.args.join(' ')} onChange={(event) => onChange({ ...action, args: event.target.value.trim() ? event.target.value.trim().split(/\s+/) : [] })} />
    </>}
    {action.type === 'focus-app' && <input aria-label="Application ID" placeholder="Application ID" value={action.appId} onChange={(event) => onChange({ ...action, appId: event.target.value })} />}
  </div>;
}

export function GamingShortcuts({ active }: { active: boolean }) {
  const [settings, setSettings] = useState<GamingShortcutsSettings>(DEFAULT_GAMING_SHORTCUTS_SETTINGS);
  const [capabilities, setCapabilities] = useState<ProviderCapabilities | null>(null);
  const [status, setStatus] = useState('');
  useEffect(() => {
    void window.bridge.getGamingShortcutsSettings().then(setSettings);
    void window.bridge.getGamingShortcutProviders().then(setCapabilities);
  }, []);
  const update = (next: GamingShortcutsSettings) => {
    setSettings(next);
    setStatus('Saving…');
    void window.bridge.saveGamingShortcutsSettings(next).then((saved) => { setSettings(saved); setStatus('Saved'); }).catch(() => setStatus('Could not save settings'));
  };
  const setBinding = (key: 'singlePress' | 'doublePress' | 'longPress', action: GamingShortcutAction) => update({ ...settings, [key]: action });
  const defaultPreset = useMemo(() => ({ ...DEFAULT_GAMING_SHORTCUTS_SETTINGS, enabled: true,
    singlePress: { type: 'open-opends5' } as GamingShortcutAction,
    doublePress: { type: 'switch-application', direction: 'previous' } as GamingShortcutAction,
    chords: [{ button: 'create' as const, action: { type: 'screenshot', provider: 'auto' } as GamingShortcutAction }]
  }), []);
  return <div className={`control-page gaming-shortcuts-page ${active ? 'active' : ''}`} role="tabpanel" id="control-panel-gaming-shortcuts" aria-labelledby="control-tab-gaming-shortcuts" aria-hidden={!active}>
    <div className="feature-heading system-heading"><div><h2>Gaming Shortcuts</h2><p>Turn the PS button into a configurable Linux gaming shortcut layer.</p></div><span className="gaming-shortcuts-save-status" role="status">{status}</span></div>
    <section className="system-card gaming-shortcuts-card">
      <div className="gaming-shortcuts-toggle"><div><strong>Enable Gaming Shortcuts</strong><span>Actions are observational: Steam or a game may also receive the PS button.</span></div><button type="button" role="switch" aria-checked={settings.enabled} className={`switch ${settings.enabled ? 'on' : ''}`} onClick={() => update({ ...settings, enabled: !settings.enabled })}><span /></button></div>
      <div className="gaming-shortcut-grid">
        {([['singlePress', 'PS button · Press'], ['doublePress', 'PS button · Double press'], ['longPress', 'PS button · Hold']] as const).map(([key, label]) => <label className="gaming-shortcut-row" key={key}><span>{label}</span><ActionEditor action={settings[key]} onChange={(action) => setBinding(key, action)} capabilities={capabilities} /></label>)}
      </div>
    </section>
    <section className="system-card gaming-shortcuts-card"><div className="feature-card-title system-card-heading"><strong>PS chords</strong><button type="button" className="secondary-action" onClick={() => update({ ...settings, chords: [...settings.chords, { button: 'triangle', action: { type: 'none' } }] })}>Add chord</button></div><p className="gaming-shortcuts-help">Hold PS and press another controller button. Chords take precedence over PS press gestures.</p>
      {settings.chords.length === 0 ? <p className="muted-copy">No chords configured.</p> : settings.chords.map((chord, index) => <div className="gaming-shortcut-row" key={`${chord.button}-${index}`}><select aria-label="Chord button" value={chord.button} onChange={(event) => { const chords = [...settings.chords]; chords[index] = { ...chord, button: event.target.value as Exclude<ControllerButton, 'ps'> }; update({ ...settings, chords }); }}>{BUTTONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select><ActionEditor action={chord.action} onChange={(action) => { const chords = [...settings.chords]; chords[index] = { ...chord, action }; update({ ...settings, chords }); }} capabilities={capabilities} /><button type="button" className="icon-action" aria-label="Remove chord" onClick={() => update({ ...settings, chords: settings.chords.filter((_, itemIndex) => itemIndex !== index) })}>×</button></div>)}
    </section>
    <section className="system-card gaming-shortcuts-card"><div className="feature-card-title system-card-heading"><strong>Timing</strong><button type="button" className="secondary-action" onClick={() => update(defaultPreset)}>Apply Linux Gaming preset</button></div><div className="gaming-timing-grid"><label>Double press window <input type="number" min="100" max="1000" step="10" value={settings.doublePressWindowMs} onChange={(event) => update({ ...settings, doublePressWindowMs: Number(event.target.value) })} /> ms</label><label>Hold threshold <input type="number" min="300" max="2000" step="10" value={settings.longPressThresholdMs} onChange={(event) => update({ ...settings, longPressThresholdMs: Number(event.target.value) })} /> ms</label><label>Chord window <input type="number" min="50" max="500" step="10" value={settings.chordWindowMs} onChange={(event) => update({ ...settings, chordWindowMs: Number(event.target.value) })} /> ms</label></div></section>
    <section className="gaming-provider-status" aria-label="Environment and provider status"><strong>Environment: {capabilities?.environment ?? 'Detecting…'}</strong><span>Screenshot: {capabilities?.screenshot.join(', ') || 'Unavailable'}</span><span>Recording: {capabilities?.recording.join(', ') || 'Unavailable'}</span><span>HUD: {capabilities?.hud.join(', ') || 'Unavailable'}</span><span>Keyboard: {capabilities?.keyboard.join(', ') || 'Unavailable'}</span></section>
  </div>;
}
