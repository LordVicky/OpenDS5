import { describe, expect, it } from 'vitest';
import { classifyControllerDevice, controllerCapabilitiesForModel, DUALSENSE_EDGE_PRODUCT_ID, DUALSENSE_PRODUCT_ID, SONY_VENDOR_ID } from './controller-device';

describe('classifyControllerDevice', () => {
  it.each([
    [DUALSENSE_PRODUCT_ID, 'dualsense', false],
    [DUALSENSE_EDGE_PRODUCT_ID, 'dualsense-edge', true]
  ])('classifies Sony product %s', (productId, model, hasEdgeBackButtons) => {
    expect(classifyControllerDevice({ vendorId: SONY_VENDOR_ID, productId })).toMatchObject({ model, isDualSense: true, hasEdgeBackButtons });
  });

  it('rejects unrelated or incomplete identities', () => {
    expect(classifyControllerDevice({ vendorId: 0x1234, productId: DUALSENSE_EDGE_PRODUCT_ID }).isDualSense).toBe(false);
    expect(classifyControllerDevice({ vendorId: SONY_VENDOR_ID }).model).toBe('unknown');
  });

  it('exposes explicit standard and Edge capability defaults', () => {
    expect(controllerCapabilitiesForModel('dualsense')).toEqual({
      hasEdgeFunctionButtons: false, hasRearButtons: false, supportsAdaptiveTriggers: true,
      supportsAudioHaptics: true, supportsTouchpad: true, supportsMotion: true, supportsControllerAudio: true
    });
    expect(controllerCapabilitiesForModel('dualsense-edge')).toMatchObject({ hasEdgeFunctionButtons: true, hasRearButtons: true, supportsAdaptiveTriggers: true, supportsAudioHaptics: true, supportsTouchpad: true, supportsMotion: true, supportsControllerAudio: true });
    expect(controllerCapabilitiesForModel('unknown')).toEqual({ hasEdgeFunctionButtons: false, hasRearButtons: false, supportsAdaptiveTriggers: false, supportsAudioHaptics: false, supportsTouchpad: false, supportsMotion: false, supportsControllerAudio: false });
  });
});
