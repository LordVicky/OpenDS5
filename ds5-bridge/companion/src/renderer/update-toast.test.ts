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

  it('disables its own entrance animation under reduced motion', () => {
    const start = css.indexOf('@media (prefers-reduced-motion');
    expect(start, 'no prefers-reduced-motion block').toBeGreaterThanOrEqual(0);
    const block = css.slice(start, css.indexOf('\n}', css.indexOf('.update-toast', start)));
    expect(block).toContain('.update-toast');
    expect(block).toContain('animation: none');
  });

  it('gives every toast button a focus ring visible in all five themes', () => {
    // --focus-ring is defined per theme; a border-colour swap alone is invisible on
    // .quiet (transparent border) and on .primary (border is already accent).
    expect(rule('.update-toast-actions button:focus-visible')).toContain(
      'outline: 2px solid var(--focus-ring)',
    );
    expect(rule('.update-toast-actions button:focus-visible')).toContain('outline-offset');
    expect(css.match(/--focus-ring:/g) ?? []).toHaveLength(5);
    // .quiet must not cancel the ring it inherits from the button rule.
    expect(rule('.update-toast-actions .quiet:hover,\n.update-toast-actions .quiet:focus-visible'))
      .not.toContain('outline: none');
  });
});

/** The offer phase only — the block that renders the three choices. */
const offer = toast.slice(
  toast.indexOf("state.phase === 'offer'"),
  toast.indexOf("state.phase === 'notify'"),
);

describe('update toast behaviour', () => {
  it('offers exactly the three actions, each wired to its own handler', () => {
    // Substring checks on labels alone cannot fail: 'Update' also matches the
    // "Update available" title inside this very block.
    expect(offer.match(/<button/g) ?? []).toHaveLength(3);
    expect(offer).toMatch(/onAction\('start'\)[\s\S]{0,80}>\s*Update\s*</);
    expect(offer).toMatch(/onAction\('dismiss'\)[\s\S]{0,80}>\s*Remind me later\s*</);
    expect(offer).toMatch(/onAction\('skip'\)[\s\S]{0,80}>\s*Skip this version\s*</);
  });

  it('keeps Skip quiet and Update primary, so the irreversible choice is not the reflex one', () => {
    expect(offer).toMatch(/className="primary"[\s\S]{0,60}onAction\('start'\)/);
    expect(offer).toMatch(/className="quiet"[\s\S]{0,60}onAction\('skip'\)/);
    expect(offer).not.toMatch(/className="primary"[\s\S]{0,60}onAction\('skip'\)/);
  });

  it('tells the user which version they are on, not just the new one', () => {
    expect(offer).toContain('{state.version}');
    expect(offer).toContain('{state.currentVersion}');
    expect(offer).toContain('{megabytes(state.sizeBytes)}');
  });

  it('announces politely instead of posing as a dialog the user cannot enter or escape', () => {
    expect(toast).toContain('role="status"');
    expect(toast).not.toContain('role="dialog"');
    expect(toast).toContain('aria-label="Update"');
  });

  it('never auto-dismisses, so the choice cannot be lost', () => {
    expect(toast).not.toMatch(/setTimeout\([^)]*dismiss/);
  });

  it('asks nothing during the install; the polkit prompt is the confirmation', () => {
    const installing = toast.slice(toast.indexOf("'installing'"));
    expect(installing.slice(0, 600)).not.toContain('<button');
  });

  it('is suppressed while a modal or the startup tutorial is open', () => {
    // Pinned to the real render gate: deleting the condition must fail this test,
    // which is the whole point of the rule. Both flags are declared in App.tsx.
    expect(app).toContain('const startupTutorialOpen =');
    expect(app).toContain('const anyModalOpen =');
    expect(app).toMatch(
      /\{\s*!startupTutorialOpen\s*&&\s*!anyModalOpen\s*&&\s*\(\s*<UpdateToast/,
    );
  });

  it('retries a rebuild failure with rebuild(), not start()', () => {
    expect(toast).toContain("state.retry === 'rebuild' ? 'rebuild' : 'start'");
  });
});
