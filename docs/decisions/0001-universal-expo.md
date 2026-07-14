# ADR 0001: Use one universal Expo application

- Status: Accepted
- Date: 2026-07-12

## Context

The first deliverable is a web demo, but the product is intended to become an iOS and Android application with haptic feedback. Separate web and native implementations would duplicate routing, playback, visualization, and accessibility behavior.

## Decision

Build one strict-TypeScript Expo application using Expo Router and React Native Web. Keep platform-specific behavior behind `.native.ts` and `.web.ts` adapters. Keep the renderer behind a component boundary so profiling can justify a future SVG, Canvas, or Skia implementation without changing playback logic.

## Consequences

- Web remains the first verification and release target.
- Screens, domain logic, and most components are shared across platforms.
- Universal primitives and accessibility semantics are required from the start.
- Platform-specific optimizations are allowed only behind explicit adapters.
