import type { BridgeApi, SetupApi, UpdateApi } from '../preload';

declare global {
  interface Window {
    bridge: BridgeApi;
    setup: SetupApi;
    update: UpdateApi;
  }
}

export {};
