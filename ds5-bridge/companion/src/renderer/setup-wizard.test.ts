import { describe, expect, it } from 'vitest';
import { initialProgress, reduceProgress } from './SetupWizard';

describe('setup progress reducer', () => {
  it('tracks plan then per-step status', () => {
    let s = reduceProgress(initialProgress, {
      event: 'plan',
      total: 2,
      steps: ['a', 'b'],
      log: '/l',
    });
    expect(s.steps).toEqual([
      { desc: 'a', status: 'pending' },
      { desc: 'b', status: 'pending' },
    ]);
    s = reduceProgress(s, { event: 'step', index: 0, status: 'start' });
    expect(s.steps[0].status).toBe('running');
    s = reduceProgress(s, { event: 'step', index: 0, status: 'ok' });
    expect(s.steps[0].status).toBe('done');
    s = reduceProgress(s, { event: 'step', index: 1, status: 'fail', exit: 4 });
    expect(s.steps[1].status).toBe('failed');
    expect(s.logPath).toBe('/l');
  });

  it('maps done exit codes to outcomes', () => {
    expect(reduceProgress(initialProgress, { event: 'done', exit: 0 }).outcome).toBe('success');
    expect(reduceProgress(initialProgress, { event: 'done', exit: 6 }).outcome).toBe('reboot');
    expect(reduceProgress(initialProgress, { event: 'done', exit: 4 }).outcome).toBe('error');
  });
});
