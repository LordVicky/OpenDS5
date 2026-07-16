import { useState, type CSSProperties, type ReactNode } from 'react';
import {
  MAX_WHEEL_SECTORS,
  MIN_WHEEL_SECTORS,
  type StickWheelConfig
} from '../shared/trigger-profiles';
import { stickWheelSector, wheelSectorSpans } from '../shared/trigger-state-switcher';
import { fitSectorLabel, resizeWheelSector, sectorLabelPointAt, sectorPathAt } from './stick-wheel-geometry';

const SIZE = 260;
const CENTER = SIZE / 2;
const OUTER_RADIUS = 118;
const MIN_INNER_RADIUS = 14;
const STICK_CENTER = 128;

export interface StickSample {
  lx: number;
  ly: number;
  buttons: string[];
}

type SelectRenderer = (args: {
  value: string;
  options: Array<[string, string]>;
  ariaLabel: string;
  onChange: (value: string) => void;
}) => ReactNode;

type StickWheelEditorProps = {
  wheel: StickWheelConfig;
  stateNames: string[];
  buttonOptions: Array<[string, string]>;
  liveSample: StickSample | null;
  onChange: (wheel: StickWheelConfig) => void;
  renderSelect: SelectRenderer;
};

/**
 * Radial configurator for `switching.stickWheel`: sectors are clickable to
 * assign states, the threshold renders as the dead-zone circle, and the live
 * left-stick position is overlaid so the layout can be tuned against the
 * game's own weapon wheel.
 */
export function StickWheelEditor({
  wheel,
  stateNames,
  buttonOptions,
  liveSample,
  onChange,
  renderSelect
}: StickWheelEditorProps) {
  const [selectedSector, setSelectedSector] = useState(0);
  const count = wheel.sectors.length;
  const spans = wheelSectorSpans(wheel);
  const sectorStarts = spans.reduce<number[]>((starts, _, index) => {
    starts.push(index === 0 ? wheel.angleOffsetDeg : starts[index - 1] + spans[index - 1]);
    return starts;
  }, []);
  const innerRadius = Math.max(MIN_INNER_RADIUS, (OUTER_RADIUS * wheel.thresholdPercent) / 100);
  const liveSector = liveSample ? stickWheelSector(wheel, liveSample.lx, liveSample.ly) : null;
  const livePoint = liveSample
    ? {
        x: CENTER + ((liveSample.lx - STICK_CENTER) / STICK_CENTER) * OUTER_RADIUS,
        y: CENTER + ((liveSample.ly - STICK_CENTER) / STICK_CENTER) * OUTER_RADIUS
      }
    : null;

  function setSectorCount(next: number): void {
    const sectors = Array.from({ length: next }, (_, index) => wheel.sectors[index] ?? null);
    // Custom widths were tuned for the old slot count; fall back to equal slices.
    const { sectorSpansDeg: _spans, ...rest } = wheel;
    onChange({ ...rest, sectors });
    setSelectedSector((current) => Math.min(current, next - 1));
  }

  function setSectorSpan(spanDeg: number): void {
    onChange({ ...wheel, sectorSpansDeg: resizeWheelSector(spans.map(Math.round), selectedSector, spanDeg) });
  }

  function assignSector(state: string | null): void {
    const sectors = wheel.sectors.map((entry, index) => (index === selectedSector ? state : entry));
    onChange({ ...wheel, sectors });
  }

  return (
    <div className="stick-wheel-editor">
      <svg
        className="stick-wheel-svg"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="group"
        aria-label="Stick wheel sector layout"
      >
        {wheel.sectors.map((state, index) => (
          <path
            key={index}
            d={sectorPathAt(CENTER, CENTER, OUTER_RADIUS, innerRadius, sectorStarts[index], spans[index])}
            className={[
              'stick-wheel-sector',
              state === null ? 'unassigned' : '',
              index === selectedSector ? 'selected' : '',
              index === liveSector ? 'live' : ''
            ].filter(Boolean).join(' ')}
            role="button"
            aria-label={`Sector ${index + 1}: ${state ?? 'unassigned'}`}
            tabIndex={0}
            onClick={() => setSelectedSector(index)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') setSelectedSector(index);
            }}
          />
        ))}
        {wheel.sectors.map((state, index) => {
          const point = sectorLabelPointAt(CENTER, CENTER, OUTER_RADIUS, innerRadius, sectorStarts[index], spans[index]);
          // Character budget from the chord width at the label radius, so
          // labels shrink with the sector width instead of spilling over.
          const labelRadius = (OUTER_RADIUS + innerRadius) / 2;
          const chord = 2 * labelRadius * Math.sin((spans[index] * Math.PI) / 360);
          const maxChars = Math.max(4, Math.min(16, Math.floor(chord / 6)));
          const lines = fitSectorLabel(state ?? '—', maxChars);
          return (
            <text
              key={index}
              x={point.x}
              y={point.y - (lines.length - 1) * 5.5}
              className="stick-wheel-label"
            >
              {lines.map((line, lineIndex) => (
                <tspan key={lineIndex} x={point.x} dy={lineIndex === 0 ? 0 : 11}>
                  {line}
                </tspan>
              ))}
            </text>
          );
        })}
        <circle cx={CENTER} cy={CENTER} r={innerRadius} className="stick-wheel-deadzone" />
        {livePoint && <circle cx={livePoint.x} cy={livePoint.y} r={5} className="stick-wheel-stick-dot" />}
      </svg>

      <div className="stick-wheel-controls">
        <label className="trigger-profiles-modifier-param">
          <span>Wheel button</span>
          {renderSelect({
            value: wheel.button,
            options: buttonOptions,
            ariaLabel: 'Stick wheel button',
            onChange: (button) => onChange({ ...wheel, button })
          })}
        </label>
        <label className="trigger-profiles-modifier-param">
          <span>Slots</span>
          {renderSelect({
            value: String(count),
            options: Array.from(
              { length: MAX_WHEEL_SECTORS - MIN_WHEEL_SECTORS + 1 },
              (_, index): [string, string] => [
                String(MIN_WHEEL_SECTORS + index),
                String(MIN_WHEEL_SECTORS + index)
              ]
            ),
            ariaLabel: 'Stick wheel slot count',
            onChange: (value) => setSectorCount(Number(value))
          })}
        </label>
        <label className="trigger-profiles-modifier-param">
          <span>{`Sector ${selectedSector + 1} state`}</span>
          {renderSelect({
            value: wheel.sectors[selectedSector] ?? '',
            options: [['Unassigned', ''], ...stateNames.map((name): [string, string] => [name, name])],
            ariaLabel: `Sector ${selectedSector + 1} state`,
            onChange: (value) => assignSector(value === '' ? null : value)
          })}
        </label>
        <label className="trigger-profiles-modifier-param stick-wheel-slider">
          <span>{`Sector ${selectedSector + 1} width ${Math.round(spans[selectedSector])}°`}</span>
          <input
            type="range"
            min={10}
            max={360 - 10 * (count - 1)}
            value={Math.round(spans[selectedSector])}
            style={{
              '--range-fill': `${((Math.round(spans[selectedSector]) - 10) / (360 - 10 * (count - 1) - 10)) * 100}%`
            } as CSSProperties}
            aria-label={`Sector ${selectedSector + 1} width degrees`}
            onChange={(event) => setSectorSpan(Number(event.target.value))}
          />
        </label>
        <label className="trigger-profiles-modifier-param stick-wheel-slider">
          <span>{`Threshold ${wheel.thresholdPercent}%`}</span>
          <input
            type="range"
            min={1}
            max={100}
            value={wheel.thresholdPercent}
            style={{ '--range-fill': `${((wheel.thresholdPercent - 1) / 99) * 100}%` } as CSSProperties}
            aria-label="Stick threshold percent"
            onChange={(event) => onChange({ ...wheel, thresholdPercent: Number(event.target.value) })}
          />
        </label>
        <label className="trigger-profiles-modifier-param stick-wheel-slider">
          <span>{`Rotation ${wheel.angleOffsetDeg}°`}</span>
          <input
            type="range"
            min={0}
            max={359}
            value={wheel.angleOffsetDeg}
            style={{ '--range-fill': `${(wheel.angleOffsetDeg / 359) * 100}%` } as CSSProperties}
            aria-label="Stick wheel rotation degrees"
            onChange={(event) => onChange({ ...wheel, angleOffsetDeg: Number(event.target.value) })}
          />
        </label>
      </div>
    </div>
  );
}
