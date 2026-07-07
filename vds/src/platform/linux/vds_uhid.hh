// SPDX-License-Identifier: AGPL-3.0-only
// Userspace virtual DualSense HID device via /dev/uhid.
//
// Fallback backend for systems without the vds_hcd kernel module: exposes
// the controller as a USB DualSense HID device (input, output reports,
// feature reports). The USB audio interface cannot be emulated through
// uhid, so game-driven HD haptics and speaker routing are unavailable in
// this mode; games fall back to rumble emulation via output reports.
#pragma once

#include <cstdint>
#include <functional>
#include <optional>
#include <span>
#include <vector>

#include "unique_fd.hh"

namespace vds {

class Logger;

struct UhidOutputEvent {
  std::vector<std::uint8_t> data;
};

struct UhidGetReportEvent {
  std::uint32_t request_id = 0;
  std::uint8_t report_id = 0;
};

struct UhidSetReportEvent {
  std::uint32_t request_id = 0;
  std::uint8_t report_id = 0;
  std::vector<std::uint8_t> data;
};

class UhidDevice {
public:
  UhidDevice() = default;

  // Opens /dev/uhid; the device stays inert until create() is called.
  bool open(Logger &logger);
  bool is_open() const { return static_cast<bool>(fd_); }
  bool is_created() const { return created_; }
  int fd() const { return fd_.get(); }

  // Registers the virtual HID device. profile 2 = DualSense Edge,
  // anything else = DualSense.
  bool create(std::uint32_t profile, Logger &logger);
  void destroy(Logger &logger);

  // Sends a 64-byte USB input report (report id at byte 0).
  bool send_input(std::span<const std::uint8_t> report, Logger &logger);
  // Answers a pending UHID_GET_REPORT. Empty data reports an error.
  bool reply_get_report(std::uint32_t request_id,
                        std::span<const std::uint8_t> data, Logger &logger);
  bool reply_set_report(std::uint32_t request_id, std::uint16_t error,
                        Logger &logger);

  struct EventHandlers {
    std::function<void(UhidOutputEvent &&)> on_output;
    std::function<void(UhidGetReportEvent &&)> on_get_report;
    std::function<void(UhidSetReportEvent &&)> on_set_report;
  };

  // Drains all readable uhid events; returns false on fatal error.
  bool drain_events(const EventHandlers &handlers, Logger &logger);

private:
  UniqueFd fd_;
  bool created_ = false;
};

} // namespace vds
