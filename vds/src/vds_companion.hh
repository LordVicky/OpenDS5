// SPDX-License-Identifier: AGPL-3.0-only
// Companion protocol emulation for DS5 Bridge companion app clients.
// Report layout mirrors ds5-bridge/companion/src/shared/protocol.ts.
#pragma once

#include <array>
#include <chrono>
#include <deque>
#include <optional>
#include <cstdint>
#include <span>
#include <string>

#include "jsonl.hh"
#include "vdsd_common.hh"

namespace vds {

class Logger;

inline constexpr std::size_t kCompanionReportLength = 64;
inline constexpr std::uint8_t kCompanionProtocolMajor = 1;
inline constexpr std::uint8_t kCompanionProtocolMinor = 16;

struct CompanionSettings {
  std::uint16_t haptics_gain_percent = 100;
  std::uint16_t classic_rumble_gain_percent = 100;
  std::uint16_t trigger_effect_intensity_percent = 100;
  bool player_led_enabled = true;
  bool led_enabled = true;
  bool idle_disconnect_enabled = false;
  std::uint16_t idle_disconnect_timeout_minutes = 10;
  std::uint16_t speaker_volume_percent = 100;
  std::uint8_t speaker_gain_level = 4;
  std::uint8_t lightbar_red = 0;
  std::uint8_t lightbar_green = 0;
  std::uint8_t lightbar_blue = 255;
  std::uint8_t lightbar_brightness_percent = 100;
  bool lightbar_override_enabled = false;
  bool mic_muted = false;
  std::uint8_t mute_button_mode = 0;
  std::uint8_t mute_keyboard_usage = 0;
  std::uint8_t mute_keyboard_modifiers = 0;
  bool quiet_mode_enabled = false;
  bool usb_suspend_disconnect_enabled = false;
  bool sleep_keybind_enabled = false;
  std::uint8_t host_persona_mode = 0;
};

struct CompanionTriggerEffect {
  bool active = false;
  std::uint8_t mode = 0;
  std::uint8_t target = 0; // 0 both, 1 left, 2 right
  std::uint8_t start_percent = 0;
  std::uint8_t wall_percent = 0;
  std::uint8_t force_percent = 0;
};

// Momentary and persistent effects requested through companion commands; the
// platform daemon translates these into BT output state on connected ports.
struct CompanionActuation {
  std::uint64_t version = 0;
  CompanionTriggerEffect persistent_trigger;
  CompanionTriggerEffect test_trigger;
  std::chrono::steady_clock::time_point test_trigger_until{};
  bool test_rumble_active = false;
  std::uint8_t test_rumble_power = 0;
  std::chrono::steady_clock::time_point test_rumble_until{};
};

inline constexpr std::size_t kCompanionRemapButtonCount = 21;
inline constexpr std::size_t kCompanionMaxChordBindings = 16;
inline constexpr std::size_t kCompanionMaxPendingInputEvents = 8;

struct CompanionChordBinding {
  std::uint8_t event = 0;   // 0x20+ chord function slot event code
  std::uint8_t starter = 0; // 1 ps, 2 lfn, 3 rfn, 4 mute
  std::uint8_t button = 0;  // REMAP_BUTTON_IDS index
};

// Per-port state for chord detection and press-scoped suppression.
struct CompanionInputState {
  std::uint32_t prev_pressed = 0;
  std::uint32_t consumed_mask = 0;
};

struct CompanionRuntime {
  std::chrono::steady_clock::time_point started_at =
      std::chrono::steady_clock::now();
  CompanionSettings settings;
  CompanionActuation actuation;
  std::array<std::uint8_t, kCompanionRemapButtonCount> button_remap{};
  bool button_remap_active = false;
  std::vector<CompanionChordBinding> chord_bindings;
  std::deque<std::uint8_t> pending_input_events;
  std::uint16_t settings_revision = 0;
  std::uint8_t last_command_id = 0;
  std::uint8_t last_command_sequence = 0;
  std::uint8_t last_result_code = 0;
  std::uint8_t last_detail_code = 0;
};

// Rewrites a virtual USB DualSense input report in place: applies the
// companion button remap table and detects chord bindings (starter held +
// button pressed), queueing their event codes for the app to poll via the
// companion INPUT report.
void companion_translate_input(CompanionRuntime &runtime,
                               CompanionInputState &state,
                               std::span<std::uint8_t> report);

// Clears expired momentary effects; returns true when state changed.
bool expire_companion_actuation(CompanionRuntime &runtime,
                                std::chrono::steady_clock::time_point now);

// Earliest pending expiry, if any momentary effect is active.
std::optional<std::chrono::steady_clock::time_point>
next_companion_actuation_deadline(const CompanionRuntime &runtime);

// Handles {"command":"companion","op":"get"|"set"|"write",...} control
// requests. "get" takes "report_id" and replies {"OK":true,"report":[64]};
// "set"/"write" take "report" (64 bytes) and reply {"OK":true}.
std::string handle_companion_control_request(
    std::span<const JsonlField> fields, CompanionRuntime &runtime,
    const std::string &db_path,
    std::span<const VdsdControlControllerStatus> controllers, Logger &logger);

} // namespace vds
