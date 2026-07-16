import { describe, expect, it } from 'vitest';
import { describeCapabilities } from './profile-capabilities';
import type { TriggerEffectSpec, TriggerProfile, TriggerSlotConfig } from './trigger-profiles';

function slot(base: TriggerEffectSpec | null, modifiers: TriggerSlotConfig['modifiers'] = []): TriggerSlotConfig {
  return { base, modifiers };
}

function profile(l2: TriggerSlotConfig, r2: TriggerSlotConfig): TriggerProfile {
  return {
    version: 1,
    id: 'test',
    name: 'Test',
    match: { processNames: [], windowTitles: [] },
    triggers: { l2, r2 },
    updatedAtMs: 0
  };
}

const zones = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];

describe('describeCapabilities', () => {
  it('names the effect on each slot that has one', () => {
    const p = profile(
      slot({ mode: 'multi-feedback', zones }),
      slot({ mode: 'slope', startPercent: 20, endPercent: 90, startForcePercent: 30, endForcePercent: 80 })
    );
    expect(describeCapabilities(p)).toBe('L2 multi-zone · R2 slope');
  });

  it('omits a slot with no base effect', () => {
    const p = profile(slot({ mode: 'feedback', startPercent: 30, forcePercent: 60 }), slot(null));
    expect(describeCapabilities(p)).toBe('L2 feedback');
  });

  it('treats an off effect as no effect', () => {
    const p = profile(slot({ mode: 'off' }), slot({ mode: 'vibration', startPercent: 10, forcePercent: 50, frequencyHz: 20 }));
    expect(describeCapabilities(p)).toBe('R2 vibration');
  });

  it('counts modifiers across both slots', () => {
    const mod = {
      when: { source: 'input' as const, condition: 'trigger-full-pull' as const },
      effect: { mode: 'feedback' as const, startPercent: 50, forcePercent: 90 }
    };
    const p = profile(
      slot({ mode: 'feedback', startPercent: 30, forcePercent: 60 }, [mod, mod]),
      slot({ mode: 'slope', startPercent: 20, endPercent: 90, startForcePercent: 30, endForcePercent: 80 }, [mod])
    );
    expect(describeCapabilities(p)).toBe('L2 feedback · R2 slope · 3 modifiers');
  });

  it('uses the singular for a single modifier', () => {
    const mod = {
      when: { source: 'input' as const, condition: 'rapid-fire' as const, pressesPerSecond: 5 },
      effect: { mode: 'off' as const }
    };
    const p = profile(slot({ mode: 'feedback', startPercent: 30, forcePercent: 60 }, [mod]), slot(null));
    expect(describeCapabilities(p)).toBe('L2 feedback · 1 modifier');
  });

  it('describes an empty profile without crashing', () => {
    expect(describeCapabilities(profile(slot(null), slot(null)))).toBe('No trigger effects');
  });

  it('names every effect mode', () => {
    const modes: Array<[TriggerEffectSpec, string]> = [
      [{ mode: 'feedback', startPercent: 1, forcePercent: 1 }, 'feedback'],
      [{ mode: 'weapon', startPercent: 1, wallPercent: 2, forcePercent: 1 }, 'weapon'],
      [{ mode: 'vibration', startPercent: 1, forcePercent: 1, frequencyHz: 10 }, 'vibration'],
      [{ mode: 'multi-feedback', zones }, 'multi-zone'],
      [
        { mode: 'slope', startPercent: 1, endPercent: 9, startForcePercent: 1, endForcePercent: 9 },
        'slope'
      ],
      [{ mode: 'multi-vibration', frequencyHz: 10, zones }, 'multi-zone vibration']
    ];
    for (const [effect, label] of modes) {
      expect(describeCapabilities(profile(slot(effect), slot(null)))).toBe(`L2 ${label}`);
    }
  });

  it('describes multi-state profiles by their state machinery', () => {
    const feel = slot({ mode: 'feedback', startPercent: 30, forcePercent: 60 });
    const p = profile(feel, slot(null));
    p.states = [
      { name: 'Pistol', triggers: { l2: feel, r2: slot(null) } },
      {
        name: 'Shotgun',
        triggers: {
          l2: feel,
          r2: slot({ mode: 'weapon', startPercent: 20, wallPercent: 60, forcePercent: 90 }, [
            {
              when: { source: 'input', condition: 'trigger-full-pull' },
              effect: { mode: 'vibration', startPercent: 0, forcePercent: 60 }
            }
          ])
        }
      }
    ];
    p.switching = {
      rules: [{ button: 'triangle', action: 'cycle' }],
      stickWheel: { button: 'triangle', thresholdPercent: 50, angleOffsetDeg: 0, sectors: ['Pistol', 'Shotgun'] }
    };
    expect(describeCapabilities(p)).toBe('2 states · analog wheel · 1 switch rule · 1 modifier');
  });

  it('describes a multi-state profile without a wheel or modifiers minimally', () => {
    const feel = slot({ mode: 'feedback', startPercent: 30, forcePercent: 60 });
    const p = profile(feel, slot(null));
    p.states = [
      { name: 'A', triggers: { l2: feel, r2: slot(null) } },
      { name: 'B', triggers: { l2: feel, r2: slot(null) } }
    ];
    p.switching = { rules: [] };
    expect(describeCapabilities(p)).toBe('2 states');
  });
});
