import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GestureEngine } from './gesture-engine';

describe('GestureEngine', () => {
  beforeEach(() => vi.useFakeTimers());
  it('delays a single press until the double window', () => {
    const output: unknown[] = []; const engine = new GestureEngine({ emit: (event) => output.push(event) });
    engine.update(new Set(['ps']), 0); engine.update(new Set(), 1);
    expect(output).toEqual([]); vi.advanceTimersByTime(299); expect(output).toEqual([]);
    vi.advanceTimersByTime(1); expect(output).toEqual([{ type: 'single-press', button: 'ps' }]);
  });
  it('emits only double press inside the boundary', () => {
    const emit = vi.fn(); const engine = new GestureEngine({ emit });
    engine.update(new Set(['ps']), 0); engine.update(new Set(), 1); engine.update(new Set(['ps']), 301); engine.update(new Set(), 302);
    vi.runAllTimers(); expect(emit).toHaveBeenCalledTimes(1); expect(emit).toHaveBeenCalledWith({ type: 'double-press', button: 'ps' });
  });
  it('emits long press at threshold and no short gesture', () => {
    const emit = vi.fn(); const engine = new GestureEngine({ emit });
    engine.update(new Set(['ps']), 0); vi.advanceTimersByTime(650); expect(emit).toHaveBeenCalledWith({ type: 'long-press', button: 'ps', durationMs: 650 });
    engine.update(new Set(), 651); vi.runAllTimers(); expect(emit).toHaveBeenCalledTimes(1);
  });
  it('recognizes either chord order and suppresses PS output', () => {
    const emit = vi.fn(); const engine = new GestureEngine({ emit });
    engine.update(new Set(['ps']), 0); engine.update(new Set(['ps', 'create']), 150); engine.update(new Set(), 151); vi.runAllTimers();
    expect(emit).toHaveBeenCalledWith({ type: 'chord', modifier: 'ps', button: 'create' }); expect(emit).toHaveBeenCalledTimes(1);
    engine.update(new Set(['create']), 1000); engine.update(new Set(['ps', 'create']), 1100); expect(emit).toHaveBeenCalledTimes(2);
  });
  it('recognizes a chord after PS has been held beyond the chord window', () => {
    const emit = vi.fn(); const engine = new GestureEngine({ emit });
    engine.update(new Set(['ps']), 0);
    engine.update(new Set(['ps']), 500);
    engine.update(new Set(['ps', 'create']), 1000);
    expect(emit).toHaveBeenCalledWith({ type: 'chord', modifier: 'ps', button: 'create' });
  });
  it('repeats chords when the secondary button is released and pressed again', () => {
    const emit = vi.fn(); const engine = new GestureEngine({ emit });
    engine.update(new Set(['ps']), 0);
    engine.update(new Set(['ps', 'dpad-up']), 10);
    engine.update(new Set(['ps']), 20);
    engine.update(new Set(['ps', 'dpad-up']), 30);
    engine.update(new Set(['ps']), 40);
    expect(emit).toHaveBeenNthCalledWith(1, { type: 'chord', modifier: 'ps', button: 'dpad-up' });
    expect(emit).toHaveBeenNthCalledWith(2, { type: 'chord', modifier: 'ps', button: 'dpad-up' });
  });
  it('reset clears stale timers and held state', () => {
    const emit = vi.fn(); const engine = new GestureEngine({ emit });
    engine.update(new Set(['ps']), 0); engine.reset(); vi.runAllTimers(); expect(emit).not.toHaveBeenCalled();
  });
  it('does not turn a chord after a pending single into a later double press', () => {
    const emit = vi.fn(); const engine = new GestureEngine({ emit });
    engine.update(new Set(['ps']), 0); engine.update(new Set(), 1);
    engine.update(new Set(['ps']), 100); engine.update(new Set(['ps', 'create']), 150); engine.update(new Set(), 151);
    engine.update(new Set(['ps']), 1000); engine.update(new Set(), 1001); vi.runAllTimers();
    expect(emit).toHaveBeenCalledWith({ type: 'chord', modifier: 'ps', button: 'create' });
    expect(emit).toHaveBeenCalledWith({ type: 'single-press', button: 'ps' });
    expect(emit).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'double-press' }));
  });
  it('rejects invalid timing', () => { expect(() => new GestureEngine({ chordWindowMs: 0 })).toThrow(); });
});
