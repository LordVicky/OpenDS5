// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jihong Min <hurryman2212@gmail.com>
#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <optional>
#include <span>
#include <string>
#include <vector>

#include "vds/ds5_protocol.h"

namespace vds {

constexpr std::size_t kBtHapticsReportSize = VDS_BT_HAPTICS_REPORT_SIZE;
constexpr std::size_t kBtInitReportSize = 142;
constexpr std::size_t kBtStateReportSize = VDS_BT_STATE_REPORT_SIZE;
constexpr std::size_t kHapticsSampleSize = VDS_HAPTICS_SAMPLE_SIZE;
constexpr std::size_t kUsbInputReportSize = VDS_USB_INPUT_REPORT_SIZE;
constexpr std::size_t kDsStateSize = 63;
constexpr std::size_t kSpeakerChannels = 2;
constexpr std::size_t kSpeakerInputFrames = 512;
constexpr std::size_t kSpeakerOpusFrames = 480;
constexpr std::size_t kSpeakerOpusSize = 200;

using BtReport = std::array<std::uint8_t, kBtHapticsReportSize>;
using BtInitReport = std::array<std::uint8_t, kBtInitReportSize>;
using BtStateReport = std::array<std::uint8_t, kBtStateReportSize>;
using HapticsChunk = std::array<std::int8_t, kHapticsSampleSize>;
using SpeakerInput =
    std::array<std::int16_t, kSpeakerInputFrames * kSpeakerChannels>;
using SpeakerChunk = std::array<std::uint8_t, kSpeakerOpusSize>;
using DsState = std::array<std::uint8_t, kDsStateSize>;
using UsbInputReport = std::array<std::uint8_t, kUsbInputReportSize>;

struct AudioChunk {
  HapticsChunk haptics;
  SpeakerChunk speaker;
  bool has_signal = false;
  bool has_haptics_signal = false;
};

void fill_output_report_checksum(std::span<std::uint8_t> report);
void fill_feature_report_checksum(std::span<std::uint8_t> report);
std::vector<std::uint8_t>
hidp_output_packet(std::span<const std::uint8_t> report);
std::vector<std::uint8_t> feature_get_packet(std::uint8_t report_id);
std::vector<std::uint8_t>
feature_set_packet(std::span<const std::uint8_t> report);
std::optional<UsbInputReport>
bt_input_to_usb_input(std::span<const std::uint8_t> packet);
std::optional<std::vector<std::uint8_t>>
bt_feature_to_usb_feature_reply(std::span<const std::uint8_t> packet);

class HapticsPacketBuilder {
public:
  BtReport
  build_packet(std::span<const std::int8_t, kHapticsSampleSize> haptics,
               std::span<const std::uint8_t, kSpeakerOpusSize> speaker,
               std::span<const std::uint8_t, kDsStateSize> state);

private:
  std::uint8_t report_sequence_ = 0;
  std::uint8_t packet_sequence_ = 0;
};

constexpr std::size_t kTriggerEffectSize = 11;

// DS5 Bridge companion adjustments layered on top of the game-driven output
// state before each BT send. Percent fields at 100 mean pass-through.
struct DsCompanionOverrides {
  bool lightbar_override = false;
  bool lightbar_enabled = true;
  std::array<std::uint8_t, 3> lightbar_color{0, 0, 255};
  std::uint8_t lightbar_brightness_percent = 100;
  bool player_led_enabled = true;
  std::uint16_t classic_rumble_gain_percent = 100;
  std::uint16_t trigger_intensity_percent = 100;
  bool right_trigger_active = false;
  std::array<std::uint8_t, kTriggerEffectSize> right_trigger{};
  bool left_trigger_active = false;
  std::array<std::uint8_t, kTriggerEffectSize> left_trigger{};
  bool test_rumble_active = false;
  std::uint8_t test_rumble_power = 0;
  std::uint16_t speaker_volume_percent = 100;
};

// Encodes a DS5 Bridge companion trigger effect (mode 0=feedback, 1=weapon,
// 2=vibration; percents 0-100) using the same zone packing as the DS5 Bridge
// Pico firmware.
void encode_companion_trigger_effect(
    std::span<std::uint8_t, kTriggerEffectSize> trigger, std::uint8_t mode,
    std::uint8_t start_percent, std::uint8_t wall_percent,
    std::uint8_t force_percent);

struct CompanionTriggerEffect;

// Encodes the full V2 companion trigger effect surface. V1 modes (0 feedback,
// 1 weapon, 2 vibration) delegate to encode_companion_trigger_effect;
// V2-only modes are 3 off, 4 multi-feedback, 5 slope, 6 multi-vibration.
void encode_companion_trigger_effect_v2(
    std::span<std::uint8_t, kTriggerEffectSize> trigger,
    const CompanionTriggerEffect &effect);

class DsOutputState {
public:
  DsOutputState();

  bool apply_usb_output_report(std::span<const std::uint8_t> report);
  void set_audio_out_stream_active(bool active);
  void set_companion_overrides(const DsCompanionOverrides &overrides);
  BtInitReport build_bt_init_report();
  BtStateReport build_bt_state_report();
  const DsState &state() const { return effective_state_; }

private:
  void recompute_effective_state();

  DsState state_{};
  DsState effective_state_{};
  DsCompanionOverrides companion_;
  std::array<std::uint8_t, 3> light_color_{};
  std::uint8_t light_brightness_ = 0;
  bool emulate_light_brightness_ = false;
  std::uint8_t report_sequence_ = 0;
};

class PcmAudioExtractor {
public:
  explicit PcmAudioExtractor(
      std::size_t speaker_input_frames = kSpeakerInputFrames);
  ~PcmAudioExtractor();

  PcmAudioExtractor(PcmAudioExtractor &&) noexcept;
  PcmAudioExtractor &operator=(PcmAudioExtractor &&) noexcept;

  PcmAudioExtractor(const PcmAudioExtractor &) = delete;
  PcmAudioExtractor &operator=(const PcmAudioExtractor &) = delete;

  std::vector<AudioChunk>
  push_usb_audio(std::span<const std::uint8_t> pcm_bytes);

private:
  struct SpeakerEncoder;

  std::unique_ptr<SpeakerEncoder> speaker_encoder_;
  std::array<std::uint8_t, VDS_AUDIO_CHANNELS * sizeof(std::int16_t)>
      pending_frame_{};
  SpeakerInput speaker_input_{};
  SpeakerInput haptics_input_{};
  std::size_t speaker_input_frames_ = kSpeakerInputFrames;
  std::size_t pending_frame_pos_ = 0;
  std::size_t speaker_frame_pos_ = 0;
  bool chunk_has_signal_ = false;
  bool chunk_has_haptics_signal_ = false;
};

std::vector<std::uint8_t> frame_bytes(std::uint16_t type,
                                      std::span<const std::uint8_t> payload);
std::string frame_type_name(std::uint16_t type);

} // namespace vds
