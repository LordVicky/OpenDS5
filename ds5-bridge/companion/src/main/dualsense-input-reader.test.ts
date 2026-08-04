import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { DualSenseEdgeHidInputReader, DualSenseShortcutInputReader } from './dualsense-input';
import { EvdevInputReader } from './evdev-input-reader';

class FakeHid extends EventEmitter {
  close = vi.fn();
}

function usbInputReport(): Buffer {
  const report = Buffer.alloc(64);
  report[0] = 0x01;
  report[1] = 128; report[2] = 128; report[3] = 128; report[4] = 128;
  report[8] = 8;
  report[33] = 0x80; report[37] = 0x80;
  return report;
}

describe('DualSenseEdgeHidInputReader lifecycle', () => {
  it('does not report an error when no Edge is connected', () => {
    const reader = new DualSenseEdgeHidInputReader({ enumerate: () => [] });
    const error = vi.fn();
    reader.on('error', error);
    reader.start();
    expect(error).not.toHaveBeenCalled();
  });

  it('reports an active Edge disconnect without escalating it as a global reader error', () => {
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
    expect(error).not.toHaveBeenCalled();
    reader.stop();
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
    const edgeStart = vi.spyOn(edge, 'start'); const edgeStop = vi.spyOn(edge, 'stop');
    const evdevStart = vi.spyOn(evdev, 'start');
    const reader = new DualSenseShortcutInputReader({ edge, evdev });
    reader.on('error', () => undefined);
    reader.start(); reader.start();
    reader.rescan();
    expect(edgeStart).toHaveBeenCalledTimes(2);
    expect(evdevStart).toHaveBeenCalledTimes(2);
    reader.stop();
    expect(edgeStop).not.toHaveBeenCalled();
    reader.stop();
    expect(edgeStop).toHaveBeenCalledOnce();
  });

  it('reconnects two Edge controllers without duplicating live HID paths', () => {
    const devices = [
      { vendorId: 0x054c, productId: 0x0df2, path: '/edge-a' },
      { vendorId: 0x054c, productId: 0x0df2, path: '/edge-b' }
    ];
    const handles = new Map<string, FakeHid>();
    const reader = new DualSenseEdgeHidInputReader({
      enumerate: () => devices,
      open: (path) => { const hid = new FakeHid(); handles.set(path, hid); return hid; },
      sourceIdentity: (path) => path.endsWith('a') ? 'source-a' : 'source-b'
    });
    const source = vi.fn(); const removed = vi.fn();
    reader.on('source', source); reader.on('source-removed', removed);
    reader.on('error', () => undefined);
    reader.start(); reader.start();
    expect(source).toHaveBeenCalledTimes(2);
    handles.get('/edge-a')?.emit('error', new Error('replugged'));
    expect(removed).toHaveBeenCalledWith('source-a');
    reader.start();
    expect(source).toHaveBeenCalledTimes(3);
    expect(handles.size).toBe(2);
    reader.stop();
  });

  it('keeps a source suppressed until its last HID path closes', () => {
    const handles = new Map<string, FakeHid>();
    let paths = ['/edge-main', '/edge-interface'];
    const reader = new DualSenseEdgeHidInputReader({
      enumerate: () => paths.map((path) => ({ vendorId: 0x054c, productId: 0x0df2, path })),
      open: (path) => { const hid = new FakeHid(); handles.set(path, hid); return hid; },
      sourceIdentity: () => 'shared-source'
    });
    const source = vi.fn(); const removed = vi.fn(); const disconnect = vi.fn();
    const error = vi.fn(); const input = vi.fn();
    reader.on('source', source); reader.on('source-removed', removed);
    reader.on('disconnect', disconnect); reader.on('error', error); reader.on('input', input);
    reader.start();
    expect(source).toHaveBeenCalledOnce();
    paths = ['/edge-interface'];
    handles.get('/edge-main')?.emit('error', new Error('one interface gone'));
    expect(removed).not.toHaveBeenCalled();
    expect(disconnect).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    handles.get('/edge-interface')?.emit('data', usbInputReport());
    expect(input).toHaveBeenCalledWith(expect.objectContaining({ sourceId: 'shared-source' }));
    paths = [];
    handles.get('/edge-interface')?.emit('error', new Error('last interface gone'));
    expect(removed).toHaveBeenCalledWith('shared-source');
    expect(disconnect).toHaveBeenCalledWith('shared-source');
    expect(error).not.toHaveBeenCalled();
    reader.stop();
  });

  it('reopens a partial path that reappears only at the delayed retry', () => {
    vi.useFakeTimers();
    try {
      let paths = ['/edge-main', '/edge-interface'];
      const handles = new Map<string, FakeHid>();
      const open = vi.fn((path: string) => { const hid = new FakeHid(); handles.set(path, hid); return hid; });
      const reader = new DualSenseEdgeHidInputReader({
        enumerate: () => paths.map((path) => ({ vendorId: 0x054c, productId: 0x0df2, path })),
        open,
        sourceIdentity: () => 'shared-source'
      });
      const source = vi.fn(); const disconnect = vi.fn(); const error = vi.fn();
      reader.on('source', source); reader.on('disconnect', disconnect); reader.on('error', error);
      reader.start();
      paths = ['/edge-interface'];
      handles.get('/edge-main')?.emit('error', new Error('temporarily gone'));
      expect(open).toHaveBeenCalledTimes(2);
      paths = ['/edge-main', '/edge-interface'];
      vi.advanceTimersByTime(4999);
      expect(open).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(1);
      expect(open).toHaveBeenCalledTimes(3);
      expect(source).toHaveBeenCalledOnce();
      expect(disconnect).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      reader.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('isolates one source last-path loss from other shortcut input sources', () => {
    let paths = ['/edge-a', '/edge-b'];
    const handles = new Map<string, FakeHid>();
    const edge = new DualSenseEdgeHidInputReader({
      enumerate: () => paths.map((path) => ({ vendorId: 0x054c, productId: 0x0df2, path })),
      open: (path) => { const hid = new FakeHid(); handles.set(path, hid); return hid; },
      sourceIdentity: (path) => path.endsWith('a') ? 'source-a' : 'source-b'
    });
    const evdev = new EvdevInputReader({ findNodes: () => [] });
    const reader = new DualSenseShortcutInputReader({ edge, evdev });
    const disconnect = vi.fn(); const error = vi.fn(); const input = vi.fn();
    reader.on('disconnect', disconnect); reader.on('error', error); reader.on('input', input);
    edge.start();
    paths = ['/edge-b'];
    handles.get('/edge-a')?.emit('error', new Error('source A gone'));
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledWith('source-a');
    expect(error).not.toHaveBeenCalled();
    handles.get('/edge-b')?.emit('data', usbInputReport());
    expect(input).toHaveBeenCalledWith(expect.objectContaining({ sourceId: 'source-b' }));
    edge.stop();
  });

  it('forwards a no-node evdev error and retries both readers after recovery', () => {
    vi.useFakeTimers();
    try {
      let nodes: string[] = [];
      const stream = new EventEmitter() as EventEmitter & { destroy: ReturnType<typeof vi.fn> };
      stream.destroy = vi.fn();
      const openStream = vi.fn(() => stream as unknown as NodeJS.ReadableStream);
      const evdev = new EvdevInputReader({
        findNodes: () => nodes,
        openStream,
        sourceIdentity: () => 'evdev-source'
      });
      const edge = new DualSenseEdgeHidInputReader({ enumerate: () => [] });
      const edgeStart = vi.spyOn(edge, 'start');
      const reader = new DualSenseShortcutInputReader({ edge, evdev });
      const error = vi.fn();
      reader.on('error', error);
      reader.start();
      expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: 'No DualSense evdev node found.' }));
      expect(openStream).not.toHaveBeenCalled();
      nodes = ['/dev/input/event-edge'];
      vi.advanceTimersByTime(4999);
      expect(openStream).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(edgeStart).toHaveBeenCalledTimes(2);
      expect(openStream).toHaveBeenCalledOnce();
      reader.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears tracking before closing handles during an intentional stop', () => {
    const handles = [new FakeHid(), new FakeHid()];
    for (const hid of handles) hid.close.mockImplementation(() => hid.emit('error', new Error('closed')));
    let nextHandle = 0;
    const reader = new DualSenseEdgeHidInputReader({
      enumerate: () => [
        { vendorId: 0x054c, productId: 0x0df2, path: '/edge-main' },
        { vendorId: 0x054c, productId: 0x0df2, path: '/edge-interface' }
      ],
      open: () => handles[nextHandle++],
      sourceIdentity: () => 'shared-source'
    });
    const removed = vi.fn(); const disconnect = vi.fn(); const error = vi.fn();
    reader.on('source-removed', removed); reader.on('disconnect', disconnect); reader.on('error', error);
    reader.start();
    reader.stop();
    expect(handles[0].close).toHaveBeenCalledOnce();
    expect(handles[1].close).toHaveBeenCalledOnce();
    expect(removed).toHaveBeenCalledTimes(1);
    expect(removed).toHaveBeenCalledWith('shared-source');
    expect(disconnect).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
