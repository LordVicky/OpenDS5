import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { DualSenseEdgeHidInputReader, DualSenseShortcutInputReader } from './dualsense-input';
import { EvdevInputReader } from './evdev-input-reader';

class FakeHid extends EventEmitter {
  close = vi.fn();
}

describe('DualSenseEdgeHidInputReader lifecycle', () => {
  it('does not report an error when no Edge is connected', () => {
    const reader = new DualSenseEdgeHidInputReader({ enumerate: () => [] });
    const error = vi.fn();
    reader.on('error', error);
    reader.start();
    expect(error).not.toHaveBeenCalled();
  });

  it('reports an active Edge disconnect so the owner can rescan', () => {
    const hid = new FakeHid();
    const reader = new DualSenseEdgeHidInputReader({
      enumerate: () => [{ vendorId: 0x054c, productId: 0x0df2, path: '/fake-edge' }],
      open: () => hid,
      sourceIdentity: () => 'physical-edge'
    });
    const error = vi.fn(); const removed = vi.fn(); const source = vi.fn();
    reader.on('error', error); reader.on('source-removed', removed); reader.on('source', source);
    reader.start();
    expect(source).toHaveBeenCalledWith('physical-edge');
    hid.emit('error', new Error('gone'));
    expect(removed).toHaveBeenCalledWith('physical-edge');
    expect(error).toHaveBeenCalledOnce();
  });

  it('keeps no-Edge reconnect polling quiet until an Edge appears', () => {
    const reader = new DualSenseEdgeHidInputReader({ enumerate: () => [] });
    const error = vi.fn();
    reader.on('error', error);
    reader.start();
    reader.start();
    expect(error).not.toHaveBeenCalled();
  });

  it('rescans without changing the two-consumer start/stop ownership count', () => {
    const edge = new DualSenseEdgeHidInputReader({ enumerate: () => [] });
    const evdev = new EvdevInputReader({ findNodes: () => [] });
    evdev.on('error', () => undefined);
    const edgeStart = vi.spyOn(edge, 'start'); const edgeStop = vi.spyOn(edge, 'stop');
    const reader = new DualSenseShortcutInputReader({ edge, evdev });
    reader.start(); reader.start();
    reader.rescan();
    expect(edgeStart).toHaveBeenCalledTimes(2);
    reader.stop();
    expect(edgeStop).not.toHaveBeenCalled();
    reader.stop();
    expect(edgeStop).toHaveBeenCalledOnce();
  });
});
