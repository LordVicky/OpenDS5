import type { HidDeviceSummary } from '../shared/types';

export const SONY_VENDOR_ID = 0x054c;
export const DUALSENSE_PRODUCT_ID = 0x0ce6;
export const DUALSENSE_EDGE_PRODUCT_ID = 0x0df2;
export const DUALSENSE_PRODUCT_IDS = [DUALSENSE_PRODUCT_ID, DUALSENSE_EDGE_PRODUCT_ID] as const;

export type ControllerModel = 'dualsense' | 'dualsense-edge' | 'unknown';

export interface ControllerCapabilities {
  hasEdgeFunctionButtons: boolean;
  hasRearButtons: boolean;
  supportsAdaptiveTriggers: boolean;
  supportsAudioHaptics: boolean;
  supportsTouchpad: boolean;
  supportsMotion: boolean;
  supportsControllerAudio: boolean;
}

const STANDARD_DUALSENSE_CAPABILITIES: ControllerCapabilities = {
  hasEdgeFunctionButtons: false,
  hasRearButtons: false,
  supportsAdaptiveTriggers: true,
  supportsAudioHaptics: true,
  supportsTouchpad: true,
  supportsMotion: true,
  supportsControllerAudio: true
};

const EDGE_CAPABILITIES: ControllerCapabilities = {
  ...STANDARD_DUALSENSE_CAPABILITIES,
  hasEdgeFunctionButtons: true,
  hasRearButtons: true
};

const UNKNOWN_CAPABILITIES: ControllerCapabilities = {
  hasEdgeFunctionButtons: false,
  hasRearButtons: false,
  supportsAdaptiveTriggers: false,
  supportsAudioHaptics: false,
  supportsTouchpad: false,
  supportsMotion: false,
  supportsControllerAudio: false
};

export function controllerCapabilitiesForModel(model: ControllerModel): ControllerCapabilities {
  if (model === 'dualsense-edge') return { ...EDGE_CAPABILITIES };
  if (model === 'dualsense') return { ...STANDARD_DUALSENSE_CAPABILITIES };
  return { ...UNKNOWN_CAPABILITIES };
}

export interface ControllerDeviceClassification {
  vendorId: number | null;
  productId: number | null;
  model: ControllerModel;
  isDualSense: boolean;
  hasEdgeBackButtons: boolean;
  capabilities: ControllerCapabilities;
}

export function classifyControllerDevice(device: Pick<HidDeviceSummary, 'vendorId' | 'productId'>): ControllerDeviceClassification {
  const vendorId = device.vendorId ?? null;
  const productId = device.productId ?? null;
  const isSony = vendorId === SONY_VENDOR_ID;
  const model: ControllerModel = !isSony
    ? 'unknown'
    : productId === DUALSENSE_PRODUCT_ID
      ? 'dualsense'
      : productId === DUALSENSE_EDGE_PRODUCT_ID
        ? 'dualsense-edge'
        : 'unknown';
  const capabilities = controllerCapabilitiesForModel(model);
  return {
    vendorId,
    productId,
    model,
    isDualSense: model !== 'unknown',
    hasEdgeBackButtons: capabilities.hasRearButtons,
    capabilities
  };
}

export function isDualSenseDevice(device: Pick<HidDeviceSummary, 'vendorId' | 'productId'>): boolean {
  return classifyControllerDevice(device).isDualSense;
}
