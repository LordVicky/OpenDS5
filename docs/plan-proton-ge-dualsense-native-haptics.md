# OpenDS5 — Proton-GE DualSense Native Haptics Compatibility

You are working on the following project:

Repository:

`https://github.com/LordVicky/OpenDS5`

OpenDS5 is a Linux application for Sony DualSense controllers. One of its major components is **vDS**, which presents a Bluetooth-connected DualSense to Linux/games as a virtual wired USB DualSense.

The goal of this task is to make OpenDS5/vDS as compatible as possible with the latest native DualSense haptics support implemented in GE-Proton.

Relevant upstream project:

`https://github.com/GloriousEggroll/proton-ge-custom`

Relevant release series:

- GE-Proton11-2
- GE-Proton11-3 or newer if additional related patches exist

Relevant patch area:

`patches/proton-ds5-haptic/`

---

# Primary Goal

Analyze OpenDS5/vDS against GE-Proton's current DualSense implementation and improve OpenDS5 so that:

1. Native DualSense HD haptics from Windows games running under GE-Proton reach a Bluetooth-connected physical DualSense through vDS.
2. Native controller speaker audio continues to function.
3. Adaptive triggers and normal HID output reports remain transparent.
4. Controller reconnect/hotplug behaves as closely as possible to a real USB DualSense.
5. OpenDS5 does not duplicate logic that correctly belongs inside Wine/Proton.
6. The virtual USB DualSense exposed by vDS behaves closely enough to genuine Sony hardware that GE-Proton treats it exactly like a physical wired DualSense.

The main focus of this task is **native DualSense haptics**.

---

# Important Architectural Principle

Do NOT implement Wine, XAudio2, FAudio, GameEffects, or Windows audio translation logic inside OpenDS5.

GE-Proton is responsible for:

- exposing the correct Windows DualSense interfaces;
- translating XAudio2/GameEffects streams;
- identifying DualSense audio endpoints;
- handling Wine MMDevice behavior;
- routing native DualSense haptic audio;
- converting the Windows-side audio stream into the format required by the controller;
- selecting hidraw instead of inappropriate SDL abstractions;
- Wine-side hotplug/reconnect handling.

OpenDS5/vDS is responsible for:

- emulating the USB DualSense;
- exposing the correct USB HID identity;
- exposing the correct USB audio interfaces;
- accepting USB audio OUT data;
- separating speaker and haptic channels;
- converting USB-side controller traffic to Bluetooth reports;
- pacing Bluetooth haptic/audio packets correctly;
- forwarding native adaptive trigger/HID output reports;
- presenting stable Linux device identities where possible.

Keep this separation intact.

---

# Intended End-to-End Architecture

The desired native haptic path is:

```text
Windows game
    │
    │ XAudio2 / FAudio / GameEffects
    ▼
GE-Proton / Wine
    │
    │ detects native DualSense haptic stream
    │
    │ generates 4-channel 48 kHz controller audio
    ▼
Wine DualSense haptic routing
    │
    │ preferably raw ALSA
    │ fallback via PipeWire/Pulse if required
    ▼
vDS virtual USB DualSense
    │
    │ USB Audio OUT
    │ 4-channel PCM stream
    ▼
vds_hcd / vdsd
    │
    ├── channel 0 → controller speaker L
    ├── channel 1 → controller speaker R
    ├── channel 2 → left haptic actuator
    └── channel 3 → right haptic actuator
    │
    ▼
USB → Bluetooth translation
    │
    │ DualSense BT audio/haptic packet
    │ typically report 0x36 for audio data
    ▼
Physical Bluetooth DualSense
```

The HID path should run independently in parallel:

```text
Windows game
    │
    ▼
GE-Proton Wine HID stack
    │
    ▼
hidraw / virtual USB DualSense
    │
    ▼
vDS
    │
    ▼
USB output report translation
    │
    ▼
Bluetooth DualSense
```

This HID path includes:

- adaptive trigger commands;
- LEDs;
- mute LED;
- player indicators;
- standard rumble fallback where applicable;
- controller configuration output reports.

---

# Key Technical Context

DualSense native HD haptics are not equivalent to ordinary Linux force-feedback rumble.

Native DualSense haptics are effectively delivered using controller audio.

The native USB DualSense exposes a multi-channel audio playback interface.

The important stream is effectively:

```text
48,000 Hz
16-bit signed PCM
4 channels
interleaved
```

Conceptually:

```text
CH0 = controller speaker left
CH1 = controller speaker right
CH2 = left haptic actuator waveform
CH3 = right haptic actuator waveform
```

OpenDS5/vDS already contains logic related to this.

Inspect the current implementation carefully before modifying anything.

Relevant areas likely include:

```text
vds/src/vds_protocol.cc
vds/src/platform/linux/vdsd.cc
vds/99-vds-dualsense-wireplumber.conf
```

Also inspect:

- virtual USB descriptors;
- USB audio descriptors;
- HID descriptors;
- USB VID/PID values;
- ALSA device creation;
- PipeWire/WirePlumber rules;
- virtual device naming;
- hotplug lifecycle;
- USB isochronous audio handling;
- Bluetooth audio/haptic packet generation.

Do not assume the filenames above contain the entire implementation.

Search the repository.

---

# GE-Proton Behavior To Design Around

Study the latest GE-Proton DualSense patches directly.

In particular, investigate all patches under:

```text
patches/proton-ds5-haptic/
```

Do not rely only on release notes.

Understand the exact implementation.

Relevant behaviors include the following.

---

# 1. Raw ALSA Native Haptics Path

GE-Proton attempts to avoid losing the haptic actuator channels inside PipeWire.

The normal desktop-visible controller speaker sink does not necessarily expose the full native 4-channel stream.

GE-Proton therefore contains a special path that attempts to send native DualSense haptic audio directly to an ALSA PCM representing the controller.

The target expected by GE-Proton should approximately support:

```text
S16_LE
48 kHz
4 channels
interleaved PCM
playback
```

OpenDS5's virtual USB audio interface should support this configuration exactly and reliably.

Verify:

- supported PCM formats;
- sample rate;
- channel count;
- period size;
- buffer size;
- isochronous packet size;
- endpoint interval;
- USB Audio Class descriptors;
- ALSA enumeration;
- behavior when opening the PCM non-blocking;
- XRUN recovery;
- delayed writers;
- repeated open/close;
- reconnect.

If the vDS audio interface does not behave like a real DualSense in one of these respects, fix it.

---

# 2. Four-Channel Mapping

Confirm that OpenDS5's current channel mapping is correct.

Expected conceptual layout:

```text
USB PCM CH0 → speaker left
USB PCM CH1 → speaker right
USB PCM CH2 → haptics left
USB PCM CH3 → haptics right
```

Trace the complete path in code.

Document exactly where each channel is:

1. received from USB;
2. buffered;
3. resampled if applicable;
4. encoded if applicable;
5. inserted into the Bluetooth DualSense packet;
6. transmitted to the physical controller.

Check for:

- channel inversion;
- stereo swapping;
- signedness;
- endian mistakes;
- clipping;
- gain scaling;
- interleaving errors;
- off-by-one frame errors;
- buffer alignment errors;
- dropped tail frames;
- latency buildup.

Do not modify working code unnecessarily.

---

# 3. PipeWire / WirePlumber Representation

OpenDS5 currently appears to expose the virtual four-channel controller audio using a conventional speaker layout similar to:

```text
FL
FR
RL
RR
```

Investigate whether this accurately matches a real USB DualSense on a current Linux system.

GE-Proton treats the raw haptic channels more like generic auxiliary channels.

Investigate whether the raw vDS node should instead expose:

```text
AUX0
AUX1
AUX2
AUX3
```

Do NOT blindly change the layout.

First determine:

1. how a real wired DualSense appears in:
   - ALSA;
   - PipeWire;
   - WirePlumber;
2. what GE-Proton actually checks;
3. whether GE-Proton's raw ALSA path ignores PipeWire channel positions;
4. what happens when raw ALSA routing fails and Wine falls back to PipeWire/Pulse;
5. whether changing the channel positions could break controller speaker audio.

Desired design:

```text
Raw controller PCM
    │
    ├── 4-channel native haptics endpoint
    │       AUX0 AUX1 AUX2 AUX3
    │
    └── user-visible controller speaker path
            mono or stereo as appropriate
```

The virtual device should ideally resemble real Sony hardware instead of appearing as a normal surround-sound output.

If implementing separate presentation is too invasive, preserve the existing behavior and clearly document why.

---

# 4. Sony Device Identity

Ensure the virtual USB device presents the expected Sony identity.

Investigate the real DualSense descriptors and OpenDS5 descriptors.

Check:

```text
USB VID
USB PID
manufacturer string
product string
serial behavior
interface names
HID report descriptors
audio interface descriptors
```

Sony VID is normally:

```text
054c
```

Verify the PID used by OpenDS5 against the target controller type.

The virtual device should be identifiable by GE-Proton using the same mechanisms it uses for a real DualSense.

Likely matching strings include forms such as:

```text
DualSense
Wireless Controller
Wireless_Controller
Sony Interactive Entertainment
Sony_Interactive_Entertainment
```

Do not unnecessarily invent custom names that make Wine treat the virtual controller differently from genuine hardware.

---

# 5. hidraw vs SDL

GE-Proton contains logic intended to prefer the native HID path for DualSense rather than allowing SDL to claim the controller personality.

OpenDS5 should make its virtual USB HID device work correctly through hidraw.

Verify:

```text
/dev/hidraw*
udev properties
USB interface
report descriptor
input report sizes
output report sizes
feature reports
VID/PID
permissions
hotplug
```

Ensure GE-Proton can send native output reports directly to the virtual controller.

Do not add an SDL-specific workaround unless absolutely required.

The ideal architecture is:

```text
Wine
  │
  ▼
hidraw
  │
  ▼
vDS virtual DualSense
  │
  ▼
USB → Bluetooth report translation
  │
  ▼
physical controller
```

---

# 6. Adaptive Triggers

Native adaptive trigger commands should remain transparent.

A native game may send DualSense USB output reports containing trigger effect definitions.

vDS must translate those appropriately for the Bluetooth controller without changing the effect.

Check whether OpenDS5 currently allows application-level custom trigger profiles to override native game output.

When a game is using native DualSense support:

```text
native game trigger command
        ↓
vDS
        ↓
physical controller
```

should have priority.

OpenDS5 should not silently replace native game trigger effects with an application-level custom profile unless the user explicitly enables an override.

Document or implement an arbitration model if necessary.

Suggested priority model:

```text
1. Explicit user force-override
2. Native game DualSense command
3. OpenDS5 profile
4. Default controller behavior
```

But do not implement this model blindly if the existing architecture already handles it better.

Analyze first.

---

# 7. Native Haptics vs Emulated Rumble

Do not convert native DualSense haptic audio into ordinary rumble.

Native GameEffects haptics must remain a transparent audio stream.

If OpenDS5 also supports:

```text
traditional rumble
SDL rumble
FF_RUMBLE
gamepad emulation
```

keep those as separate fallback mechanisms.

Desired distinction:

```text
Native DualSense game
    → native 4-channel haptic audio
    → no rumble emulation

Non-native game
    → conventional force feedback
    → optional OpenDS5 translation
```

Avoid double effects.

For example, do not simultaneously apply:

```text
native actuator waveform
+
emulated strong/weak motor rumble
```

unless explicitly intended.

---

# 8. Bluetooth Haptic Packet Pacing

OpenDS5 already appears to convert USB audio URBs into Bluetooth audio/haptic reports and pace transmission.

Inspect this carefully.

USB isochronous traffic can arrive in bursts.

Bluetooth output must not simply mirror USB scheduling blindly.

Confirm the current packet queue and pacing strategy.

The implementation reportedly uses approximately:

```text
10 ms packet cadence
```

for DualSense BT audio/haptic output.

Verify this against real hardware behavior.

Check:

```text
queue size
queue overflow
packet loss
burst handling
timestamp handling
sleep precision
thread scheduling
timer drift
late frames
packet coalescing
drop strategy
backpressure
```

Priority should be maintaining smooth haptics without allowing latency to grow indefinitely.

If the producer exceeds the transport rate:

prefer bounded latency over an ever-growing queue.

Instrument:

```text
queued packets
dropped packets
late packets
burst duration
average queue depth
maximum queue depth
haptic underruns
haptic overruns
```

---

# 9. Controller Speaker Audio

Do not fix haptics at the expense of the controller speaker.

The same USB audio stream contains controller speaker channels.

Verify:

```text
CH0
CH1
```

continue to reach the DualSense speaker correctly.

Test:

- Windows games using controller speaker effects;
- system test audio;
- mono audio;
- stereo audio;
- haptics and speaker simultaneously;
- reconnect while audio is playing.

The haptic path and speaker path must coexist.

---

# 10. Hotplug and Reconnect

GE-Proton contains significant DualSense reconnect logic.

OpenDS5 needs to behave predictably when:

```text
physical Bluetooth controller disconnects
physical controller reconnects
vDS USB device disappears
vDS USB device is recreated
controller switches from DualSense to DualSense Edge
daemon restarts
kernel module restarts
Bluetooth temporarily drops
```

Analyze the current OpenDS5 lifecycle.

Questions to answer:

- Does the virtual USB device persist while Bluetooth is disconnected?
- Is it destroyed?
- Is it recreated with the same identity?
- Does ALSA generate a new card index?
- Does PipeWire generate a new node ID?
- Does Wine see an MMDevice removal?
- Does Wine see an MMDevice re-add?
- Does hidraw disappear?
- Does hidraw return with the same logical identity?
- Is the device serial stable?

Where possible, create stable identities.

Avoid stale virtual devices.

Avoid duplicate USB controllers.

Avoid stale ALSA/PipeWire devices.

---

# 11. DualSense Edge

Inspect whether OpenDS5 currently supports:

```text
DualSense
DualSense Edge
```

If Edge support exists, verify GE-Proton compatibility separately.

Do not assume the USB PID, reports, or descriptors are identical.

Keep product-specific behavior behind an abstraction.

Suggested design:

```text
ControllerDescriptor
├── DualSense
└── DualSenseEdge
```

with controller-specific:

```text
USB VID/PID
report sizes
feature reports
capabilities
audio descriptors if different
Bluetooth framing if different
```

Do not duplicate large code paths unnecessarily.

---

# Proposed OpenDS5 Architecture

Preserve or evolve toward the following layering:

```text
┌──────────────────────────────────────────────┐
│                  OpenDS5 UI                  │
│                                              │
│ Profiles / user settings / diagnostics       │
└────────────────────────┬─────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────┐
│              OpenDS5 Controller Core         │
│                                              │
│ Controller discovery                         │
│ Profile arbitration                          │
│ Native-mode detection                        │
│ State management                             │
└────────────────────────┬─────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────┐
│                     vDS                      │
│                                              │
│ Virtual wired DualSense                     │
│                                              │
│ ┌────────────────┐  ┌────────────────────┐   │
│ │ USB HID        │  │ USB Audio          │   │
│ │                │  │                    │   │
│ │ input reports  │  │ 4ch PCM 48 kHz    │   │
│ │ output reports │  │                    │   │
│ │ feature reports│  │ CH0/1 speaker      │   │
│ └───────┬────────┘  │ CH2/3 haptics      │   │
│         │           └──────────┬─────────┘   │
└─────────┼──────────────────────┼─────────────┘
          │                      │
          ▼                      ▼
┌─────────────────┐   ┌───────────────────────┐
│ HID Translator  │   │ Audio/Haptic Pipeline │
│                 │   │                       │
│ USB → BT        │   │ USB PCM               │
│ report mapping  │   │ buffering             │
│ CRC/framing     │   │ resampling            │
└────────┬────────┘   │ packetization          │
         │            │ pacing                 │
         │            └──────────┬────────────┘
         │                       │
         └───────────────┬───────┘
                         ▼
┌──────────────────────────────────────────────┐
│             Bluetooth Transport              │
│                                              │
│ HID reports                                  │
│ DualSense audio/haptic reports               │
│ reconnect                                    │
│ output scheduling                            │
└────────────────────────┬─────────────────────┘
                         ▼
                Physical DualSense
```

Keep the USB emulation layer independent from the physical BT transport.

---

# Audio/Haptics Pipeline Design

Prefer an explicit pipeline rather than mixing responsibilities.

Suggested internal structure:

```text
UsbAudioReceiver
        │
        ▼
PcmFrameAssembler
        │
        ▼
DualSenseChannelSplitter
        │
        ├──── speaker PCM
        │
        └──── actuator PCM
                 │
                 ▼
         HapticPacketEncoder
                 │
                 ▼
         BtAudioScheduler
```

Responsibilities:

## UsbAudioReceiver

Responsible only for:

- receiving USB isochronous payloads;
- validating transfer sizes;
- preserving ordering;
- timestamping frames if useful.

It should not know Bluetooth packet framing.

## PcmFrameAssembler

Responsible for:

- reconstructing interleaved PCM frames;
- carrying incomplete frame tails across transfers;
- correct endian handling;
- avoiding dropped partial samples.

## DualSenseChannelSplitter

Responsible for:

```text
speaker L
speaker R
haptic L
haptic R
```

No device transport logic.

## HapticPacketEncoder

Responsible for:

- required controller-side haptic encoding;
- resampling;
- correct packet structure;
- correct frame count;
- sequence handling where needed.

## BtAudioScheduler

Responsible for:

- pacing;
- queueing;
- dropping;
- latency control;
- sending at controller-required intervals.

Do not combine all of these into one giant function.

If the current code is already sensibly separated, preserve it.

---

# Diagnostics Design

Add useful diagnostics for native DualSense haptics.

Avoid noisy logs by default.

Suggested debug metrics:

```text
Native haptics:
  USB PCM format: S16_LE
  USB sample rate: 48000
  USB channels: 4

Audio frames received: XXXXX
Haptic frames received: XXXXX

BT haptic packets sent: XXXXX
BT speaker packets sent: XXXXX

Queue:
  current: XX
  max: XX
  dropped: XX

Timing:
  target interval: XX ms
  average interval: XX ms
  max late: XX ms

Underruns: XX
Overruns: XX
```

Useful logging events:

```text
native haptic stream started
native haptic stream stopped
raw USB PCM opened
stream format rejected
unsupported sample rate
unsupported channel count
Bluetooth haptic queue overflow
Bluetooth transport reconnect
```

If OpenDS5 has a diagnostics UI, expose the most useful values there.

Otherwise expose them via structured debug logs.

---

# Native Haptics Detection

OpenDS5 should not need to know which Windows game is running.

Native mode can be inferred from actual traffic.

For example:

```text
if valid 4-channel DualSense USB audio is actively arriving:
    native_haptics_active = true
```

Use an inactivity timeout rather than relying on game detection.

Example:

```text
native_haptics_active
    becomes true on valid actuator PCM traffic

native_haptics_active
    becomes false after no actuator traffic for N ms
```

Do not hardcode game names.

Do not depend on Steam App IDs.

Do not depend on Proton executable names.

Traffic should be the source of truth.

---

# Interaction With OpenDS5 Profiles

When native haptics are active, avoid transformations that alter the native waveform.

Suggested behavior:

```text
Native haptics active:

Game actuator PCM
        │
        ▼
transparent transport
        │
        ▼
physical DualSense
```

Optional OpenDS5 enhancements such as:

```text
haptic strength
haptic EQ
haptic remapping
rumble conversion
```

should be disabled by default for native streams unless explicitly enabled by the user.

For native adaptive triggers, apply the same philosophy.

Native commands should normally pass through untouched.

---

# Do Not Overfit To GE-Proton

The virtual controller should emulate genuine hardware.

Do not implement hacks such as:

```text
if process == wine
if process contains proton
if GE-Proton detected
```

unless absolutely unavoidable.

Correct design:

```text
OpenDS5 emulates a real DualSense accurately
        ↓
GE-Proton works
Steam works
native Linux software works
future Proton versions work
```

Prefer protocol correctness over application-specific behavior.

---

# Compatibility Targets

At minimum evaluate:

```text
GE-Proton11-2+
latest GE-Proton
Valve Proton Experimental
Wine Staging if practical
```

But make code changes based primarily on:

- real DualSense behavior;
- USB specifications;
- Sony protocol behavior;
- Linux audio behavior.

Do not make OpenDS5 depend specifically on GE-Proton.

---

# Investigation Tasks

Before modifying code, perform a repository and upstream audit.

Create a matrix with every relevant GE-Proton patch.

For every patch under:

```text
patches/proton-ds5-haptic/
```

classify it as:

```text
A. Wine-only — no OpenDS5 action
B. Already compatible with OpenDS5
C. OpenDS5 behavior should be verified
D. OpenDS5 modification recommended
E. Potential OpenDS5 incompatibility
```

For each entry include:

```text
patch filename
purpose
Wine-side behavior
expected hardware behavior
current OpenDS5 behavior
compatibility assessment
required OpenDS5 action
```

Pay particular attention to patches concerning:

```text
raw ALSA haptics
DualSense device matching
hidraw
SDL suppression
MMDevice
hotplug
endpoint persistence
controller speaker
USB haptics
DualSense Edge
```

---

# Inspect Real Hardware Behavior

When possible, use Linux's normal hardware introspection commands as the reference model.

Document expected outputs for a real wired DualSense using tools such as:

```bash
lsusb -v
cat /proc/asound/cards
aplay -l
aplay -L
wpctl status
pw-cli list-objects
pw-dump
udevadm info
libinput list-devices
```

Also inspect:

```bash
/proc/asound/card*/
```

The virtual OpenDS5 device should resemble the real controller wherever practical.

Do not fake properties that the kernel/audio stack cannot reasonably reproduce.

---

# Tests

Add automated tests where practical.

At minimum add unit tests around pure logic.

## PCM splitting test

Input known interleaved frames:

```text
Lspeaker
Rspeaker
Lhaptic
Rhaptic
```

Verify output channels exactly.

## Partial USB transfer test

Provide PCM where a USB transfer ends in the middle of a frame.

Ensure the next transfer reconstructs the frame correctly.

## Endian test

Verify S16_LE parsing.

## Silence test

All-zero haptic channels should generate silence without artifacts.

## Maximum amplitude test

Use:

```text
-32768
32767
```

Ensure no overflow.

## Stereo isolation test

Only left actuator active.

Verify right actuator remains silent.

Then reverse.

## Speaker/haptics simultaneous test

All four channels active.

Verify no cross-contamination.

## Queue overflow test

Feed data faster than Bluetooth transport.

Ensure latency remains bounded.

## Timing test

Verify packet scheduler remains near expected cadence.

## Reconnect test

Simulate:

```text
stream running
Bluetooth disconnect
Bluetooth reconnect
```

Ensure the pipeline recovers cleanly.

---

# Integration Test Procedure

Document a repeatable manual test procedure.

Example:

## Environment

```text
Linux
PipeWire
WirePlumber
OpenDS5
vDS loaded
DualSense connected over Bluetooth
GE-Proton11-2+
```

## Verify virtual controller

Check:

```bash
lsusb
aplay -l
wpctl status
```

Confirm virtual Sony USB DualSense exists.

## Verify PCM

Confirm a four-channel 48 kHz playback PCM exists.

## Test audio manually

Generate a known four-channel PCM test file.

Example conceptual channel content:

```text
CH0 = 440 Hz tone
CH1 = 880 Hz tone
CH2 = low-frequency waveform
CH3 = different low-frequency waveform
```

Send it to the virtual ALSA PCM.

Verify:

- correct speaker output;
- left/right haptic isolation;
- no channel swapping.

## Test GE-Proton

Run a native DualSense game with:

```text
Steam Input disabled
GE-Proton selected
```

Verify:

```text
native controller detected
adaptive triggers work
native haptics work
controller speaker works
```

## Reconnect

While the game is running:

```text
disconnect controller
reconnect controller
```

Verify native haptics resume without restarting OpenDS5.

Test restarting vdsd separately if possible.

---

# Performance Requirements

Native haptics are latency sensitive.

Avoid:

- unnecessary memory copies;
- large audio buffers;
- blocking the Bluetooth transport thread;
- dynamic allocations in high-frequency loops;
- expensive logging in the hot path.

Prefer:

- preallocated buffers;
- bounded queues;
- ring buffers where appropriate;
- monotonic clocks;
- deterministic packet pacing.

Measure rather than guessing.

---

# Threading Requirements

Review thread ownership carefully.

USB audio ingestion must not be blocked by:

```text
UI
Bluetooth reconnect
logging
profile updates
disk IO
```

Bluetooth packet scheduling should have a clear owner.

Avoid multiple threads writing controller audio packets concurrently.

Preferred model:

```text
USB producer
     │
     ▼
bounded queue / ring buffer
     │
     ▼
single BT audio scheduler
     │
     ▼
Bluetooth transport
```

Use existing project conventions.

Do not introduce an entirely new concurrency framework unless necessary.

---

# Failure Behavior

If native haptic PCM has an unsupported format:

Do not crash.

Report clearly:

```text
unsupported DualSense PCM format:
rate = ...
channels = ...
format = ...
```

If Bluetooth disconnects:

- stop transmitting;
- prevent unbounded queue growth;
- reset stale audio state;
- recover after reconnect.

If the raw haptic stream stops:

- drain or discard stale packets appropriately;
- return to normal idle behavior.

If PipeWire restarts:

- vDS kernel audio device should remain valid if possible;
- user-space integration should recover.

---

# Security and Permissions

Inspect whether current OpenDS5 setup requires excessively broad permissions.

Do not solve controller access by recommending:

```text
chmod 777 /dev/hidraw*
```

Use proper:

```text
udev rules
groups
device ownership
```

Preserve the project's existing security model where reasonable.

---

# Code Quality

Follow the existing project's:

```text
coding style
naming conventions
C++ standard
error handling
logging framework
build system
```

Avoid:

- giant refactors unrelated to this task;
- changing public APIs unnecessarily;
- duplicating protocol constants;
- magic numbers without names;
- hiding transport assumptions inside UI code.

If new protocol constants are introduced, give them meaningful names.

Example:

```cpp
constexpr uint32_t kDualSensePcmRate = 48000;
constexpr uint8_t kDualSensePcmChannels = 4;
```

Use the project's existing naming style rather than copying this verbatim if it differs.

---

# Documentation

Update project documentation.

Add a section similar to:

```text
Native DualSense Haptics
```

Explain that OpenDS5/vDS exposes the Bluetooth controller as a virtual USB DualSense.

Document that native haptics rely on software capable of sending native DualSense USB haptic audio.

Mention GE-Proton versions where the improved implementation exists.

Do not claim OpenDS5 itself converts Windows GameEffects to DualSense haptics.

Correct explanation:

```text
GE-Proton produces the native USB-side DualSense stream.
vDS transports that native stream to the Bluetooth controller.
```

Also explain that Steam Input may need to be disabled for games with native DualSense support.

Verify this before documenting it as an absolute rule.

---

# Deliverables

Perform this task in phases.

## Phase 1 — Analysis

Before editing anything, produce:

```text
1. Current OpenDS5 native haptics architecture
2. Current GE-Proton DualSense architecture
3. End-to-end data flow
4. Compatibility matrix for every relevant GE patch
5. Identified incompatibilities
6. Recommended changes
```

For every conclusion cite exact:

```text
OpenDS5 file
function/class
GE-Proton patch
relevant function
```

Do not make speculative claims without identifying them as hypotheses.

---

# Phase 2 — Implementation Plan

Produce a concrete implementation plan organized by file.

Example:

```text
vds/src/...
  change...
  reason...
  compatibility impact...

vds/99-vds...
  change...
  reason...
```

Include risk level:

```text
low
medium
high
```

for every change.

---

# Phase 3 — Implementation

Implement only changes justified by the analysis.

Keep commits logically separable where practical.

Suggested categories:

```text
vDS audio descriptor compatibility
PipeWire/WirePlumber compatibility
haptic queue/pacing fixes
hotplug/reconnect fixes
diagnostics
tests
documentation
```

Do not alter unrelated OpenDS5 functionality.

---

# Phase 4 — Verification

After implementation, provide:

```text
files changed
behavior changed
tests added
tests run
remaining unverified assumptions
manual hardware tests required
known limitations
```

Also provide exact commands for testing on Fedora/Arch-style Linux systems using PipeWire.

---

# Important Questions To Answer

The final technical report must explicitly answer these questions:

1. Does vDS currently expose a genuine 4-channel 48 kHz S16_LE ALSA PCM that GE-Proton can open directly?

2. Does GE-Proton identify the virtual OpenDS5 controller using its current VID/PID and device strings?

3. Does the vDS channel mapping match GE-Proton's haptic stream exactly?

4. Does `FL FR RL RR` create any real compatibility problem compared with `AUX0 AUX1 AUX2 AUX3`?

5. Should OpenDS5 change its WirePlumber configuration?

6. Does raw ALSA access bypass that WirePlumber layout entirely?

7. What happens when GE-Proton falls back from raw ALSA to PipeWire?

8. Does native controller speaker audio work simultaneously with actuator haptics?

9. Does vDS preserve native adaptive-trigger output correctly?

10. Is the current approximately 10 ms Bluetooth audio packet scheduling correct?

11. Is there any queueing behavior capable of adding progressively increasing haptic latency?

12. Are any haptic/audio packets dropped during USB burst traffic?

13. Does OpenDS5 survive DualSense disconnect/reconnect while a native game is running?

14. Does the virtual device retain a stable enough identity for Wine's MMDevice logic?

15. Is DualSense Edge behavior correct?

16. Does OpenDS5 ever accidentally produce conventional rumble at the same time as native haptic audio?

17. Are there places where OpenDS5 currently transforms native haptics when it should remain transparent?

18. Which GE-Proton patches require absolutely no OpenDS5 changes because they are entirely Wine-side?

---

# Guiding Principle

The desired end state is not:

```text
OpenDS5 has hacks for GE-Proton.
```

It is:

```text
OpenDS5 accurately emulates a wired DualSense.

Therefore:

GE-Proton sees a real DualSense.
Wine sees a real DualSense.
ALSA sees a real DualSense.
PipeWire sees a real DualSense.
Games see a real DualSense.

vDS transparently transports that wired behavior
to the physical controller over Bluetooth.
```

Protocol fidelity should be the primary design objective.

---

# Start Here

Start by reading the complete OpenDS5 repository.

Then inspect the current GE-Proton release and every patch in:

```text
patches/proton-ds5-haptic/
```

Do not modify code yet.

First produce the Phase 1 architecture analysis and compatibility matrix.

Only after the evidence is clear should you propose or make implementation changes.