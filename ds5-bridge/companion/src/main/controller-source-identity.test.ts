import { describe, expect, it } from 'vitest';
import { controllerSourceIdsMatch, normalizeControllerSysfsPath } from './controller-source-identity';

describe('controller source identity', () => {
  it('matches HID and evdev nodes sharing one physical parent', () => {
    expect(controllerSourceIdsMatch(
      '/sys/devices/pci0000:00/usb1/1-2/input/input7',
      '/sys/devices/pci0000:00/usb1/1-2/hidraw/hidraw3'
    )).toBe(true);
  });

  it('rejects nodes from different physical parents', () => {
    expect(controllerSourceIdsMatch('/sys/devices/controller-a/input/input7', '/sys/devices/controller-b/hidraw/hidraw3')).toBe(false);
  });

  it('fails closed for malformed or missing identities', () => {
    expect(normalizeControllerSysfsPath('')).toBeNull();
    expect(normalizeControllerSysfsPath('not-a-sysfs-path/input/input7')).toBeNull();
    expect(controllerSourceIdsMatch('/sys/devices/controller-a/input/input7', '')).toBe(false);
    expect(controllerSourceIdsMatch('/sys/devices/controller-a/input/input7', 'malformed')).toBe(false);
  });
});
