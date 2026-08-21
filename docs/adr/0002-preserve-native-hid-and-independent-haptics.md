# Preserve Native HID and Keep Haptics Independent

OpenDS5 will preserve the existing architecture in which GE-Proton owns native DualSense HID and audio translation, while vDS transports the resulting hardware traffic. Native haptics remain independent of the companion trigger-profile engine; the game analyzer may avoid automatic custom trigger profiles, but only an explicit user action such as manually pinning a profile counts as an override. This avoids coupling the transport layer to a second game-classification system or allowing global trigger settings to transform native game output.
