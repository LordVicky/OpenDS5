// SVG geometry for the stick-wheel configurator. Angles are degrees clockwise
// from 12 o'clock, matching stickWheelSector's stick-angle convention, mapped
// onto SVG's y-down coordinate space.

export interface WheelPoint {
  x: number;
  y: number;
}

export function wheelPoint(cx: number, cy: number, radius: number, angleDeg: number): WheelPoint {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + radius * Math.sin(rad), y: cy - radius * Math.cos(rad) };
}

function fmt(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/** Annular sector path (donut slice) for equal sector `index` of `count`. */
export function sectorPath(
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  index: number,
  count: number,
  offsetDeg: number
): string {
  const span = 360 / count;
  return sectorPathAt(cx, cy, outerRadius, innerRadius, offsetDeg + index * span, span);
}

/** Annular sector path starting at `startDeg` spanning `spanDeg` degrees. */
export function sectorPathAt(
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  startDeg: number,
  spanDeg: number
): string {
  const span = spanDeg;
  const start = startDeg;
  const end = start + span;
  const largeArc = span > 180 ? 1 : 0;
  const outerStart = wheelPoint(cx, cy, outerRadius, start);
  const outerEnd = wheelPoint(cx, cy, outerRadius, end);
  const innerEnd = wheelPoint(cx, cy, innerRadius, end);
  const innerStart = wheelPoint(cx, cy, innerRadius, start);
  return [
    `M ${fmt(outerStart.x)} ${fmt(outerStart.y)}`,
    `A ${fmt(outerRadius)} ${fmt(outerRadius)} 0 ${largeArc} 1 ${fmt(outerEnd.x)} ${fmt(outerEnd.y)}`,
    `L ${fmt(innerEnd.x)} ${fmt(innerEnd.y)}`,
    `A ${fmt(innerRadius)} ${fmt(innerRadius)} 0 ${largeArc} 0 ${fmt(innerStart.x)} ${fmt(innerStart.y)}`,
    'Z'
  ].join(' ');
}

const MIN_SPAN_DEG = 10;

/**
 * Sets sector `index` to `requestedSpan` degrees and redistributes the
 * difference across the other sectors proportionally. Results are integers
 * summing to 360, and no sector drops below the 10-degree minimum.
 */
export function resizeWheelSector(spans: number[], index: number, requestedSpan: number): number[] {
  const othersMin = (spans.length - 1) * MIN_SPAN_DEG;
  const target = Math.max(MIN_SPAN_DEG, Math.min(360 - othersMin, Math.round(requestedSpan)));
  const othersTotal = 360 - spans[index];
  const nextOthersTotal = 360 - target;
  const next = spans.map((span, at) => {
    if (at === index) return target;
    const scaled = othersTotal > 0 ? (span / othersTotal) * nextOthersTotal : nextOthersTotal / (spans.length - 1);
    return Math.max(MIN_SPAN_DEG, Math.round(scaled));
  });
  // Rounding and the minimum clamp can leave the sum off 360; settle the
  // remainder on sectors that have room, never on the resized one.
  let drift = 360 - next.reduce((sum, entry) => sum + entry, 0);
  for (let at = 0; drift !== 0 && at < next.length * 360; at += 1) {
    const cursor = at % next.length;
    if (cursor === index) continue;
    if (drift > 0) {
      next[cursor] += 1;
      drift -= 1;
    } else if (next[cursor] > MIN_SPAN_DEG) {
      next[cursor] -= 1;
      drift += 1;
    }
  }
  return next;
}

const ELLIPSIS = '…';

function ellipsize(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1))}${ELLIPSIS}`;
}

/**
 * Fits a state name into a sector label: at most two lines of `maxChars`,
 * wrapping on word boundaries and ellipsizing whatever still doesn't fit.
 */
export function fitSectorLabel(name: string, maxChars: number): string[] {
  if (name.length <= maxChars) return [name];
  const words = name.split(/\s+/);
  if (words.length === 1) return [ellipsize(name, maxChars)];
  let first = words[0];
  let index = 1;
  while (index < words.length && `${first} ${words[index]}`.length <= maxChars) {
    first = `${first} ${words[index]}`;
    index += 1;
  }
  const rest = words.slice(index).join(' ');
  if (rest.length === 0) return [ellipsize(first, maxChars)];
  return [ellipsize(first, maxChars), ellipsize(rest, maxChars)];
}

/** Center point of a sector: mid-angle, halfway between the radii. */
export function sectorLabelPoint(
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  index: number,
  count: number,
  offsetDeg: number
): WheelPoint {
  const span = 360 / count;
  return sectorLabelPointAt(cx, cy, outerRadius, innerRadius, offsetDeg + index * span, span);
}

/** Label point for a sector starting at `startDeg` spanning `spanDeg`. */
export function sectorLabelPointAt(
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  startDeg: number,
  spanDeg: number
): WheelPoint {
  return wheelPoint(cx, cy, (outerRadius + innerRadius) / 2, startDeg + spanDeg / 2);
}
