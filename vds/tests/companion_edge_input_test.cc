// Verifies companion input remapping and chord handling for DualSense Edge
// controls, including the short-report guard.
#include <array>
#include <cassert>
#include <cstdint>
#include <cstdio>
#include <span>

#include "vds_companion.hh"

namespace {

constexpr std::size_t kL2 = 0;
constexpr std::size_t kCross = 13;
constexpr std::size_t kLb = 16;
constexpr std::size_t kRb = 17;
constexpr std::size_t kPs = 20;

struct ButtonLocation {
  std::size_t byte;
  std::uint8_t mask;
};

constexpr std::array<ButtonLocation, vds::kCompanionRemapButtonCount>
    kButtonLocations{{
        {9, 0x04}, {9, 0x01}, {9, 0x10}, {0, 0},    {0, 0},    {0, 0},
        {0, 0},    {9, 0x40}, {9, 0x08}, {9, 0x02}, {9, 0x20}, {8, 0x80},
        {8, 0x40}, {8, 0x20}, {8, 0x10}, {9, 0x80}, {10, 0x40}, {10, 0x80},
        {10, 0x10}, {10, 0x20}, {10, 0x01},
    }};

void identity_remap(vds::CompanionRuntime &runtime) {
  for (std::size_t i = 0; i < runtime.button_remap.size(); ++i) {
    runtime.button_remap[i] = static_cast<std::uint8_t>(i);
  }
  runtime.button_remap_active = true;
}

void press(std::array<std::uint8_t, vds::kCompanionReportLength> &report,
           std::size_t button) {
  const ButtonLocation location = kButtonLocations[button];
  if (location.mask != 0) {
    report[location.byte] |= location.mask;
  }
}

void test_standard_controls_unchanged() {
  vds::CompanionRuntime runtime;
  identity_remap(runtime);
  vds::CompanionInputState state;
  std::array<std::uint8_t, vds::kCompanionReportLength> report{};
  report[5] = 0x42;
  report[6] = 0x81;
  report[8] = 0xf0 | 0x01;
  report[9] = 0xff;
  report[10] = 0x75; // mute, all four Edge controls, and PS.
  const auto original = report;

  vds::companion_translate_input(runtime, state, report);
  assert(report == original);
}

void test_edge_controls_independently() {
  for (const std::size_t button : {kLb, kRb, std::size_t{18}, std::size_t{19}}) {
    vds::CompanionRuntime runtime;
    identity_remap(runtime);
    vds::CompanionInputState state;
    std::array<std::uint8_t, vds::kCompanionReportLength> report{};
    press(report, button);
    const auto original = report;

    vds::companion_translate_input(runtime, state, report);
    assert(report == original);
  }
}

void test_remap_one_to_many_and_identity_trigger() {
  vds::CompanionRuntime runtime;
  identity_remap(runtime);
  runtime.button_remap[kLb] = static_cast<std::uint8_t>(kCross);
  runtime.button_remap[kRb] = static_cast<std::uint8_t>(kCross);
  vds::CompanionInputState state;
  std::array<std::uint8_t, vds::kCompanionReportLength> report{};
  report[5] = 0x42; // L2 remains identity-mapped and keeps its analog value.
  press(report, kLb);
  press(report, kRb);

  vds::companion_translate_input(runtime, state, report);
  assert(report[5] == 0x42);
  assert(report[8] == kButtonLocations[kCross].mask);
  assert(report[10] == 0);
}

void test_consumed_edge_chord_and_release_reuse() {
  vds::CompanionRuntime runtime;
  identity_remap(runtime);
  runtime.chord_bindings.push_back({0x21, 1, static_cast<std::uint8_t>(kLb)});
  vds::CompanionInputState state;

  std::array<std::uint8_t, vds::kCompanionReportLength> report{};
  press(report, kPs);
  press(report, kLb);
  vds::companion_translate_input(runtime, state, report);
  assert(runtime.pending_input_events.size() == 1);
  assert(runtime.pending_input_events.front() == 0x21);
  assert((report[10] & 0x01) != 0); // starter remains visible to the game.
  assert((report[10] & 0x40) == 0); // consumed chord button does not leak.

  vds::companion_translate_input(runtime, state, report);
  assert(runtime.pending_input_events.size() == 1); // no repeat while held.

  report.fill(0);
  vds::companion_translate_input(runtime, state, report);
  assert(state.consumed_mask == 0);

  press(report, kPs);
  press(report, kLb);
  vds::companion_translate_input(runtime, state, report);
  assert(runtime.pending_input_events.size() == 2);
}

void test_short_report_is_ignored() {
  vds::CompanionRuntime runtime;
  identity_remap(runtime);
  vds::CompanionInputState state;
  state.prev_pressed = 0x1234;
  state.consumed_mask = 0x5678;
  std::array<std::uint8_t, 10> report{};
  report.fill(0xa5);
  const auto original = report;

  vds::companion_translate_input(runtime, state, report);
  assert(report == original);
  assert(state.prev_pressed == 0x1234);
  assert(state.consumed_mask == 0x5678);
}

} // namespace

int main() {
  test_standard_controls_unchanged();
  test_edge_controls_independently();
  test_remap_one_to_many_and_identity_trigger();
  test_consumed_edge_chord_and_release_reuse();
  test_short_report_is_ignored();
  std::puts("companion_edge_input_test OK");
  return 0;
}
