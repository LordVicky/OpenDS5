// SPDX-License-Identifier: AGPL-3.0-only
// Companion protocol emulation for DS5 Bridge companion app clients.
// Report layout mirrors ds5-bridge/companion/src/shared/protocol.ts.
#pragma once

#include <array>
#include <chrono>
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

struct CompanionRuntime {
  std::chrono::steady_clock::time_point started_at =
      std::chrono::steady_clock::now();
  CompanionSettings settings;
  std::uint16_t settings_revision = 0;
  std::uint8_t last_command_id = 0;
  std::uint8_t last_command_sequence = 0;
  std::uint8_t last_result_code = 0;
  std::uint8_t last_detail_code = 0;
};

// Handles {"command":"companion","op":"get"|"set"|"write",...} control
// requests. "get" takes "report_id" and replies {"OK":true,"report":[64]};
// "set"/"write" take "report" (64 bytes) and reply {"OK":true}.
std::string handle_companion_control_request(
    std::span<const JsonlField> fields, CompanionRuntime &runtime,
    const std::string &db_path,
    std::span<const VdsdControlControllerStatus> controllers, Logger &logger);

} // namespace vds
