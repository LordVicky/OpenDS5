import type { CSSProperties } from 'react';
import type { TriggerEffectMode, TriggerEffectSpec } from '../shared/trigger-profiles';
import { defaultEffectForMode } from '../shared/trigger-profiles';

export const TRIGGER_EFFECT_MODE_OPTIONS: Array<[string, TriggerEffectMode]> = [
  ['Off', 'off'],
  ['Feedback', 'feedback'],
  ['Weapon', 'weapon'],
  ['Vibration', 'vibration'],
  ['Multi Feedback', 'multi-feedback'],
  ['Slope', 'slope'],
  ['Multi Vibration', 'multi-vibration']
];

const SLIDER_STEP = 5;
const SLIDER_TICKS = Array.from({ length: 21 }, (_, index) => index * SLIDER_STEP);
const ZONE_COUNT = 10;
const MIN_SLOPE_SPAN = SLIDER_STEP;

function snapPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value / SLIDER_STEP) * SLIDER_STEP));
}

function tickClass(value: number): string | undefined {
  if (value === 0 || value === 100) {
    return 'milestone endpoint';
  }
  if (value === 50) {
    return 'milestone';
  }
  return undefined;
}

type TriggerLabMeterProps = {
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
};

export function TriggerLabMeter({ label, value, disabled = false, onChange, onCommit }: TriggerLabMeterProps) {
  function commitValue(element: HTMLInputElement) {
    onCommit(snapPercent(Number(element.value)));
  }

  return (
    <div className="range-control trigger-lab-meter">
      <input
        type="range"
        min="0"
        max="100"
        step={SLIDER_STEP}
        value={value}
        disabled={disabled}
        aria-label={label}
        style={{ '--range-fill': `${value}%` } as CSSProperties}
        onChange={(event) => onChange(snapPercent(Number(event.currentTarget.value)))}
        onBlur={(event) => commitValue(event.currentTarget)}
        onKeyUp={(event) => commitValue(event.currentTarget)}
        onPointerCancel={(event) => commitValue(event.currentTarget)}
        onPointerUp={(event) => commitValue(event.currentTarget)}
      />
      <div className="range-ticks" aria-hidden="true">
        {SLIDER_TICKS.map((tick) => (
          <span key={tick} className={tickClass(tick)} />
        ))}
      </div>
    </div>
  );
}

type PercentField =
  | 'startPercent'
  | 'wallPercent'
  | 'forcePercent'
  | 'endPercent'
  | 'startForcePercent'
  | 'endForcePercent';

type PercentRow = { field: PercentField; label: string };

const PERCENT_ROWS: Partial<Record<TriggerEffectMode, PercentRow[]>> = {
  feedback: [
    { field: 'startPercent', label: 'Start' },
    { field: 'forcePercent', label: 'Force' }
  ],
  weapon: [
    { field: 'startPercent', label: 'Start' },
    { field: 'wallPercent', label: 'Wall' },
    { field: 'forcePercent', label: 'Force' }
  ],
  vibration: [
    { field: 'startPercent', label: 'Start' },
    { field: 'forcePercent', label: 'Force' }
  ],
  slope: [
    { field: 'startPercent', label: 'Start' },
    { field: 'endPercent', label: 'End' },
    { field: 'startForcePercent', label: 'Start Force' },
    { field: 'endForcePercent', label: 'End Force' }
  ]
};

// Keep the slope arm valid while editing: the shared validator requires
// endPercent > startPercent, so dragging one bound pushes the other.
function withPercentField(effect: TriggerEffectSpec, field: PercentField, value: number): TriggerEffectSpec {
  const next = { ...effect, [field]: value } as TriggerEffectSpec;
  if (next.mode === 'slope') {
    if (field === 'startPercent' && next.endPercent <= value) {
      next.endPercent = Math.min(100, value + MIN_SLOPE_SPAN);
      if (next.endPercent <= value) {
        next.startPercent = next.endPercent - MIN_SLOPE_SPAN;
      }
    }
    if (field === 'endPercent') {
      if (value <= 0) {
        next.endPercent = MIN_SLOPE_SPAN;
      }
      if (next.startPercent >= next.endPercent) {
        next.startPercent = Math.max(0, next.endPercent - MIN_SLOPE_SPAN);
      }
    }
  }
  return next;
}

function zonesOf(effect: TriggerEffectSpec): number[] {
  if (effect.mode === 'multi-feedback' || effect.mode === 'multi-vibration') {
    return effect.zones;
  }
  return Array.from({ length: ZONE_COUNT }, () => 0);
}

function withZone(effect: TriggerEffectSpec, index: number, value: number): TriggerEffectSpec {
  if (effect.mode !== 'multi-feedback' && effect.mode !== 'multi-vibration') {
    return effect;
  }
  const zones = effect.zones.map((zone, zoneIndex) => (zoneIndex === index ? value : zone));
  return { ...effect, zones };
}

function frequencyOf(effect: TriggerEffectSpec): number {
  if (effect.mode === 'vibration') {
    return effect.frequencyHz ?? 25;
  }
  if (effect.mode === 'multi-vibration') {
    return effect.frequencyHz;
  }
  return 25;
}

function withFrequency(effect: TriggerEffectSpec, frequencyHz: number): TriggerEffectSpec {
  if (effect.mode !== 'vibration' && effect.mode !== 'multi-vibration') {
    return effect;
  }
  return { ...effect, frequencyHz };
}

function clampFrequency(value: number): number {
  return Math.max(1, Math.min(255, Math.round(value)));
}

export type TriggerEffectEditorProps = {
  label: string;
  value: TriggerEffectSpec;
  onChange: (effect: TriggerEffectSpec) => void;
  onCommit?: (effect: TriggerEffectSpec) => void;
  disabled?: boolean;
  compact?: boolean;
};

export function TriggerEffectEditor({
  label,
  value,
  onChange,
  onCommit,
  disabled = false,
  compact = false
}: TriggerEffectEditorProps) {
  const commit = onCommit ?? onChange;
  const percentRows = PERCENT_ROWS[value.mode] ?? [];
  const hasZones = value.mode === 'multi-feedback' || value.mode === 'multi-vibration';
  const hasFrequency = value.mode === 'vibration' || value.mode === 'multi-vibration';

  function percentValue(field: PercentField): number {
    const raw = (value as Partial<Record<PercentField, number>>)[field];
    return raw ?? 0;
  }

  return (
    <div className={`trigger-effect-editor ${compact ? 'compact' : ''}`}>
      <div className="trigger-lab-mode-grid trigger-effect-mode-grid">
        {TRIGGER_EFFECT_MODE_OPTIONS.map(([modeLabel, mode]) => (
          <button
            key={mode}
            type="button"
            className={`trigger-lab-mode-button ${value.mode === mode ? 'active' : ''}`}
            aria-pressed={value.mode === mode}
            aria-label={`${label} mode ${modeLabel}`}
            title={modeLabel}
            disabled={disabled}
            onClick={() => {
              if (value.mode !== mode) {
                commit(defaultEffectForMode(mode));
              }
            }}
          >
            {modeLabel}
          </button>
        ))}
      </div>
      {value.mode === 'off' && (
        <p className="trigger-effect-off-note">Trigger resistance disabled — plain trigger travel.</p>
      )}
      {percentRows.map(({ field, label: rowLabel }) => (
        <div key={field} className="trigger-lab-meter-row">
          <span>{rowLabel}</span>
          <TriggerLabMeter
            label={`${label} ${rowLabel.toLowerCase()} percent`}
            value={percentValue(field)}
            disabled={disabled}
            onChange={(next) => onChange(withPercentField(value, field, next))}
            onCommit={(next) => commit(withPercentField(value, field, next))}
          />
          <strong>{percentValue(field)}%</strong>
        </div>
      ))}
      {hasZones && (
        <div className="trigger-zone-strip" role="group" aria-label={`${label} zone strengths`}>
          {zonesOf(value).map((zone, index) => (
            <div key={index} className="trigger-zone">
              <div className="trigger-zone-slider">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step={SLIDER_STEP}
                  value={zone}
                  disabled={disabled}
                  aria-label={`${label} zone ${index + 1}`}
                  style={{ '--range-fill': `${zone}%` } as CSSProperties}
                  onChange={(event) => onChange(withZone(value, index, snapPercent(Number(event.currentTarget.value))))}
                  onBlur={(event) => commit(withZone(value, index, snapPercent(Number(event.currentTarget.value))))}
                  onKeyUp={(event) => commit(withZone(value, index, snapPercent(Number(event.currentTarget.value))))}
                  onPointerCancel={(event) => commit(withZone(value, index, snapPercent(Number(event.currentTarget.value))))}
                  onPointerUp={(event) => commit(withZone(value, index, snapPercent(Number(event.currentTarget.value))))}
                />
              </div>
              <span className="trigger-zone-value">{zone}</span>
            </div>
          ))}
        </div>
      )}
      {hasFrequency && (
        <label className="trigger-profiles-modifier-param trigger-effect-frequency">
          <span>Frequency Hz</span>
          <input
            type="number"
            min={1}
            max={255}
            value={frequencyOf(value)}
            disabled={disabled}
            aria-label={`${label} vibration frequency`}
            onChange={(event) => {
              const raw = Number(event.target.value);
              if (Number.isNaN(raw)) return;
              commit(withFrequency(value, clampFrequency(raw)));
            }}
          />
        </label>
      )}
    </div>
  );
}
