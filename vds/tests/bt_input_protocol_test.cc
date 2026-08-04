// Verifies Bluetooth DualSense control input framing, CRC validation, and
// translation to the existing 64-byte virtual USB report.
#include <array>
#include <cassert>
#include <cstdint>
#include <cstdio>

#include "vds_protocol.hh"

namespace {

constexpr std::size_t kPacketSize = 79; // HIDP A1 prefix + 78-byte report.
constexpr std::size_t kCrcOffset = kPacketSize - 4;

std::uint32_t crc32(std::span<const std::uint8_t> bytes) {
  std::uint32_t crc = 0xffffffffu;
  for (const std::uint8_t byte : bytes) {
    crc ^= byte;
    for (unsigned bit = 0; bit < 8; ++bit) {
      crc = (crc >> 1) ^ (0xedb88320u & (0u - (crc & 1u)));
    }
  }
  return ~crc;
}

void fill_crc(std::array<std::uint8_t, kPacketSize> &packet) {
  const std::uint32_t crc = crc32(std::span(packet).first(kCrcOffset));
  packet[kCrcOffset + 0] = static_cast<std::uint8_t>(crc >> 0);
  packet[kCrcOffset + 1] = static_cast<std::uint8_t>(crc >> 8);
  packet[kCrcOffset + 2] = static_cast<std::uint8_t>(crc >> 16);
  packet[kCrcOffset + 3] = static_cast<std::uint8_t>(crc >> 24);
}

std::array<std::uint8_t, kPacketSize> valid_control_packet() {
  std::array<std::uint8_t, kPacketSize> packet{};
  packet[0] = 0xa1;
  packet[1] = 0x31;
  packet[2] = 0x01;
  packet[3] = 0x5a; // First byte retained in the virtual USB payload.
  packet[12] = 0x10; // Edge LFN in the translated input payload.
  packet[13] = 0x40; // Edge LB in the translated input payload.
  fill_crc(packet);
  return packet;
}

void test_valid_crc_preserves_translation() {
  auto packet = valid_control_packet();
  const auto report = vds::bt_input_to_usb_input(packet);
  assert(report.has_value());
  assert((*report)[0] == VDS_USB_INPUT_REPORT_ID);
  assert((*report)[1] == 0x5a);
  assert((*report)[10] == 0x10); // packet[12] becomes USB report[10].
  assert((*report)[11] == 0x40); // packet[13] becomes USB report[11].
}

void test_invalid_crc_is_rejected() {
  auto packet = valid_control_packet();
  packet[20] ^= 0x01;
  assert(!vds::bt_input_to_usb_input(packet).has_value());
}

void test_truncated_reports_are_rejected() {
  auto packet = valid_control_packet();
  assert(!vds::bt_input_to_usb_input(
              std::span<const std::uint8_t>(packet).first(kPacketSize - 1))
              .has_value());
  assert(!vds::bt_input_to_usb_input(
              std::span<const std::uint8_t>(packet).first(66))
              .has_value());
}

} // namespace

int main() {
  test_valid_crc_preserves_translation();
  test_invalid_crc_is_rejected();
  test_truncated_reports_are_rejected();
  std::puts("bt_input_protocol_test OK");
  return 0;
}
