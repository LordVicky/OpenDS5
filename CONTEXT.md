# OpenDS5 Controller Compatibility

This context defines the language used when OpenDS5 transports DualSense controller behavior between a physical Bluetooth controller and software expecting a wired USB controller.

## Controller and transport

**vDS**
The OpenDS5 virtual wired DualSense presented to Linux and applications while the physical controller is connected over Bluetooth.

**Native DualSense haptics**
DualSense actuator waveforms delivered through the controller's native multi-channel audio path, distinct from conventional force-feedback rumble.

**Controller speaker audio**
Audio intended for the physical DualSense's built-in speaker, carried alongside native actuator channels when the native audio path is active.

**PipeWire haptics path**
OpenDS5's existing desktop-audio route for transporting controller audio through the Linux audio stack. It remains part of the compatibility surface for users and games outside the GE-Proton native path.

**GE-Proton native path**
GE-Proton's Wine-side DualSense route that recognizes a native four-channel controller effect stream and sends it toward a raw ALSA PCM when possible, with newer releases providing a PipeWire fallback. OpenDS5 must satisfy the controller hardware contract for this path without duplicating Wine-side translation logic.

## Compatibility scope

**GE-Proton compatibility baseline**
GE-Proton 11-2 is the minimum native-haptics target; newer upstream GE-Proton behavior is preferred when it remains compatible with that baseline.

**Native trigger override**
An explicit user action, such as manually pinning or selecting a trigger profile, that intentionally opts into OpenDS5 trigger effects for a native game. Automatic game matching and global intensity settings are not overrides.

**Native game analyzer**
The OpenDS5 game-library metadata and matching flow that identifies games with native DualSense features and avoids installing or editing conflicting custom trigger profiles. It does not own the GE-Proton native HID or audio paths.

**Hardware contract**
The observable USB, ALSA, PipeWire, HID, lifecycle, and Bluetooth behavior that a real wired DualSense provides and GE-Proton relies on. It is the compatibility boundary OpenDS5 must reproduce.

**PipeWire fallback topology**
The alternate GE-Proton audio route that reaches a hidden four-channel controller parent using auxiliary channel positions when direct ALSA access is unavailable.
