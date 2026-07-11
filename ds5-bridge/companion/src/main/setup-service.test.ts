import { describe, expect, it } from 'vitest';
import { isSetupNeeded, parseProgressLine } from './setup-service';

describe('parseProgressLine', () => {
  it('parses plan, step and done events', () => {
    expect(
      parseProgressLine(
        '{"event":"plan","total":2,"steps":["a","b"],"log":"/var/log/opends5/install.log"}',
      ),
    ).toEqual({ event: 'plan', total: 2, steps: ['a', 'b'], log: '/var/log/opends5/install.log' });
    expect(parseProgressLine('{"event":"step","index":1,"status":"fail","exit":4}')).toEqual({
      event: 'step',
      index: 1,
      status: 'fail',
      exit: 4,
    });
    expect(parseProgressLine('{"event":"done","exit":0}')).toEqual({ event: 'done', exit: 0 });
  });

  it('ignores non-JSON noise', () => {
    expect(parseProgressLine('==> Installing')).toBeNull();
    expect(parseProgressLine('{"event":"unknown"}')).toBeNull();
    expect(parseProgressLine('not json {')).toBeNull();
    expect(parseProgressLine('')).toBeNull();
  });
});

describe('isSetupNeeded', () => {
  it('needed when module sysfs missing', () => {
    expect(isSetupNeeded({ moduleSysfs: '/nonexistent/vds_hcd', serviceActive: () => true })).toBe(
      true,
    );
  });
  it('needed when service inactive', () => {
    expect(isSetupNeeded({ moduleSysfs: '/', serviceActive: () => false })).toBe(true);
  });
  it('not needed when both fine', () => {
    expect(isSetupNeeded({ moduleSysfs: '/', serviceActive: () => true })).toBe(false);
  });
});
