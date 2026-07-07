// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jihong Min <hurryman2212@gmail.com>

#include <algorithm>
#include <array>
#include <cctype>
#include <chrono>
#include <condition_variable>
#include <cstddef>
#include <cstdint>
#include <deque>
#include <memory>
#include <mutex>
#include <optional>
#include <span>
#include <stdexcept>
#include <string>
#include <string_view>
#include <thread>
#include <utility>
#include <vector>

#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>

#include <bluetoothapis.h>
#include <hidsdi.h>
#include <setupapi.h>

#include "uapi/vds.h"
#include "unique_handle.hh"
#include "vds/ds5_protocol.h"
#include "vds_bt.hh"
#include "vds_common.hh"
#include "vds_io.hh"
#include "vds_profile.hh"
#include "vds_protocol.hh"
#include "vds_win32.hh"

namespace vds::win {

namespace {

using Clock = std::chrono::steady_clock;

constexpr std::uint8_t kBtHidpInputPrefix = 0xa1;
constexpr std::uint8_t kBtHidpOutputPrefix = VDS_BT_OUTPUT_PREFIX;
constexpr const char *kVdsFilterControlPath = R"(\\.\vds_filter)";
constexpr const char *kBtHidServiceUuid =
    "00001124-0000-1000-8000-00805f9b34fb";
constexpr const char *kHidDeviceClassRegistryPath =
    R"(SYSTEM\CurrentControlSet\Control\DeviceClasses\{4d1e55b2-f16f-11cf-88cb-001111000030})";
constexpr DWORD kDeviceShareMode =
    FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE;
constexpr std::size_t kMaxPendingHidOutputWrites = 64;
constexpr std::size_t kMaxQueuedHidAudioOutputWrites = 4;
constexpr DWORD kHidInputReadStallTimeoutMs = 2000;

class UniqueDeviceInfoSet {
public:
  UniqueDeviceInfoSet() = default;
  explicit UniqueDeviceInfoSet(HDEVINFO handle) : handle_(handle) {}
  ~UniqueDeviceInfoSet() { reset(); }

  UniqueDeviceInfoSet(const UniqueDeviceInfoSet &) = delete;
  UniqueDeviceInfoSet &operator=(const UniqueDeviceInfoSet &) = delete;

  HDEVINFO get() const { return handle_; }
  explicit operator bool() const { return handle_ != INVALID_HANDLE_VALUE; }

  void reset(HDEVINFO handle = INVALID_HANDLE_VALUE) {
    if (handle_ == handle) {
      return;
    }
    if (*this) {
      SetupDiDestroyDeviceInfoList(handle_);
    }
    handle_ = handle;
  }

private:
  HDEVINFO handle_ = INVALID_HANDLE_VALUE;
};

std::string lowercase_ascii(std::string_view text) {
  std::string lowered;
  lowered.reserve(text.size());
  for (const char c : text) {
    lowered.push_back(
        static_cast<char>(std::tolower(static_cast<unsigned char>(c))));
  }
  return lowered;
}

std::string compact_bluetooth_address(std::string_view address);

std::optional<unsigned> hex_nibble(char value) {
  if (value >= '0' && value <= '9') {
    return static_cast<unsigned>(value - '0');
  }
  if (value >= 'a' && value <= 'f') {
    return static_cast<unsigned>(value - 'a' + 10);
  }
  if (value >= 'A' && value <= 'F') {
    return static_cast<unsigned>(value - 'A' + 10);
  }
  return std::nullopt;
}

std::optional<std::uint64_t>
bluetooth_address_to_u64(std::string_view address) {
  const std::string compact = compact_bluetooth_address(address);
  if (compact.size() != 12) {
    return std::nullopt;
  }

  std::uint64_t value = 0;
  for (std::size_t index = 0; index < compact.size(); index += 2) {
    const auto high = hex_nibble(compact[index]);
    const auto low = hex_nibble(compact[index + 1]);
    if (!high || !low) {
      return std::nullopt;
    }
    value = (value << 8) | ((*high << 4) | *low);
  }
  return value;
}

std::optional<BLUETOOTH_DEVICE_INFO>
query_bluetooth_device_info(std::string_view address) {
  const auto parsed = bluetooth_address_to_u64(address);
  if (!parsed) {
    return std::nullopt;
  }

  BLUETOOTH_DEVICE_INFO info{};
  info.dwSize = sizeof(info);
  info.Address.ullLong = *parsed;
  const DWORD status = BluetoothGetDeviceInfo(nullptr, &info);
  if (status != ERROR_SUCCESS) {
    return std::nullopt;
  }
  return info;
}

std::string utf8_from_wide(const WCHAR *text) {
  if (text == nullptr || text[0] == L'\0') {
    return {};
  }

  const int required =
      WideCharToMultiByte(CP_UTF8, 0, text, -1, nullptr, 0, nullptr, nullptr);
  if (required <= 1) {
    return {};
  }

  std::string converted(static_cast<std::size_t>(required - 1), '\0');
  const int written = WideCharToMultiByte(
      CP_UTF8, 0, text, -1, converted.data(), required, nullptr, nullptr);
  if (written <= 1) {
    return {};
  }
  return converted;
}

std::string default_bluetooth_device_name(std::uint32_t profile) {
  if (profile == VDS_PROFILE_DSE) {
    return "DualSense Edge Wireless Controller";
  }
  return "DualSense Wireless Controller";
}

std::size_t bluetooth_feature_report_length(std::uint8_t report_id) {
  switch (report_id) {
  case 0x05:
    return 41;
  case 0x09:
    return 20;
  case 0x20:
    return 64;
  default:
    return 64;
  }
}

std::string compact_bluetooth_address(std::string_view address) {
  std::string compact;
  compact.reserve(address.size());
  for (const char c : address) {
    if (std::isxdigit(static_cast<unsigned char>(c))) {
      compact.push_back(
          static_cast<char>(std::tolower(static_cast<unsigned char>(c))));
    }
  }
  return compact;
}

bool is_compact_bluetooth_address(std::string_view address) {
  return address.size() == 12 &&
         std::all_of(address.begin(), address.end(),
                     [](unsigned char ch) { return std::isxdigit(ch) != 0; });
}

bool is_colon_bluetooth_address(std::string_view address) {
  if (address.size() != 17) {
    return false;
  }
  for (std::size_t index = 0; index < address.size(); ++index) {
    const bool separator =
        index == 2 || index == 5 || index == 8 || index == 11 || index == 14;
    if (separator) {
      if (address[index] != ':') {
        return false;
      }
      continue;
    }
    if (std::isxdigit(static_cast<unsigned char>(address[index])) == 0) {
      return false;
    }
  }
  return true;
}

bool is_bluetooth_address(std::string_view address) {
  return is_compact_bluetooth_address(address) ||
         is_colon_bluetooth_address(address);
}

std::string colon_bluetooth_address(std::string_view compact_address) {
  std::string address;
  address.reserve(17);
  for (std::size_t index = 0; index < compact_address.size() && index < 12;
       ++index) {
    if (index != 0 && index % 2 == 0) {
      address.push_back(':');
    }
    address.push_back(static_cast<char>(
        std::tolower(static_cast<unsigned char>(compact_address[index]))));
  }
  return address;
}

std::optional<std::string>
device_path_from_device_class_key_name(std::string_view key_name) {
  constexpr std::string_view prefix = "##?#";
  if (key_name.rfind(prefix, 0) != 0) {
    return std::nullopt;
  }

  std::string path = R"(\\?\)";
  path += key_name.substr(prefix.size());
  return path;
}

std::string describe_direct_hid_path(std::string_view path) {
  UniqueHandle query_handle(
      CreateFileA(std::string(path).c_str(), 0, kDeviceShareMode, nullptr,
                  OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr));
  if (!query_handle) {
    return "open=" + win32_error_message(GetLastError());
  }

  HIDD_ATTRIBUTES attributes{};
  attributes.Size = sizeof(attributes);
  if (!HidD_GetAttributes(query_handle.get(), &attributes)) {
    return "attrs=" + win32_error_message(GetLastError());
  }

  return "attrs vid=" + vds::hex_u16(attributes.VendorID) +
         " pid=" + vds::hex_u16(attributes.ProductID);
}

void append_registry_lookup_diagnostics(std::string &text,
                                        std::string_view address_filter) {
  HKEY key = nullptr;
  const LSTATUS open_status =
      RegOpenKeyExA(HKEY_LOCAL_MACHINE, kHidDeviceClassRegistryPath, 0,
                    KEY_ENUMERATE_SUB_KEYS, &key);
  if (open_status != ERROR_SUCCESS) {
    text += " registry=open ";
    text += win32_error_message(static_cast<DWORD>(open_status));
    return;
  }

  DWORD candidate_count = 0;
  DWORD reported_count = 0;
  for (DWORD index = 0;; ++index) {
    std::array<char, 1024> name{};
    DWORD name_size = static_cast<DWORD>(name.size());
    const LSTATUS enum_status =
        RegEnumKeyExA(key, index, name.data(), &name_size, nullptr, nullptr,
                      nullptr, nullptr);
    if (enum_status == ERROR_NO_MORE_ITEMS) {
      break;
    }
    if (enum_status != ERROR_SUCCESS) {
      continue;
    }

    const std::string_view key_name(name.data(), name_size);
    const std::string lower = lowercase_ascii(key_name);
    if (lower.find(kBtHidServiceUuid) == std::string::npos ||
        lower.find("0002054c") == std::string::npos ||
        (lower.find("0df2") == std::string::npos &&
         lower.find("0ce6") == std::string::npos)) {
      continue;
    }
    ++candidate_count;
    if (reported_count >= 4) {
      continue;
    }
    ++reported_count;

    text += " registry_candidate=";
    text += lower;
    if (!address_filter.empty() &&
        lower.find(address_filter) == std::string::npos) {
      text += " address=no";
    } else {
      text += " address=yes";
    }
    if (const auto path = device_path_from_device_class_key_name(key_name)) {
      text += " ";
      text += describe_direct_hid_path(*path);
    }
  }
  RegCloseKey(key);

  text += " registry_candidate_count=";
  text += std::to_string(candidate_count);
}

std::string address_from_filter_info(const vds_filter_device_info &info) {
  const char *begin = info.address;
  const char *end = begin + sizeof(info.address);
  const char *zero = std::find(begin, end, '\0');
  return std::string(begin, zero);
}

Frame make_bluetooth_frame(std::uint16_t type,
                           std::span<const std::uint8_t> payload,
                           std::uint64_t sequence) {
  Frame frame;
  frame.header.type = type;
  frame.header.length = static_cast<std::uint32_t>(payload.size());
  frame.header.sequence = sequence;
  frame.payload.assign(payload.begin(), payload.end());
  return frame;
}

class HidBluetoothTransport final : public BluetoothTransport {
public:
  HidBluetoothTransport(std::string path, std::string match_label)
      : path_(std::move(path)), match_label_(std::move(match_label)),
        handle_(open_hid_device(path_, true)),
        output_handle_(open_hid_device(path_, true)),
        feature_handle_(open_hid_device(path_, false)),
        queue_event_(CreateEventA(nullptr, TRUE, FALSE, nullptr)),
        stop_event_(CreateEventA(nullptr, TRUE, FALSE, nullptr)) {
    if (!queue_event_ || !stop_event_) {
      throw std::runtime_error("failed to create HID transport events: " +
                               win32_error_message(GetLastError()));
    }
    load_caps();
    output_thread_ = std::thread([this] { output_writer_loop(); });
  }

  ~HidBluetoothTransport() override { stop_output_writer(); }

  Frame read_frame() override {
    if (auto frame = pop_queued_frame()) {
      return *frame;
    }
    return read_input_frame();
  }

  std::optional<std::vector<std::uint8_t>>
  read_feature_report(std::uint8_t report_id) override {
    return get_feature_report(report_id);
  }

  void write_feature_report(std::span<const std::uint8_t> report) override {
    set_feature_report(report);
  }

  void write_interrupt_packet(std::span<const std::uint8_t> packet) override {
    if (!try_write_interrupt_packet(packet)) {
      throw std::runtime_error("HID output queue full");
    }
    wait_for_output_idle();
  }

  bool
  try_write_interrupt_packet(std::span<const std::uint8_t> packet) override {
    if (packet.empty() || packet[0] != kBtHidpOutputPrefix) {
      throw std::runtime_error("unsupported HIDP interrupt packet");
    }
    return enqueue_output_report(packet.subspan(1));
  }

  std::optional<std::string> take_output_diagnostics(bool force) override {
    std::lock_guard guard(output_mutex_);
    if (!force && !output_diagnostic_pending_) {
      return std::nullopt;
    }
    if (output_queued_since_diagnostic_ == 0 &&
        output_completed_since_diagnostic_ == 0 &&
        output_rejected_since_diagnostic_ == 0 &&
        output_audio_coalesced_since_diagnostic_ == 0 &&
        output_error_.empty()) {
      return std::nullopt;
    }

    std::string message =
        "hid output writer queued=" + std::to_string(output_queued_count_) +
        " completed=" + std::to_string(output_completed_count_) +
        " rejected=" + std::to_string(output_rejected_count_) +
        " audio_coalesced=" + std::to_string(output_audio_coalesced_count_) +
        " queued_delta=" + std::to_string(output_queued_since_diagnostic_) +
        " completed_delta=" +
        std::to_string(output_completed_since_diagnostic_) +
        " rejected_delta=" + std::to_string(output_rejected_since_diagnostic_) +
        " audio_coalesced_delta=" +
        std::to_string(output_audio_coalesced_since_diagnostic_) +
        " pending=" + std::to_string(output_queue_.size());
    if (!output_error_.empty()) {
      message += " error=" + output_error_;
    }

    output_diagnostic_pending_ = false;
    output_queued_since_diagnostic_ = 0;
    output_completed_since_diagnostic_ = 0;
    output_rejected_since_diagnostic_ = 0;
    output_audio_coalesced_since_diagnostic_ = 0;
    return message;
  }

  void cancel() override {
    SetEvent(stop_event_.get());
    SetEvent(queue_event_.get());
    CancelIoEx(handle_.get(), nullptr);
    stop_output_writer();
  }

  std::string description() const override {
    return "hid:" + match_label_ + " " + path_;
  }

private:
  struct QueuedOutputWrite {
    std::vector<std::uint8_t> buffer;
  };

  static UniqueHandle open_hid_device(const std::string &path,
                                      bool overlapped) {
    UniqueHandle handle(
        CreateFileA(path.c_str(), GENERIC_READ | GENERIC_WRITE,
                    kDeviceShareMode, nullptr, OPEN_EXISTING,
                    overlapped ? FILE_ATTRIBUTE_NORMAL | FILE_FLAG_OVERLAPPED
                               : FILE_ATTRIBUTE_NORMAL,
                    nullptr));
    if (!handle) {
      throw std::runtime_error("failed to open HID device " + path + ": " +
                               win32_error_message(GetLastError()));
    }
    return handle;
  }

  void load_caps() {
    PHIDP_PREPARSED_DATA preparsed = nullptr;
    if (!HidD_GetPreparsedData(handle_.get(), &preparsed)) {
      throw std::runtime_error("HidD_GetPreparsedData failed for " + path_ +
                               ": " + win32_error_message(GetLastError()));
    }

    HIDP_CAPS caps{};
    const NTSTATUS status = HidP_GetCaps(preparsed, &caps);
    HidD_FreePreparsedData(preparsed);
    if (status != HIDP_STATUS_SUCCESS) {
      throw std::runtime_error("HidP_GetCaps failed for " + path_);
    }
    input_report_length_ = caps.InputReportByteLength;
    output_report_length_ = caps.OutputReportByteLength;
    feature_report_length_ = caps.FeatureReportByteLength;
    if (input_report_length_ == 0 || output_report_length_ == 0 ||
        feature_report_length_ == 0) {
      throw std::runtime_error("HID device has incomplete report caps: " +
                               path_);
    }
  }

  DWORD overlapped_io(HANDLE handle, bool write, std::uint8_t *data,
                      std::size_t size, std::string_view label) {
    UniqueHandle event(CreateEventA(nullptr, TRUE, FALSE, nullptr));
    if (!event) {
      throw std::runtime_error(std::string(label) + " event failed: " +
                               win32_error_message(GetLastError()));
    }

    OVERLAPPED overlapped{};
    overlapped.hEvent = event.get();
    DWORD bytes_returned = 0;
    const BOOL started = write
                             ? WriteFile(handle, data, static_cast<DWORD>(size),
                                         nullptr, &overlapped)
                             : ReadFile(handle, data, static_cast<DWORD>(size),
                                        nullptr, &overlapped);
    if (!started) {
      const DWORD error = GetLastError();
      if (error != ERROR_IO_PENDING) {
        throw std::runtime_error(std::string(label) +
                                 " failed: " + win32_error_message(error));
      }
    }

    HANDLE wait_handles[2] = {event.get(), stop_event_.get()};
    const DWORD wait_result =
        WaitForMultipleObjects(2, wait_handles, FALSE, INFINITE);
    if (wait_result == WAIT_OBJECT_0 + 1) {
      CancelIoEx(handle, &overlapped);
      (void)GetOverlappedResult(handle, &overlapped, &bytes_returned, TRUE);
      throw std::runtime_error(std::string(label) + " stopped");
    }
    if (wait_result != WAIT_OBJECT_0) {
      throw std::runtime_error(std::string(label) + " wait failed: " +
                               win32_error_message(GetLastError()));
    }
    if (!GetOverlappedResult(handle, &overlapped, &bytes_returned, FALSE)) {
      throw std::runtime_error(std::string(label) + " completion failed: " +
                               win32_error_message(GetLastError()));
    }
    return bytes_returned;
  }

  void push_queued_frame(std::uint16_t type,
                         std::span<const std::uint8_t> payload) {
    std::lock_guard guard(queue_mutex_);
    queued_frames_.push_back(make_bluetooth_frame(type, payload, ++sequence_));
    SetEvent(queue_event_.get());
  }

  std::optional<Frame> pop_queued_frame() {
    std::lock_guard guard(queue_mutex_);
    if (queued_frames_.empty()) {
      ResetEvent(queue_event_.get());
      return std::nullopt;
    }
    Frame frame = std::move(queued_frames_.front());
    queued_frames_.pop_front();
    if (queued_frames_.empty()) {
      ResetEvent(queue_event_.get());
    }
    return frame;
  }

  Frame read_input_frame() {
    UniqueHandle event(CreateEventA(nullptr, TRUE, FALSE, nullptr));
    if (!event) {
      throw std::runtime_error("failed to create HID read event: " +
                               win32_error_message(GetLastError()));
    }

    std::vector<std::uint8_t> report(input_report_length_);
    OVERLAPPED overlapped{};
    overlapped.hEvent = event.get();
    if (!ReadFile(handle_.get(), report.data(),
                  static_cast<DWORD>(report.size()), nullptr, &overlapped)) {
      const DWORD error = GetLastError();
      if (error != ERROR_IO_PENDING) {
        throw std::runtime_error("HID read failed: " +
                                 win32_error_message(error));
      }
    }

    for (;;) {
      HANDLE wait_handles[3] = {event.get(), queue_event_.get(),
                                stop_event_.get()};
      const DWORD wait_result = WaitForMultipleObjects(
          3, wait_handles, FALSE, kHidInputReadStallTimeoutMs);
      if (wait_result == WAIT_OBJECT_0) {
        DWORD transferred = 0;
        if (!GetOverlappedResult(handle_.get(), &overlapped, &transferred,
                                 FALSE)) {
          throw std::runtime_error("HID read completion failed: " +
                                   win32_error_message(GetLastError()));
        }
        if (transferred == 0) {
          throw std::runtime_error("HID read returned zero bytes");
        }
        report.resize(transferred);
        report.insert(report.begin(), kBtHidpInputPrefix);
        return make_bluetooth_frame(VDS_FRAME_BT_INTERRUPT_PACKET, report,
                                    ++sequence_);
      }
      if (wait_result == WAIT_OBJECT_0 + 1) {
        if (auto frame = pop_queued_frame()) {
          DWORD transferred = 0;
          CancelIoEx(handle_.get(), &overlapped);
          (void)GetOverlappedResult(handle_.get(), &overlapped, &transferred,
                                    TRUE);
          return *frame;
        }
        continue;
      }
      if (wait_result == WAIT_OBJECT_0 + 2) {
        DWORD transferred = 0;
        CancelIoEx(handle_.get(), &overlapped);
        (void)GetOverlappedResult(handle_.get(), &overlapped, &transferred,
                                  TRUE);
        throw std::runtime_error("HID read stopped");
      }
      if (wait_result == WAIT_TIMEOUT) {
        DWORD transferred = 0;
        CancelIoEx(handle_.get(), &overlapped);
        (void)GetOverlappedResult(handle_.get(), &overlapped, &transferred,
                                  TRUE);
        throw std::runtime_error("HID read timed out after " +
                                 std::to_string(kHidInputReadStallTimeoutMs) +
                                 "ms");
      }
      throw std::runtime_error("HID read wait failed: " +
                               win32_error_message(GetLastError()));
    }
  }

  std::vector<std::uint8_t> get_feature_report(std::uint8_t report_id) {
    std::vector<std::uint8_t> buffer(feature_report_length_);
    buffer[0] = report_id;
    if (!HidD_GetFeature(feature_handle_.get(), buffer.data(),
                         static_cast<ULONG>(buffer.size()))) {
      throw std::runtime_error(
          "HidD_GetFeature report=" + std::to_string(report_id) +
          " failed: " + win32_error_message(GetLastError()));
    }
    return buffer;
  }

  void set_feature_report(std::span<const std::uint8_t> report) {
    if (report.empty()) {
      throw std::runtime_error("empty HID feature report");
    }
    if (report.size() > feature_report_length_) {
      throw std::runtime_error(
          "HID feature report too large: " + std::to_string(report.size()) +
          " > " + std::to_string(feature_report_length_));
    }

    std::vector<std::uint8_t> buffer(feature_report_length_);
    std::copy(report.begin(), report.end(), buffer.begin());
    fill_feature_report_checksum(buffer);
    if (!HidD_SetFeature(feature_handle_.get(), buffer.data(),
                         static_cast<ULONG>(buffer.size()))) {
      throw std::runtime_error(
          "HidD_SetFeature report=" + std::to_string(buffer[0]) +
          " failed: " + win32_error_message(GetLastError()));
    }
  }

  QueuedOutputWrite make_output_write(std::span<const std::uint8_t> report) {
    if (report.size() > output_report_length_) {
      throw std::runtime_error(
          "HID output report too large: " + std::to_string(report.size()) +
          " > " + std::to_string(output_report_length_));
    }
    std::vector<std::uint8_t> buffer(output_report_length_);
    std::copy(report.begin(), report.end(), buffer.begin());
    return QueuedOutputWrite{std::move(buffer)};
  }

  bool enqueue_output_report(std::span<const std::uint8_t> report) {
    QueuedOutputWrite write = make_output_write(report);
    const bool is_audio_report =
        !write.buffer.empty() && write.buffer[0] == VDS_BT_HAPTICS_REPORT_ID;

    {
      std::lock_guard guard(output_mutex_);
      if (!output_error_.empty()) {
        throw std::runtime_error(output_error_);
      }
      const auto is_queued_audio = [](const QueuedOutputWrite &queued_write) {
        return !queued_write.buffer.empty() &&
               queued_write.buffer[0] == VDS_BT_HAPTICS_REPORT_ID;
      };
      const auto coalesce_oldest_audio = [&] {
        const auto oldest = std::find_if(output_queue_.begin(),
                                         output_queue_.end(), is_queued_audio);
        if (oldest == output_queue_.end()) {
          return false;
        }
        output_queue_.erase(oldest);
        ++output_audio_coalesced_count_;
        ++output_audio_coalesced_since_diagnostic_;
        output_diagnostic_pending_ = true;
        return true;
      };
      if (is_audio_report) {
        std::size_t queued_audio = 0;
        for (const auto &queued_write : output_queue_) {
          if (is_queued_audio(queued_write)) {
            ++queued_audio;
          }
        }
        while (queued_audio >= kMaxQueuedHidAudioOutputWrites) {
          if (!coalesce_oldest_audio()) {
            break;
          }
          --queued_audio;
        }
      }
      if (output_queue_.size() >= kMaxPendingHidOutputWrites) {
        if (!is_audio_report || !coalesce_oldest_audio()) {
          ++output_rejected_count_;
          ++output_rejected_since_diagnostic_;
          output_diagnostic_pending_ = true;
          return false;
        }
      }
      if (output_queue_.size() >= kMaxPendingHidOutputWrites) {
        ++output_rejected_count_;
        ++output_rejected_since_diagnostic_;
        output_diagnostic_pending_ = true;
        return false;
      }
      output_queue_.push_back(std::move(write));
      ++output_queued_count_;
      ++output_queued_since_diagnostic_;
      output_diagnostic_pending_ = true;
    }
    output_cv_.notify_one();
    return true;
  }

  void wait_for_output_idle() {
    std::unique_lock lock(output_mutex_);
    output_cv_.wait(lock, [this] {
      return output_stop_requested_ || !output_error_.empty() ||
             (output_queue_.empty() && !output_write_active_);
    });
    if (!output_error_.empty()) {
      throw std::runtime_error(output_error_);
    }
  }

  void output_writer_loop() {
    for (;;) {
      QueuedOutputWrite write;
      {
        std::unique_lock lock(output_mutex_);
        output_cv_.wait(lock, [this] {
          return output_stop_requested_ || !output_queue_.empty();
        });
        if (output_stop_requested_) {
          return;
        }
        write = std::move(output_queue_.front());
        output_queue_.pop_front();
        output_write_active_ = true;
      }

      try {
        std::size_t offset = 0;
        while (offset < write.buffer.size()) {
          const DWORD written = overlapped_io(
              output_handle_.get(), true, write.buffer.data() + offset,
              write.buffer.size() - offset, "HID output write");
          if (written == 0) {
            throw std::runtime_error("HID output write returned zero bytes");
          }
          offset += written;
        }
      } catch (const std::exception &error) {
        std::lock_guard guard(output_mutex_);
        output_error_ = error.what();
        output_write_active_ = false;
        output_diagnostic_pending_ = true;
        output_cv_.notify_all();
        return;
      }

      {
        std::lock_guard guard(output_mutex_);
        output_write_active_ = false;
        ++output_completed_count_;
        ++output_completed_since_diagnostic_;
        output_diagnostic_pending_ = true;
      }
      output_cv_.notify_all();
    }
  }

  void stop_output_writer() {
    {
      std::lock_guard guard(output_mutex_);
      if (output_stop_requested_) {
        return;
      }
      output_stop_requested_ = true;
      output_queue_.clear();
    }
    SetEvent(stop_event_.get());
    output_cv_.notify_all();
    CancelIoEx(output_handle_.get(), nullptr);
    if (output_thread_.joinable()) {
      output_thread_.join();
    }
  }

  std::string path_;
  std::string match_label_;
  UniqueHandle handle_;
  UniqueHandle output_handle_;
  UniqueHandle feature_handle_;
  UniqueHandle queue_event_;
  UniqueHandle stop_event_;
  USHORT input_report_length_ = 0;
  USHORT output_report_length_ = 0;
  USHORT feature_report_length_ = 0;
  std::mutex queue_mutex_;
  std::deque<Frame> queued_frames_;
  std::uint64_t sequence_ = 0;
  std::mutex output_mutex_;
  std::condition_variable output_cv_;
  std::deque<QueuedOutputWrite> output_queue_;
  std::thread output_thread_;
  std::string output_error_;
  std::uint64_t output_queued_count_ = 0;
  std::uint64_t output_completed_count_ = 0;
  std::uint64_t output_rejected_count_ = 0;
  std::uint64_t output_audio_coalesced_count_ = 0;
  std::uint64_t output_queued_since_diagnostic_ = 0;
  std::uint64_t output_completed_since_diagnostic_ = 0;
  std::uint64_t output_rejected_since_diagnostic_ = 0;
  std::uint64_t output_audio_coalesced_since_diagnostic_ = 0;
  bool output_stop_requested_ = false;
  bool output_write_active_ = false;
  bool output_diagnostic_pending_ = false;
};

std::optional<std::string>
hid_device_path_matches(const std::string &path,
                        const std::string &address_filter,
                        bool require_bluetooth_path_metadata) {
  const std::string lower_path = lowercase_ascii(path);
  if (require_bluetooth_path_metadata &&
      lower_path.find(kBtHidServiceUuid) == std::string::npos) {
    return std::nullopt;
  }

  UniqueHandle query_handle(CreateFileA(path.c_str(), 0, kDeviceShareMode,
                                        nullptr, OPEN_EXISTING,
                                        FILE_ATTRIBUTE_NORMAL, nullptr));
  if (!query_handle) {
    return std::nullopt;
  }

  HIDD_ATTRIBUTES attributes{};
  attributes.Size = sizeof(attributes);
  if (!HidD_GetAttributes(query_handle.get(), &attributes)) {
    return std::nullopt;
  }
  if (attributes.VendorID != VDS_SONY_VENDOR_ID ||
      (attributes.ProductID != VDS_DS5_PRODUCT_ID &&
       attributes.ProductID != VDS_DSE_PRODUCT_ID)) {
    return std::nullopt;
  }

  PHIDP_PREPARSED_DATA preparsed = nullptr;
  if (!HidD_GetPreparsedData(query_handle.get(), &preparsed)) {
    return std::nullopt;
  }
  HIDP_CAPS caps{};
  const NTSTATUS caps_status = HidP_GetCaps(preparsed, &caps);
  HidD_FreePreparsedData(preparsed);
  if (caps_status != HIDP_STATUS_SUCCESS || caps.UsagePage != 0x01 ||
      caps.Usage != 0x05) {
    return std::nullopt;
  }

  if (require_bluetooth_path_metadata && !address_filter.empty() &&
      lower_path.find(address_filter) == std::string::npos) {
    return std::nullopt;
  }
  return path;
}

std::string find_hid_bluetooth_device_path(const std::string &address) {
  const std::string address_filter = compact_bluetooth_address(address);
  if (!address_filter.empty()) {
    const std::string filter_path = R"(\\.\vds_filter_)" + address_filter;
    if (auto path =
            hid_device_path_matches(filter_path, std::string{}, false)) {
      return *path;
    }
  }

  GUID hid_guid{};
  HidD_GetHidGuid(&hid_guid);

  UniqueDeviceInfoSet devices(SetupDiGetClassDevsA(
      &hid_guid, nullptr, nullptr, DIGCF_PRESENT | DIGCF_DEVICEINTERFACE));
  if (!devices) {
    throw std::runtime_error("SetupDiGetClassDevs(HID) failed: " +
                             win32_error_message(GetLastError()));
  }

  std::optional<std::string> first_match;
  std::size_t match_count = 0;
  for (DWORD index = 0;; ++index) {
    SP_DEVICE_INTERFACE_DATA interface_data{};
    interface_data.cbSize = sizeof(interface_data);
    if (!SetupDiEnumDeviceInterfaces(devices.get(), nullptr, &hid_guid, index,
                                     &interface_data)) {
      const DWORD error = GetLastError();
      if (error == ERROR_NO_MORE_ITEMS) {
        break;
      }
      throw std::runtime_error("SetupDiEnumDeviceInterfaces(HID) failed: " +
                               win32_error_message(error));
    }

    DWORD required = 0;
    SetupDiGetDeviceInterfaceDetailA(devices.get(), &interface_data, nullptr, 0,
                                     &required, nullptr);
    if (required == 0) {
      continue;
    }

    std::vector<std::uint8_t> detail_buffer(required);
    auto *detail = reinterpret_cast<PSP_DEVICE_INTERFACE_DETAIL_DATA_A>(
        detail_buffer.data());
    detail->cbSize = sizeof(SP_DEVICE_INTERFACE_DETAIL_DATA_A);
    if (!SetupDiGetDeviceInterfaceDetailA(devices.get(), &interface_data,
                                          detail, required, nullptr, nullptr)) {
      continue;
    }

    if (auto path =
            hid_device_path_matches(detail->DevicePath, std::string{}, true)) {
      if (!first_match) {
        first_match = *path;
      }
      ++match_count;
    }
  }

  if (!first_match) {
    throw std::runtime_error("no DualSense HID interface found for address=" +
                             address);
  }
  if (match_count > 1) {
    throw std::runtime_error(
        "multiple DualSense HID interfaces found and no address-specific "
        "vds_filter path was usable");
  }
  return *first_match;
}

UniqueHandle open_filter_control_handle() {
  UniqueHandle handle(CreateFileA(kVdsFilterControlPath, GENERIC_READ,
                                  kDeviceShareMode, nullptr, OPEN_EXISTING,
                                  FILE_ATTRIBUTE_NORMAL, nullptr));
  if (handle) {
    return handle;
  }

  const DWORD error = GetLastError();
  if (error == ERROR_FILE_NOT_FOUND || error == ERROR_PATH_NOT_FOUND) {
    return UniqueHandle();
  }
  throw std::runtime_error("failed to open " +
                           std::string(kVdsFilterControlPath) + ": " +
                           win32_error_message(error));
}

} // namespace

std::unique_ptr<BluetoothTransport>
make_filter_bluetooth_transport(const std::string &address) {
  auto device = find_filter_bluetooth_device(address);
  if (!device) {
    throw std::runtime_error("no matching Windows Bluetooth transport");
  }
  if (device->filter_backed && device->report_target &&
      device->access_restricted) {
    return std::make_unique<HidBluetoothTransport>(
        find_hid_bluetooth_device_path(device->address), device->address);
  }
  throw std::runtime_error("Windows Bluetooth transport has no usable backend");
}

bool filter_provider_available() {
  return static_cast<bool>(open_filter_control_handle());
}

std::vector<HidBluetoothDevice> list_filter_bluetooth_devices() {
  std::vector<HidBluetoothDevice> devices;
  UniqueHandle handle = open_filter_control_handle();
  if (!handle) {
    return devices;
  }

  vds_filter_device_list list{};
  DWORD bytes_returned = 0;
  if (!DeviceIoControl(handle.get(), VDS_FILTER_IOCTL_GET_DEVICES, nullptr, 0,
                       &list, sizeof(list), &bytes_returned, nullptr)) {
    throw std::runtime_error("failed to query " +
                             std::string(kVdsFilterControlPath) + ": " +
                             win32_error_message(GetLastError()));
  }
  if (bytes_returned != sizeof(list) ||
      list.version != VDS_FILTER_DEVICE_LIST_VERSION ||
      list.size != sizeof(list)) {
    throw std::runtime_error("invalid vds_filter device list reply");
  }

  const std::uint32_t count =
      std::min<std::uint32_t>(list.count, VDS_FILTER_MAX_DEVICES);
  devices.reserve(count);
  for (std::uint32_t index = 0; index < count; ++index) {
    const std::string address = address_from_filter_info(list.devices[index]);
    const auto info = query_bluetooth_device_info(address);
    std::string name = info ? utf8_from_wide(info->szName) : std::string{};
    if (name.empty()) {
      name = default_bluetooth_device_name(list.devices[index].profile);
    }
    devices.push_back(HidBluetoothDevice{
        .path = address,
        .address = address,
        .name = std::move(name),
        .profile = list.devices[index].profile,
        .profile_valid = true,
        .filter_backed = true,
        .bluetooth_connected = info && info->fConnected != FALSE,
        .report_target =
            (list.devices[index].flags & VDS_FILTER_DEVICE_REPORT_TARGET) != 0,
        .access_restricted = (list.devices[index].flags &
                              VDS_FILTER_DEVICE_ACCESS_RESTRICTED) != 0,
    });
  }
  return devices;
}

std::optional<HidBluetoothDevice>
find_filter_bluetooth_device(const std::string &address) {
  if (!is_bluetooth_address(address)) {
    return std::nullopt;
  }
  const std::string address_filter = compact_bluetooth_address(address);
  std::vector<HidBluetoothDevice> devices = list_filter_bluetooth_devices();

  for (auto &device : devices) {
    if (!device.bluetooth_connected) {
      continue;
    }
    if (!device.filter_backed) {
      continue;
    }
    if (!device.report_target) {
      continue;
    }
    if (!device.access_restricted) {
      continue;
    }
    if (compact_bluetooth_address(device.address) == address_filter) {
      return device;
    }
  }

  return std::nullopt;
}

std::string describe_bluetooth_lookup(const std::string &address) {
  const bool valid_address = is_bluetooth_address(address);
  const std::string address_filter =
      valid_address ? compact_bluetooth_address(address) : std::string{};
  std::string text = "lookup address=" + address;
  if (valid_address) {
    text += " address_type=valid";
  } else {
    text += " address_type=invalid";
  }
  try {
    const auto devices = list_filter_bluetooth_devices();
    text += " filter_count=" + std::to_string(devices.size());
    for (const auto &device : devices) {
      text += " filter_device=";
      text += device.address;
      text += " path=";
      text += device.path;
      text += " connected=";
      text += device.bluetooth_connected ? "yes" : "no";
      text += " report_target=";
      text += device.report_target ? "yes" : "no";
      text += " access_restricted=";
      text += device.access_restricted ? "yes" : "no";
      text += " profile=";
      if (device.profile_valid) {
        text += vds::usb_profile_name(device.profile);
      } else {
        text += "unknown";
      }
      if (device.filter_backed) {
        text += " backend=hidclass";
      } else {
        text += " backend=hid";
      }
    }
  } catch (const std::exception &error) {
    text += " filter_error=";
    text += error.what();
  }
  append_registry_lookup_diagnostics(text, address_filter);
  return text;
}

} // namespace vds::win
