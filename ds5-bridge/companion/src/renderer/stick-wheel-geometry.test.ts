import { describe, expect, it } from 'vitest';
import { wheelPoint, sectorPath, sectorLabelPoint, fitSectorLabel } from './stick-wheel-geometry';

describe('fitSectorLabel', () => {
  it('keeps a short name on one line', () => {
    expect(fitSectorLabel('Micer', 10)).toEqual(['Micer']);
  });

  it('wraps a two-word name that exceeds the budget onto two lines', () => {
    expect(fitSectorLabel('Portable Freezer', 10)).toEqual(['Portable', 'Freezer']);
  });

  it('ellipsizes a line that still exceeds the budget', () => {
    expect(fitSectorLabel('X-1 Demousifier', 8)).toEqual(['X-1', 'Demousi…']);
  });

  it('ellipsizes an unbreakable long word', () => {
    expect(fitSectorLabel('Antidisestablish', 8)).toEqual(['Antidis…']);
  });

  it('never returns more than two lines', () => {
    const lines = fitSectorLabel('One Two Three Four', 6);
    expect(lines.length).toBeLessThanOrEqual(2);
  });
});

describe('wheelPoint', () => {
  it('maps 0 degrees to straight up from center', () => {
    const point = wheelPoint(100, 100, 80, 0);
    expect(point.x).toBeCloseTo(100);
    expect(point.y).toBeCloseTo(20);
  });

  it('maps 90 degrees to the right of center', () => {
    const point = wheelPoint(100, 100, 80, 90);
    expect(point.x).toBeCloseTo(180);
    expect(point.y).toBeCloseTo(100);
  });
});

describe('sectorPath', () => {
  it('starts sector 0 at 12 o clock when the offset is zero', () => {
    const path = sectorPath(100, 100, 80, 30, 0, 4, 0);
    expect(path.startsWith('M 100 20')).toBe(true);
  });

  it('rotates the sector start by the angle offset', () => {
    const path = sectorPath(100, 100, 80, 30, 0, 4, 90);
    expect(path.startsWith('M 180 100')).toBe(true);
  });

  it('produces a closed path with two arcs', () => {
    const path = sectorPath(100, 100, 80, 30, 1, 6, 0);
    expect(path.match(/A /g)?.length).toBe(2);
    expect(path.endsWith('Z')).toBe(true);
  });
});

describe('sectorLabelPoint', () => {
  it('places the label at the sector mid-angle between the radii', () => {
    // Sector 0 of 4 spans 0-90deg; mid-angle 45deg, mid-radius 55.
    const point = sectorLabelPoint(100, 100, 80, 30, 0, 4, 0);
    expect(point.x).toBeCloseTo(100 + 55 * Math.SQRT1_2);
    expect(point.y).toBeCloseTo(100 - 55 * Math.SQRT1_2);
  });
});
