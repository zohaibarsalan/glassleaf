# 0001 — Begin with the Liquid Glass platform generation

- Status: accepted
- Date: 2026-07-18

## Decision

Glassleaf initially supports iOS 26, iPadOS 26, and macOS 26 or later. Development uses the latest stable Xcode and Apple SDKs available to the project.

## Rationale

The product is new and explicitly designed around the system design language introduced with Liquid Glass. Starting at the 26-generation platforms keeps the implementation focused, lets standard SwiftUI navigation and controls adopt the native material, and avoids maintaining a parallel pre-Liquid-Glass interface before the core reading experience exists.

## Design consequences

- Prefer standard SwiftUI navigation, toolbars, sheets, search, and controls so the system supplies platform-appropriate Liquid Glass behavior.
- Apply custom glass only to floating controls that need a functional layer above book or library content.
- Keep the reading surface opaque and highly legible; book content is not a glass surface.
- Respect Reduce Transparency, Reduce Motion, Increase Contrast, Dynamic Type, and VoiceOver from the first implementation.
- Use platform-specific layout adaptations even though the source and product target are shared.

## Delivery consequence

The Apple application cannot be fully built or simulator-tested until a full current Xcode installation is available. Platform-neutral Swift packages remain testable with the standalone Swift toolchain.
