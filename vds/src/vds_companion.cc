// SPDX-License-Identifier: AGPL-3.0-only
#include "vds_companion.hh"

#include <algorithm>
#include <stdexcept>

#include "vds_config.hh"
#include "vds_log.hh"

namespace vds {

namespace {

constexpr std::uint8_t kReportIdStatus = 0x01;
constexpr std::uint8_t kReportIdCommand = 0x02;
constexpr std::uint8_t kReportIdAck = 0x03;

constexpr std::uint8_t kAckOk = 0x00;
constexpr std::uint8_t kAckErrBadMagic = 0x01;
constexpr std::uint8_t kAckErrBadVersion = 0x02;
constexpr std::uint8_t kAckErrInvalidValue = 0x04;
constexpr std::uint8_t kAckErrUnknownCommand = 0x05;
constexpr std::uint8_t kAckErrNotConnected = 0x06;

// Emulated firmware version reported to the companion app. Tracks the
// DS5_Bridge release whose protocol this emulation implements.
constexpr std::uint8_t kFirmwareMajor = 1;
constexpr std::uint8_t kFirmwareMinor = 6;
constexpr std::uint8_t kFirmwarePatch = 3;

using CompanionReport = std::array<std::uint8_t, kCompanionReportLength>;

void write_header(CompanionReport &report, std::uint8_t report_id) {
  report.fill(0);
  report[0] = report_id;
  report[1] = 'D';
  report[2] = 'S';
  report[3] = '5';
  report[4] = 'B';
  report[5] = kCompanionProtocolMajor;
  report[6] = kCompanionProtocolMinor;
}

void write_u16(CompanionReport &report, std::size_t offset,
               std::uint16_t value) {
  report[offset] = static_cast<std::uint8_t>(value & 0xff);
  report[offset + 1] = static_cast<std::uint8_t>((value >> 8) & 0xff);
}

void write_u32(CompanionReport &report, std::size_t offset,
               std::uint32_t value) {
  report[offset] = static_cast<std::uint8_t>(value & 0xff);
  report[offset + 1] = static_cast<std::uint8_t>((value >> 8) & 0xff);
  report[offset + 2] = static_cast<std::uint8_t>((value >> 16) & 0xff);
  report[offset + 3] = static_cast<std::uint8_t>((value >> 24) & 0xff);
}

std::uint32_t uptime_seconds(const CompanionRuntime &runtime) {
  const auto elapsed = std::chrono::steady_clock::now() - runtime.started_at;
  return static_cast<std::uint32_t>(
      std::chrono::duration_cast<std::chrono::seconds>(elapsed).count());
}

const VdsdControlControllerStatus *
first_connected(std::span<const VdsdControlControllerStatus> controllers) {
  for (const auto &controller : controllers) {
    if (controller.connected) {
      return &controller;
    }
  }
  return nullptr;
}

std::uint8_t controller_type_value(const std::string &db_path,
                                   const std::string &address) {
  try {
    const ConfigDb db = load_config_db(db_path);
    if (const ControllerConfig *config =
            find_controller_config_by_address(db, address)) {
      return config->profile == ControllerProfile::Dse ? 2 : 1;
    }
  } catch (const std::exception &) {
    // Fall through: report a plain DualSense when the db is unreadable.
  }
  return 1;
}

CompanionReport build_status_report(
    const CompanionRuntime &runtime, const std::string &db_path,
    std::span<const VdsdControlControllerStatus> controllers) {
  const CompanionSettings &settings = runtime.settings;
  const VdsdControlControllerStatus *connected = first_connected(controllers);

  CompanionReport report;
  write_header(report, kReportIdStatus);
  report[7] = connected != nullptr ? 1 : 0;
  report[8] = connected != nullptr
                  ? controller_type_value(db_path, connected->address)
                  : 0;
  report[9] = 255; // Battery percent unknown; worker state plumbing pending.
  report[10] = 0;  // Raw power state.
  report[11] = 0;  // Audio recent.
  report[12] = connected != nullptr ? 1 : 0; // Haptics ready.
  write_u16(report, 13, settings.haptics_gain_percent);
  report[15] = settings.led_enabled ? 1 : 0;
  report[16] = settings.idle_disconnect_enabled ? 1 : 0;
  write_u16(report, 17, runtime.settings_revision);
  report[19] = runtime.last_result_code;
  std::uint8_t status_flags = 0;
  if (settings.usb_suspend_disconnect_enabled) {
    status_flags |= 0x10;
  }
  if (settings.sleep_keybind_enabled) {
    status_flags |= 0x40;
  }
  report[20] = status_flags;
  write_u32(report, 21, uptime_seconds(runtime));
  report[25] = kFirmwareMajor;
  report[26] = kFirmwareMinor;
  report[27] = kFirmwarePatch;
  // Firmware capability flags: companion, dse, speaker volume, lightbar,
  // lightbar override, mute button actions, haptics buffer, adaptive
  // triggers. Declared up front; command wiring lands with the output-report
  // bridge.
  std::uint8_t firmware_flags = 0x01 | 0x04 | 0x08 | 0x10 | 0x20 | 0x40 | 0x80;
  if (report[8] == 2) {
    firmware_flags |= 0x02;
  }
  report[28] = firmware_flags;
  write_u16(report, 29, settings.speaker_volume_percent);
  report[31] = settings.lightbar_red;
  report[32] = settings.lightbar_green;
  report[33] = settings.lightbar_blue;
  report[34] = settings.lightbar_brightness_percent;
  write_u16(report, 43, settings.idle_disconnect_timeout_minutes);
  report[45] = 0; // Signal strength dBm.
  report[46] = 0; // Signal strength invalid until worker plumbing lands.
  report[47] = 0; // Adaptive trigger output recent.
  report[48] = settings.host_persona_mode;
  report[49] = 0x01; // Supported personas: DualSense only for now.
  report[51] = settings.mic_muted ? 1 : 0;
  report[57] = settings.speaker_gain_level;
  report[59] = settings.lightbar_override_enabled ? 1 : 0;
  report[60] = settings.mute_button_mode;
  report[61] = settings.mute_keyboard_usage;
  report[62] = settings.mute_keyboard_modifiers;
  report[63] = settings.quiet_mode_enabled ? 1 : 0;
  return report;
}

CompanionReport build_ack_report(const CompanionRuntime &runtime) {
  CompanionReport report;
  write_header(report, kReportIdAck);
  report[7] = runtime.last_command_id;
  report[8] = runtime.last_command_sequence;
  report[9] = runtime.last_result_code;
  report[10] = runtime.last_detail_code;
  write_u16(report, 11, runtime.settings_revision);
  write_u32(report, 13, uptime_seconds(runtime));
  return report;
}

constexpr auto kTriggerTestDuration = std::chrono::milliseconds(2500);
constexpr auto kRumbleTestDuration = std::chrono::milliseconds(650);

bool valid_trigger_test_mode(std::uint8_t mode) { return mode <= 2; }
bool valid_trigger_target(std::uint8_t target) { return target <= 2; }
bool valid_percent(std::uint8_t value) { return value <= 100; }

std::uint8_t apply_command(CompanionRuntime &runtime,
                           const CompanionReport &report, bool connected,
                           Logger &logger) {
  CompanionSettings &settings = runtime.settings;
  CompanionActuation &actuation = runtime.actuation;
  const std::uint8_t command_id = report[7];
  const std::uint16_t value =
      static_cast<std::uint16_t>(report[9] | (report[10] << 8));
  const auto now = std::chrono::steady_clock::now();

  switch (command_id) {
  case 0x01: // SET_HAPTICS_GAIN
    settings.haptics_gain_percent = std::min<std::uint16_t>(value, 1000);
    return kAckOk;
  case 0x02: // SET_LED_ENABLED
    settings.led_enabled = value != 0;
    return kAckOk;
  case 0x03: // SET_IDLE_DISCONNECT_ENABLED
    settings.idle_disconnect_enabled = value != 0;
    return kAckOk;
  case 0x05: // RESTORE_DEFAULTS
    settings = CompanionSettings{};
    actuation.persistent_trigger = {};
    actuation.test_trigger = {};
    actuation.test_rumble_active = false;
    return kAckOk;
  case 0x07: // SET_SPEAKER_VOLUME
    settings.speaker_volume_percent = std::min<std::uint16_t>(value, 100);
    return kAckOk;
  case 0x08: // SET_LIGHTBAR_COLOR (payload: r, g, b, brightness)
    settings.lightbar_red = report[11];
    settings.lightbar_green = report[12];
    settings.lightbar_blue = report[13];
    settings.lightbar_brightness_percent =
        std::min<std::uint8_t>(report[14], 100);
    return kAckOk;
  case 0x09: // SET_LIGHTBAR_OVERRIDE
    settings.lightbar_override_enabled = value != 0;
    return kAckOk;
  case 0x0A: // SET_MUTE_BUTTON_ACTION (value: mode; payload: usage, mods)
    if (value > 3) {
      return kAckErrInvalidValue;
    }
    settings.mute_button_mode = static_cast<std::uint8_t>(value);
    settings.mute_keyboard_usage = report[11];
    settings.mute_keyboard_modifiers = report[12];
    return kAckOk;
  case 0x0F: // SET_USB_SUSPEND_DISCONNECT_ENABLED
    settings.usb_suspend_disconnect_enabled = value != 0;
    return kAckOk;
  case 0x10: // SET_SLEEP_KEYBIND_ENABLED
    settings.sleep_keybind_enabled = value != 0;
    return kAckOk;
  case 0x1A: // SET_MIC_VOLUME (accepted; mic input is unsupported over BT)
    return kAckOk;
  case 0x1B: // SET_MIC_MUTE
    settings.mic_muted = value != 0;
    return kAckOk;
  case 0x1C: // SET_IDLE_DISCONNECT_TIMEOUT
    if (value == 0 || value > 600) {
      return kAckErrInvalidValue;
    }
    settings.idle_disconnect_timeout_minutes = value;
    return kAckOk;
  case 0x21: // SET_HOST_PERSONA (only DualSense supported)
    if (value != 0) {
      return kAckErrInvalidValue;
    }
    settings.host_persona_mode = 0;
    return kAckOk;
  case 0x0C: // SET_TRIGGER_EFFECT_INTENSITY
    if (value > 100) {
      return kAckErrInvalidValue;
    }
    settings.trigger_effect_intensity_percent = value;
    return kAckOk;
  case 0x13: // SET_CLASSIC_RUMBLE_GAIN
    settings.classic_rumble_gain_percent = std::min<std::uint16_t>(value, 400);
    return kAckOk;
  case 0x24: // SET_PLAYER_LED_ENABLED
    settings.player_led_enabled = value != 0;
    return kAckOk;
  // Settings accepted and stored by the app but not yet actuated here.
  case 0x0B: // SET_HAPTICS_BUFFER_LENGTH
  case 0x12: // SET_POLLING_RATE_MODE
  case 0x19: // SET_DUPLEX_ENABLED
  case 0x1D: // SET_SPEAKER_VOLUME_SHORTCUT_ENABLED
  case 0x1E: // SET_BUTTON_REMAP
  case 0x22: // SET_AUDIO_REACTIVE_HAPTICS
  case 0x23: // SET_CHORD_BINDINGS
  case 0x25: // SET_CLASSIC_RUMBLE_V1
  case 0x32: // SET_SPEAKER_GAIN
    return kAckOk;
  case 0x04:   // TEST_HAPTICS
  case 0x14: { // TEST_CLASSIC_RUMBLE
    if (!connected) {
      return kAckErrNotConnected;
    }
    actuation.test_rumble_active = true;
    actuation.test_rumble_power = 0xff;
    actuation.test_rumble_until = now + kRumbleTestDuration;
    return kAckOk;
  }
  case 0x0D: { // TEST_ADAPTIVE_TRIGGERS (value: mode | target << 8)
    const std::uint8_t mode = static_cast<std::uint8_t>(value & 0xff);
    const std::uint8_t target = static_cast<std::uint8_t>((value >> 8) & 0xff);
    if (!valid_trigger_test_mode(mode) || !valid_trigger_target(target)) {
      return kAckErrInvalidValue;
    }
    if (!connected) {
      return kAckErrNotConnected;
    }
    actuation.test_trigger = CompanionTriggerEffect{
        .active = true,
        .mode = mode,
        .target = target,
        .start_percent = 30,
        .wall_percent = 70,
        .force_percent =
            static_cast<std::uint8_t>(settings.trigger_effect_intensity_percent),
    };
    actuation.test_trigger_until = now + kTriggerTestDuration;
    return kAckOk;
  }
  case 0x1F:   // PREVIEW_ADAPTIVE_TRIGGER_EFFECT
  case 0x20: { // APPLY_ADAPTIVE_TRIGGER_EFFECT
    const std::uint8_t mode = static_cast<std::uint8_t>(value & 0xff);
    const std::uint8_t target = static_cast<std::uint8_t>((value >> 8) & 0xff);
    const std::uint8_t start_percent = report[11];
    const std::uint8_t wall_percent = report[12];
    const std::uint8_t force_percent = report[13];
    if (!valid_trigger_test_mode(mode) || !valid_trigger_target(target) ||
        !valid_percent(start_percent) || !valid_percent(wall_percent) ||
        !valid_percent(force_percent)) {
      return kAckErrInvalidValue;
    }
    if (!connected) {
      return kAckErrNotConnected;
    }
    const CompanionTriggerEffect effect{
        .active = command_id == 0x20 || force_percent > 0,
        .mode = mode,
        .target = target,
        .start_percent = start_percent,
        .wall_percent = wall_percent,
        .force_percent = force_percent,
    };
    if (command_id == 0x20) {
      actuation.persistent_trigger = effect;
    } else {
      actuation.test_trigger = effect;
      actuation.test_trigger_until = now + kTriggerTestDuration;
    }
    return kAckOk;
  }
  case 0x0E: // RESET_ADAPTIVE_TRIGGERS
    if (value != 0) {
      return kAckErrInvalidValue;
    }
    actuation.persistent_trigger = {};
    actuation.test_trigger = {};
    return kAckOk;
  case 0x11: // SLEEP_CONTROLLER
    return connected ? kAckOk : kAckErrNotConnected;
  default:
    logger.log("companion", LogLevel::Warn,
               "unknown companion command id " + std::to_string(command_id));
    return kAckErrUnknownCommand;
  }
}

std::string format_report_reply(const CompanionReport &report) {
  std::array<unsigned, kCompanionReportLength> values{};
  std::copy(report.begin(), report.end(), values.begin());
  std::string reply = "{";
  reply += jsonl_bool_field("OK", true);
  reply += ',';
  reply += jsonl_unsigned_array_field("report", values);
  reply += "}\n";
  return reply;
}

std::string format_ok_reply() {
  std::string reply = "{";
  reply += jsonl_bool_field("OK", true);
  reply += "}\n";
  return reply;
}

CompanionReport parse_report_field(std::span<const JsonlField> fields,
                                   std::string_view context) {
  const std::vector<unsigned> values =
      require_jsonl_unsigned_array(fields, "report", context);
  if (values.size() != kCompanionReportLength) {
    throw std::runtime_error("companion report must be 64 bytes");
  }
  CompanionReport report{};
  for (std::size_t i = 0; i < kCompanionReportLength; ++i) {
    report[i] = static_cast<std::uint8_t>(values[i] & 0xff);
  }
  return report;
}

std::uint8_t validate_command_report(const CompanionReport &report) {
  if (report[1] != 'D' || report[2] != 'S' || report[3] != '5' ||
      report[4] != 'B') {
    return kAckErrBadMagic;
  }
  if (report[5] != kCompanionProtocolMajor ||
      report[6] > kCompanionProtocolMinor) {
    return kAckErrBadVersion;
  }
  return kAckOk;
}

} // namespace

bool expire_companion_actuation(CompanionRuntime &runtime,
                                std::chrono::steady_clock::time_point now) {
  CompanionActuation &actuation = runtime.actuation;
  bool changed = false;
  if (actuation.test_rumble_active && now >= actuation.test_rumble_until) {
    actuation.test_rumble_active = false;
    changed = true;
  }
  if (actuation.test_trigger.active && now >= actuation.test_trigger_until) {
    actuation.test_trigger = {};
    changed = true;
  }
  if (changed) {
    ++actuation.version;
  }
  return changed;
}

std::optional<std::chrono::steady_clock::time_point>
next_companion_actuation_deadline(const CompanionRuntime &runtime) {
  const CompanionActuation &actuation = runtime.actuation;
  std::optional<std::chrono::steady_clock::time_point> deadline;
  if (actuation.test_rumble_active) {
    deadline = actuation.test_rumble_until;
  }
  if (actuation.test_trigger.active &&
      (!deadline || actuation.test_trigger_until < *deadline)) {
    deadline = actuation.test_trigger_until;
  }
  return deadline;
}

std::string handle_companion_control_request(
    std::span<const JsonlField> fields, CompanionRuntime &runtime,
    const std::string &db_path,
    std::span<const VdsdControlControllerStatus> controllers, Logger &logger) {
  constexpr std::string_view context = "companion control request";
  const std::string op = require_jsonl_string(fields, "op", context);

  if (op == "get") {
    static constexpr std::string_view expected[] = {
        "command",
        "op",
        "report_id",
    };
    reject_unknown_jsonl_fields(fields, expected, context);
    const std::vector<unsigned> report_id_values =
        require_jsonl_unsigned_array(fields, "report_id", context);
    if (report_id_values.size() != 1) {
      throw std::runtime_error("report_id must hold a single value");
    }
    const unsigned report_id = report_id_values.front();
    if (report_id == kReportIdStatus) {
      return format_report_reply(
          build_status_report(runtime, db_path, controllers));
    }
    if (report_id == kReportIdAck) {
      return format_report_reply(build_ack_report(runtime));
    }
    throw std::runtime_error("unsupported companion report id " +
                             std::to_string(report_id));
  }

  if (op == "set" || op == "write") {
    static constexpr std::string_view expected[] = {
        "command",
        "op",
        "report",
    };
    reject_unknown_jsonl_fields(fields, expected, context);
    const CompanionReport report = parse_report_field(fields, context);
    if (report[0] != kReportIdCommand) {
      throw std::runtime_error("unsupported companion output report id " +
                               std::to_string(report[0]));
    }
    runtime.last_command_id = report[7];
    runtime.last_command_sequence = report[8];
    runtime.last_detail_code = 0;
    const std::uint8_t header_result = validate_command_report(report);
    const bool connected = first_connected(controllers) != nullptr;
    runtime.last_result_code =
        header_result != kAckOk ? header_result
                                : apply_command(runtime, report, connected,
                                                logger);
    if (runtime.last_result_code == kAckOk) {
      ++runtime.settings_revision;
      ++runtime.actuation.version;
    }
    return format_ok_reply();
  }

  throw std::runtime_error("companion op must be get, set, or write");
}

} // namespace vds
