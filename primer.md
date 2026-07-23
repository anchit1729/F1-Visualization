# F1 Replay Codebase Primer

## 30-second summary

F1 Replay is a web-first universal Expo application rather than separate React
web and React Native applications. Most screens, playback logic, SVG rendering,
styling, and accessibility behavior are shared across platforms.

Platform differences are kept behind:

- Metro file resolution such as `.web.tsx` and `.native.ts`
- Small `Platform.OS` checks
- A local Expo native module that exposes Apple Core Haptics to TypeScript

The most important architectural idea is that JavaScript decides what the
telemetry means, while Swift owns the haptic hardware and Core Haptics engine
lifecycle.

## 15-minute interview rundown

### Minutes 0–2: Codebase map

The repository is an npm workspace:

- `apps/replay`: the Expo application
- `packages/domain`: shared TypeScript schemas and domain types
- `packages/test-fixtures`: small deterministic replay artifacts used in tests
- `tools/ingestion`: the Python pipeline that preprocesses OpenF1 data
- `apps/replay/public/replays/v1`: static, versioned replay artifacts

At runtime, the app:

1. Loads a static catalog, replay index, and replay chunks.
2. Runs a platform-independent playback state machine.
3. Selects the driver positions and telemetry for the current time.
4. Renders the circuit and cars with `react-native-svg`.
5. Optionally sends the selected driver's telemetry to native haptics.

The OpenF1 data is processed offline, so normal playback does not depend on the
OpenF1 service. This keeps the demo deterministic, cacheable, and protected from
upstream schema or availability changes. The rationale is recorded in
[`docs/decisions/0002-preprocessed-openf1.md`](docs/decisions/0002-preprocessed-openf1.md).

### Minutes 2–5: React web versus native

The central decision is documented in
[`docs/decisions/0001-universal-expo.md`](docs/decisions/0001-universal-expo.md):
one Expo/React Native application is rendered on the web through React Native
Web.

| Concern       | Web                                                                       | iOS/Android                                       |
| ------------- | ------------------------------------------------------------------------- | ------------------------------------------------- |
| UI primitives | React Native Web converts `View`, `Text`, and `Pressable` to DOM elements | Real React Native views                           |
| Routing       | Expo Router with a static web export                                      | Expo Router backed by native navigation           |
| Circuit       | `react-native-svg` renders browser SVG                                    | `react-native-svg` uses its native implementation |
| Scrubber      | HTML `<input type="range">`                                               | `Pressable` plus `PanResponder`                   |
| Feedback      | No-op                                                                     | Expo Haptics or the custom native module          |
| Focus         | Explicit DOM focus restoration                                            | Native focus and accessibility behavior           |

The clearest platform split is the scrubber:

- `ReplayScrubber.web.tsx` uses an HTML range input for browser-native keyboard
  and pointer behavior.
- `ReplayScrubber.tsx` uses React Native gestures and accessibility actions.

Both are imported as `./ReplayScrubber`; Metro selects the correct
implementation for the build target.

Other web-specific behavior is intentionally small:

- DOM focus restoration after navigation or closing the driver inspector
- `matchMedia` for the browser color scheme
- DOM root background and `color-scheme` settings

Most application code does not need to know which platform is running.

### Minutes 5–7: Native-specific behavior

Native-specific pieces include:

- `SafeAreaProvider` and status-bar handling in `src/app/_layout.tsx`
- `AppState` handling that rebases the playback clock when the app returns to
  the foreground
- `PanResponder` gestures and native accessibility actions for scrubbing
- System accessibility preferences such as reduced motion and reduced
  transparency
- Native modals, touch-sized hit targets, and platform-specific fonts
- A local Swift/Kotlin Expo module under `apps/replay/modules/f1-haptics`

The generated `apps/replay/ios` and `apps/replay/android` projects are ignored.
The maintained sources of truth are Expo configuration, JavaScript/TypeScript,
and the local native module. `expo run:ios`, `expo run:android`, or EAS generates
and builds the native project.

A concise way to describe this in an interview is:

> The app is universal at the product-logic level, while platform capabilities
> are isolated behind narrow adapters.

### Minutes 7–12: Core Haptics and the Expo/native interface

There are two related haptic systems.

#### Semantic UI feedback

UI components emit meanings such as `play`, `pause`, `scrub`, `selection`, and
`complete`. They do not directly request a particular motor effect.

The native adapter in `feedbackAdapter.native.ts`:

1. Uses a custom authored Core Haptics texture when the local module and hardware
   support it.
2. Otherwise falls back to `expo-haptics` selection, impact, and notification
   feedback.
3. Resolves to a no-op adapter on web.

This means physical textures can be retuned without changing UI components. A
feedback controller also debounces repeated semantic events and prevents haptic
errors from disrupting the user interaction.

#### Continuous telemetry haptics

The data flow is:

```text
Selected driver telemetry
        |
        v
Pure TypeScript telemetry mapping
        |
        v
useTelemetryHaptics, limited to 20 Hz
        |
        v
Expo Modules API
        |
        v
Swift HapticController
        |
        v
CHHapticEngine and the Taptic Engine
```

`telemetryHaptics.ts` converts domain data into a small native update object:

- RPM controls playback rate and sharpness.
- Throttle contributes to engine intensity.
- Braking and longitudinal g control impact intensity and pulse frequency.
- Lateral g selects a left, right, or centered texture.
- Data-quality flags suppress unavailable g-force or reduce the influence of
  low-quality estimates.
- Inputs and outputs are clamped to safe ranges.

`useTelemetryHaptics.ts` manages the React-side lifecycle:

- It activates only while playback is running and selected-driver telemetry is
  available.
- It checks that the native module and hardware are supported.
- It disables telemetry haptics when reduced motion is enabled.
- It sends updates at most once every 50 milliseconds, or 20 Hz.
- It stops the native player during effect cleanup.

The TypeScript facade calls:

```ts
requireOptionalNativeModule('F1Haptics');
```

Using an optional module prevents the JavaScript bundle from crashing when the
compiled module is absent, such as on web or in an incompatible native client.
The TypeScript types define the contract but do not implement the hardware
behavior.

On iOS, `F1HapticsModule.swift` registers the same `F1Haptics` name and exports
its functions through Expo Modules Core. Its Swift `Record` types describe how
JavaScript objects are marshalled into native values.

The Swift `HapticController`:

- Creates and retains a `CHHapticEngine`.
- Serializes engine access on a dedicated dispatch queue.
- Handles engine stop and reset callbacks.
- Creates a looping 180-millisecond engine pattern.
- Dynamically changes playback rate, intensity, and sharpness.
- Adds transient impacts for cornering and braking.
- Uses hysteresis and time intervals to avoid noisy impact triggering.
- Converts semantic pattern definitions into transient or continuous
  `CHHapticEvent` values.

The apparent left/right feedback is not truly spatial because the phone has one
haptic actuator. The Swift code changes the ordering of sharp and soft pulses to
suggest direction.

The custom module is needed because `expo-haptics` provides high-level
selection, impact, and notification feedback, whereas telemetry needs authored,
continuously changing patterns.

The 20 Hz boundary is deliberate. JavaScript sends small parameter updates,
while Swift keeps a persistent looping player instead of recreating the complete
pattern on every animation frame. If the product eventually needed much higher
update rates or tighter timing, more of the telemetry sampling would need to
move native-side.

### Minutes 12–14: Expo's role

Expo has four distinct responsibilities:

- **Application toolchain:** Metro, app configuration, native project
  generation, development builds, and EAS build profiles.
- **Universal navigation:** Expo Router maps files in `src/app` to web and
  native routes.
- **Standard native APIs:** `expo-status-bar`, `expo-haptics`, linking, and the
  development client.
- **Custom module plumbing:** Expo Modules Core registers the Swift/Kotlin
  implementation, marshals values across the JavaScript/native boundary, and
  exposes native async functions as promises.

Expo does not implement the telemetry formula or Core Haptics behavior. It is
the toolchain and module layer connecting React Native to the custom Swift code.

Because Swift code must be compiled into the application, the custom haptics
require a development build:

```sh
npm run ios:device
```

A JavaScript refresh can change the telemetry formulas, but a Swift change
requires rebuilding the development client. A stock client that does not contain
`F1Haptics` cannot acquire the module through a JavaScript reload.

### Minutes 14–15: Limitations and tradeoffs

- Android's custom module currently reports `isSupported() === false` and leaves
  waveform translation as a stub. Semantic interactions fall back to
  `expo-haptics`; continuous telemetry haptics remain disabled.
- Haptic errors are swallowed so feedback failure cannot interrupt replay. That
  is graceful degradation, but production code should add non-intrusive
  observability.
- TypeScript mapping and lifecycle behavior are tested, but Core Haptics still
  requires physical-device testing and tuning.
- The replay repository defaults to browser-style relative URLs such as
  `/replays/v1/`. That works for static web hosting, but a production native
  target should verify and likely provide an absolute server URL or a bundled
  asset repository.

## Testing and quality toolchain

The root `npm run ci` command mirrors the GitHub Actions quality job. It runs
formatting, linting, type checking, tests, and a production-style web export.

### TypeScript and React Native tests

- **Jest 29** is the main application test runner.
- **`jest-expo`** provides the Expo/React Native Jest preset and environment.
- **React Native Testing Library** renders hooks, components, and complete route
  trees and drives presses, accessibility actions, and other interactions.
- **Jest snapshots** cover selected UI primitive output.
- Tests run serially with `jest --runInBand`, which favors deterministic output
  and avoids unnecessary contention in this relatively small suite.

The application suite includes:

- Pure domain and playback state-machine tests
- Replay parsing, repository, loading, caching, and frame-selector tests
- Component and route-level interaction tests
- Accessibility behavior tests
- Semantic feedback mapping and debounce tests
- Telemetry-to-haptics formula tests
- Native adapter fallback tests using injected mock effects
- Telemetry haptic lifecycle tests using an injected mock native module

The native-facing tests verify the JavaScript contract and lifecycle, not
Apple's haptic engine itself. There are currently no Swift unit tests, Android
instrumentation tests, Detox tests, or physical-device tests in the automated
suite.

### Python ingestion tests

- **pytest 8** runs the ingestion-pipeline tests.
- **jsonschema** validates emitted replay artifacts against the repository's
  JSON schemas.
- **PyYAML** supports ingestion configuration and related validation.

The pytest suite covers cache behavior, HTTP/provider handling, OpenF1
normalization, timing, geometry, telemetry calculations, artifact emission,
schema compliance, CLI behavior, and CI configuration.

Most tests use checked-in tiny fixtures, avoiding live OpenF1 calls and keeping
results deterministic.

### Additional validation

- **TypeScript** runs with `tsc --noEmit` for both the domain package and replay
  application.
- **ESLint** uses TypeScript, React, React Hooks, React Native, import, and JSX
  accessibility rules with warnings treated as errors.
- **Prettier** performs a repository-wide formatting check.
- **Node's built-in test runner** executes `tests/tooling.test.mjs`, which checks
  repository and tooling expectations outside the Jest application suite.
- **Expo static export** runs `expo export --platform web`, catching route,
  bundling, platform-resolution, and production web-build failures that unit
  tests may miss.
- **GitHub Actions** installs pinned Node and Python versions, installs
  dependencies from lock files, and runs all of these checks on pull requests
  and pushes to `main`.

Useful commands:

```sh
# Complete local CI-equivalent validation
npm run ci

# All JavaScript/TypeScript and Python tests
npm test

# Expo/Jest application tests only
npm run test:app

# Python ingestion tests only
npm run test:python

# Static checks without tests
npm run format:check
npm run lint
npm run typecheck

# Verify the production web bundle
npm run build:web
```

## Suggested closing answer

> The project uses Expo to maintain one universal React Native application.
> React Native Web handles the browser target, while small platform-specific
> files cover controls, DOM focus, and haptics. For haptics, TypeScript owns the
> testable mapping from F1 telemetry to intensity, rate, and impact parameters;
> Expo Modules Core transports those values to Swift; and Swift owns Core
> Haptics engine lifecycle and playback. Standard interactions fall back to Expo
> Haptics, Android is currently stubbed, and web degrades to no feedback. The
> test strategy emphasizes deterministic domain and UI behavior with Jest,
> React Native Testing Library, and pytest, while native hardware behavior still
> requires device-level validation.
