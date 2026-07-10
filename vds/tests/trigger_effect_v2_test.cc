// SPDX-License-Identifier: AGPL-3.0-only
// Unit test for the V2 companion trigger effect encoder (plain asserts; the
// repo has no C++ test framework).
#include <array>
#include <cassert>
#include <cstdio>
#include <span>

#include "../src/vds_companion.hh"
#include "../src/vds_protocol.hh"

int main() {
  std::array<std::uint8_t, vds::kTriggerEffectSize> buffer{};
  auto span = std::span<std::uint8_t, vds::kTriggerEffectSize>(buffer);

  // Mode 3: off.
  vds::CompanionTriggerEffect off{.active = true, .mode = 3};
  vds::encode_companion_trigger_effect_v2(span, off);
  assert(buffer[0] == 0x05); // kTriggerEffectOff

  // Mode 4: multi-feedback, zones 2 and 3 at 100%.
  vds::CompanionTriggerEffect multi{.active = true, .mode = 4};
  multi.zone_percents = {0, 0, 100, 100, 0, 0, 0, 0, 0, 0};
  vds::encode_companion_trigger_effect_v2(span, multi);
  assert(buffer[0] == 0x21); // kTriggerEffectFeedback
  assert((buffer[1] | (buffer[2] << 8)) == 0b0000001100); // zones 2,3 active
  assert(buffer[3] != 0); // strength codes packed for zones 2..3

  // Mode 4 with all zones at 0% degrades to off.
  vds::CompanionTriggerEffect multi_empty{.active = true, .mode = 4};
  vds::encode_companion_trigger_effect_v2(span, multi_empty);
  assert(buffer[0] == 0x05);

  // Mode 5: slope.
  vds::CompanionTriggerEffect slope{.active = true,
                                    .mode = 5,
                                    .start_percent = 20,
                                    .end_percent = 90,
                                    .end_force_percent = 100};
  slope.force_percent = 10; // start force reuses force_percent
  vds::encode_companion_trigger_effect_v2(span, slope);
  assert(buffer[0] == 0x22); // kTriggerEffectSlope
  // Zone bitmask holds the start and end positions (2 and 9).
  assert((buffer[1] | (buffer[2] << 8)) == ((1u << 2) | (1u << 9)));
  assert(buffer[3] != 0); // start/end strength code pair

  // Mode 6: multi-vibration with frequency byte.
  vds::CompanionTriggerEffect vib{.active = true, .mode = 6,
                                  .frequency_hz = 15};
  vib.zone_percents = {0, 0, 0, 50, 50, 100, 100, 0, 0, 0};
  vds::encode_companion_trigger_effect_v2(span, vib);
  assert(buffer[0] == 0x26); // kTriggerEffectVibration
  assert(buffer[9] == 15);

  // V1 modes delegate to the existing encoder; vibration honors an explicit
  // frequency override.
  vds::CompanionTriggerEffect v1_vib{.active = true,
                                     .mode = 2,
                                     .start_percent = 30,
                                     .wall_percent = 70,
                                     .force_percent = 50,
                                     .frequency_hz = 42};
  vds::encode_companion_trigger_effect_v2(span, v1_vib);
  assert(buffer[0] == 0x26);
  assert(buffer[9] == 42);

  vds::CompanionTriggerEffect v1_fb{.active = true,
                                    .mode = 0,
                                    .start_percent = 30,
                                    .force_percent = 100};
  vds::encode_companion_trigger_effect_v2(span, v1_fb);
  assert(buffer[0] == 0x21);

  // Global trigger-intensity scaling must cover the slope opcode (0x22).
  // Re-encode the slope effect from above: force_percent 10 -> strength 1
  // -> start code 0; end_force_percent 100 -> strength 8 -> end code 7;
  // trigger[3] = 0 | (7 << 3) = 0x38.
  vds::encode_companion_trigger_effect_v2(span, slope);
  assert(buffer[3] == 0x38);
  const std::uint8_t slope_zone_lo = buffer[1];
  const std::uint8_t slope_zone_hi = buffer[2];
  // percent 50: scale_strength_code semantics are round((strength)*p/100),
  // min 1 while p > 0, stored as strength-1. Start: strength 1 -> (1*50+50)/100
  // = 1 -> code 0. End: strength 8 -> (8*50+50)/100 = 4 -> code 3.
  // trigger[3] = 0 | (3 << 3) = 0x18.
  vds::scale_trigger_effect(span, 50);
  assert(buffer[0] == 0x22); // opcode preserved
  assert(buffer[1] == slope_zone_lo && buffer[2] == slope_zone_hi);
  assert(buffer[3] == 0x18);

  // percent 0 ("triggers off") must neutralize a slope effect entirely.
  vds::encode_companion_trigger_effect_v2(span, slope);
  vds::scale_trigger_effect(span, 0);
  assert(buffer[0] == 0x05); // kTriggerEffectOff
  for (std::size_t i = 1; i < buffer.size(); ++i) {
    assert(buffer[i] == 0);
  }

  std::puts("trigger_effect_v2_test OK");
  return 0;
}
