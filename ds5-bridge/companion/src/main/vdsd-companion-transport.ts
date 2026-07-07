import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { createConnection } from 'node:net';

type OpenOptions = {
  retryTimeoutMs?: number;
  retryDelayMs?: number;
  socketPath?: string;
};

type VdsdReply = {
  OK: boolean;
  error?: string;
  report?: number[];
};

const REQUEST_TIMEOUT_MS = 1500;
const DEFAULT_OPEN_RETRY_DELAY_MS = 50;
const REPORT_LENGTH = 64;
const DEFAULT_SOCKET_PATH = '/run/vdsd.sock';

// Known daemon socket locations: hardened system service, legacy root
// daemon, and the per-user uhid-backend service.
export function defaultVdsdSocketPath(): string {
  if (process.env.VDSD_SOCKET) {
    return process.env.VDSD_SOCKET;
  }
  const candidates = [
    '/run/vds/vdsd.sock',
    DEFAULT_SOCKET_PATH,
    process.env.XDG_RUNTIME_DIR ? `${process.env.XDG_RUNTIME_DIR}/vdsd.sock` : null
  ].filter((candidate): candidate is string => Boolean(candidate));
  return candidates.find((candidate) => existsSync(candidate)) ?? DEFAULT_SOCKET_PATH;
}

/**
 * Companion transport that speaks to the vdsd control socket instead of the
 * Pico's WinUSB vendor interface. vdsd emulates the DS5 Bridge companion
 * report protocol behind a JSONL request/reply exchange; each request uses a
 * short-lived connection, mirroring how vdsctl talks to the daemon.
 */
export class VdsdCompanionTransport extends EventEmitter {
  private closed = false;

  private constructor(readonly path: string) {
    super();
  }

  static async open(options: OpenOptions = {}): Promise<VdsdCompanionTransport> {
    const socketPath = options.socketPath ?? defaultVdsdSocketPath();
    const retryTimeoutMs = Math.max(0, options.retryTimeoutMs ?? 0);
    const retryDelayMs = Math.max(1, options.retryDelayMs ?? DEFAULT_OPEN_RETRY_DELAY_MS);
    const startedAt = Date.now();

    while (true) {
      try {
        const transport = new VdsdCompanionTransport(socketPath);
        await transport.request({ command: 'companion', op: 'get', report_id: [1] });
        return transport;
      } catch (error) {
        const lastError = error instanceof Error ? error : new Error(String(error));
        const elapsedMs = Date.now() - startedAt;
        if (retryTimeoutMs <= 0 || elapsedMs >= retryTimeoutMs) {
          throw lastError;
        }
        await delay(Math.min(retryDelayMs, retryTimeoutMs - elapsedMs));
      }
    }
  }

  async getFeatureReport(reportId: number, _length = REPORT_LENGTH): Promise<number[]> {
    const reply = await this.request({
      command: 'companion',
      op: 'get',
      report_id: [reportId & 0xff]
    });
    if (!Array.isArray(reply.report)) {
      throw new Error('vdsd did not return a companion report.');
    }
    return reply.report;
  }

  async sendFeatureReport(report: ArrayLike<number>): Promise<void> {
    await this.request({ command: 'companion', op: 'set', report: normalizeReport(report) });
  }

  async write(report: ArrayLike<number>): Promise<void> {
    await this.request({ command: 'companion', op: 'write', report: normalizeReport(report) });
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.emit('close');
  }

  private request(payload: Record<string, unknown>): Promise<VdsdReply> {
    if (this.closed) {
      return Promise.reject(new Error('vdsd companion transport is closed.'));
    }
    return new Promise<VdsdReply>((resolve, reject) => {
      const socket = createConnection(this.path);
      let response = '';
      let settled = false;
      const finish = (error: Error | null, reply?: VdsdReply) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        socket.destroy();
        if (error) {
          reject(error);
        } else {
          resolve(reply!);
        }
      };
      const timeout = setTimeout(() => {
        finish(new Error('vdsd control request timed out.'));
      }, REQUEST_TIMEOUT_MS);
      socket.on('error', (error) => finish(error));
      socket.on('connect', () => {
        socket.end(`${JSON.stringify(payload)}\n`);
      });
      socket.on('data', (chunk) => {
        response += chunk.toString('utf8');
      });
      socket.on('close', () => {
        if (settled) {
          return;
        }
        const line = response.trim();
        if (!line) {
          finish(new Error('vdsd closed the control connection without a reply.'));
          return;
        }
        try {
          const reply = JSON.parse(line) as VdsdReply;
          if (reply.OK !== true) {
            finish(new Error(reply.error || 'vdsd rejected the companion request.'));
            return;
          }
          finish(null, reply);
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      });
    });
  }
}

function normalizeReport(report: ArrayLike<number>): number[] {
  if (report.length !== REPORT_LENGTH) {
    throw new Error(`Expected ${REPORT_LENGTH} report bytes, received ${report.length}.`);
  }
  return Array.from({ length: REPORT_LENGTH }, (_, index) => report[index] & 0xff);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
