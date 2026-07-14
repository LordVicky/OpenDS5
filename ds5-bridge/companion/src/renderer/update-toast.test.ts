import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
const toast = readFileSync(new URL('./UpdateToast.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');

function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} is missing`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
}

describe('update toast layout', () => {
  it('sits below modals and the startup tutorial so it can never cover a dialog', () => {
    // .modal-backdrop is 100 and .startup-tutorial-backdrop is 120.
    expect(rule('.update-toast')).toContain('z-index: 90');
  });

  it('shrinks instead of clipping at 150% UI scale or in a narrow window', () => {
    expect(rule('.update-toast')).toContain('min(348px, calc(100% - 32px))');
  });

  it('anchors to the bottom-right, clear of the top resize edge', () => {
    const declaration = rule('.update-toast');
    expect(declaration).toContain('position: fixed');
    expect(declaration).toContain('right: 16px');
    expect(declaration).toContain('bottom: 16px');
  });

  it('respects reduced motion', () => {
    expect(css).toContain('prefers-reduced-motion');
  });
});

describe('update toast behaviour', () => {
  it('offers exactly the three actions', () => {
    expect(toast).toContain('Update');
    expect(toast).toContain('Remind me later');
    expect(toast).toContain('Skip this version');
  });

  it('never auto-dismisses, so the choice cannot be lost', () => {
    expect(toast).not.toMatch(/setTimeout\([^)]*dismiss/);
  });

  it('asks nothing during the install; the polkit prompt is the confirmation', () => {
    const installing = toast.slice(toast.indexOf("'installing'"));
    expect(installing.slice(0, 600)).not.toContain('<button');
  });

  it('is suppressed while a modal or the startup tutorial is open', () => {
    expect(app).toMatch(/updateState[\s\S]{0,400}(showTutorial|modal)/i);
  });

  it('retries a rebuild failure with rebuild(), not start()', () => {
    expect(toast).toContain("state.retry === 'rebuild' ? 'rebuild' : 'start'");
  });
});
