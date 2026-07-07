import { createServer, type Server } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VdsdCompanionTransport } from './vdsd-companion-transport';

const REPORT_LENGTH = 64;

type Handler = (request: Record<string, unknown>) => Record<string, unknown>;

function statusReport(): number[] {
  const report = new Array<number>(REPORT_LENGTH).fill(0);
  report[0] = 0x01;
  [report[1], report[2], report[3], report[4]] = [0x44, 0x53, 0x35, 0x42];
  report[5] = 1;
  report[6] = 16;
  return report;
}

describe('VdsdCompanionTransport', () => {
  let dir: string;
  let socketPath: string;
  let server: Server | null = null;
  let requests: Array<Record<string, unknown>>;
  let handler: Handler;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'vdsd-transport-'));
    socketPath = join(dir, 'vdsd.sock');
    requests = [];
    handler = () => ({ OK: true, report: statusReport() });
    server = createServer((socket) => {
      let data = '';
      socket.on('data', (chunk) => {
        data += chunk.toString('utf8');
        const newlineIndex = data.indexOf('\n');
        if (newlineIndex < 0) {
          return;
        }
        const request = JSON.parse(data.slice(0, newlineIndex)) as Record<string, unknown>;
        requests.push(request);
        socket.end(`${JSON.stringify(handler(request))}\n`);
      });
    });
    await new Promise<void>((resolve) => server!.listen(socketPath, resolve));
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = null;
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it('opens by fetching the status report over the control socket', async () => {
    const transport = await VdsdCompanionTransport.open({ socketPath });
    expect(transport.path).toBe(socketPath);
    expect(requests).toEqual([
      { command: 'companion', op: 'get', report_id: [1] }
    ]);
    transport.close();
  });

  it('returns feature reports from vdsd replies', async () => {
    const transport = await VdsdCompanionTransport.open({ socketPath });
    const report = await transport.getFeatureReport(0x01);
    expect(report).toHaveLength(REPORT_LENGTH);
    expect(report[0]).toBe(0x01);
    transport.close();
  });

  it('sends 64-byte command reports as companion write requests', async () => {
    const transport = await VdsdCompanionTransport.open({ socketPath });
    const command = new Array<number>(REPORT_LENGTH).fill(0);
    command[0] = 0x02;
    handler = () => ({ OK: true });
    await transport.write(command);
    const writeRequest = requests.at(-1)!;
    expect(writeRequest.op).toBe('write');
    expect(writeRequest.report).toHaveLength(REPORT_LENGTH);
    transport.close();
  });

  it('rejects when vdsd reports an error', async () => {
    const transport = await VdsdCompanionTransport.open({ socketPath });
    handler = () => ({ OK: false, error: 'companion op must be get, set, or write' });
    await expect(transport.getFeatureReport(0x01)).rejects.toThrow(
      'companion op must be get, set, or write'
    );
    transport.close();
  });

  it('rejects reports that are not 64 bytes', async () => {
    const transport = await VdsdCompanionTransport.open({ socketPath });
    await expect(transport.write([0x02])).rejects.toThrow('Expected 64 report bytes');
    transport.close();
  });

  it('fails to open when the socket is missing and no retry window is set', async () => {
    await expect(
      VdsdCompanionTransport.open({ socketPath: join(dir, 'missing.sock') })
    ).rejects.toThrow();
  });
});
