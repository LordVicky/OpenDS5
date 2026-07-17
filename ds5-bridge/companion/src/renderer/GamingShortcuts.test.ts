import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const component = readFileSync(new URL('./GamingShortcuts.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

describe('Gaming Shortcuts page', () => {
  it('keeps the renderer preview static and binds only connection state from the existing snapshot', () => {
    expect(component).toContain('snapshot?: BridgeSnapshot | null');
    expect(component).toContain('Static controller preview');
    expect(component).toContain('Live hardware illumination is unavailable here');
    expect(component).toContain('hardware output is never sent by this preview');
    expect(component).toContain('controllerConnected');
    expect(component).toContain('controllerImage');
    expect(component).not.toContain('Live preview');
    expect(component).not.toContain('onController');
    expect(component).not.toContain('buttonState');
    expect(component).not.toContain('testHaptics');
    expect(component).not.toContain('testClassicRumble');
  });

  it('binds persisted settings and cleans up the preview notification timer', () => {
    expect(component).toContain('getGamingShortcutsSettings().then(setSettings)');
    expect(component).toContain('saveGamingShortcutsSettings(next)');
    expect(component).toContain('return () => window.clearTimeout(timeout);');
    expect(component).toContain('previewOpened');
  });

  it('renders every supported shortcut action and secondary controller button', () => {
    expect(component).toContain("value: 'quit-active-game'");
    expect(component).toContain("value: 'custom-executable'");
    expect(component).toContain("value: 'l1'");
    expect(component).toContain("value: 'r3'");
  });

  it('has a responsive rail, sticky preview, and reduced-motion fallback', () => {
    expect(css).toContain('.gaming-shortcuts-layout {');
    expect(css).toContain('.gaming-shortcuts-preview {');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('.gaming-controller-stage img');
  });
});
