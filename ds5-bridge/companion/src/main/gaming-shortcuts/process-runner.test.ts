import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { createProcessRunner } from './process-runner';

function fakeChild(): ChildProcess & { kill: ReturnType<typeof vi.fn> } {
  const child = new EventEmitter() as ChildProcess & { kill: ReturnType<typeof vi.fn> };
  child.kill = vi.fn();
  return child;
}

describe('ProcessRunner', () => {
  it('returns the child exit result', async () => {
    const child = fakeChild();
    const runner = createProcessRunner({ spawn: () => child });
    const resultPromise = runner.run('test-program', ['--arg'], 1000);

    child.emit('exit', 0, null);

    await expect(resultPromise).resolves.toEqual({ code: 0, signal: null, timedOut: false });
  });

  it('force-kills a child that ignores SIGTERM and resolves with a timeout outcome', async () => {
    vi.useFakeTimers();
    try {
      const child = fakeChild();
      const runner = createProcessRunner({ spawn: () => child, killGracePeriodMs: 25 });
      const resultPromise = runner.run('stubborn-program', [], 100);

      await vi.advanceTimersByTimeAsync(100);
      expect(child.kill).toHaveBeenCalledWith('SIGTERM');
      expect(resultPromise).toBeInstanceOf(Promise);

      await vi.advanceTimersByTimeAsync(24);
      expect(child.kill).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);

      expect(child.kill).toHaveBeenLastCalledWith('SIGKILL');
      await expect(resultPromise).resolves.toEqual({ code: null, signal: 'SIGKILL', timedOut: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports a timeout when SIGTERM lets the child exit during the grace period', async () => {
    vi.useFakeTimers();
    try {
      const child = fakeChild();
      const runner = createProcessRunner({ spawn: () => child, killGracePeriodMs: 25 });
      const resultPromise = runner.run('slow-program', [], 100);

      await vi.advanceTimersByTimeAsync(100);
      child.emit('exit', null, 'SIGTERM');

      await expect(resultPromise).resolves.toEqual({ code: null, signal: 'SIGTERM', timedOut: true });
      expect(child.kill).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(25);
      expect(child.kill).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
