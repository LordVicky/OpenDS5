import type { BridgeApi, SetupApi } from '../preload';

declare global {
  interface Window {
    bridge: BridgeApi;
    setup: SetupApi;
  }
}

export {};
