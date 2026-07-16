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

/** Annular sector path (donut slice) for sector `index` of `count`. */
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
  const start = offsetDeg + index * span;
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
  const midAngle = offsetDeg + index * span + span / 2;
  return wheelPoint(cx, cy, (outerRadius + innerRadius) / 2, midAngle);
}
