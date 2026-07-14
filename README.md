# F1 Replay

An Expo and React Native demo for replaying Formula 1 races and laps on an
interactive vector track. Select a driver to inspect synchronized telemetry and
timing data; the iOS development build also maps RPM, throttle, braking, and
estimated g-force to custom Core Haptics feedback.

This is an unofficial demonstration project and is not affiliated with Formula

1.

## Features

- Replay library with curated race and fastest-lap datasets
- Vector track rendering with synchronized driver positions
- Play, pause, seek, skip, and playback-rate controls
- Driver speed, throttle, brake, RPM, gear, DRS, timing, and estimated g-force
- System-aware light and dark themes with accessible controls
- Native iOS telemetry haptics behind a local Expo module
- Offline Python ingestion pipeline for deterministic OpenF1 artifacts

## Stack

- Expo SDK 57, React Native, React Native Web, and Expo Router
- TypeScript domain, playback, and UI packages
- Core Haptics through the local `f1-haptics` Expo module
- Python ingestion, normalization, validation, and artifact generation
- Jest, React Native Testing Library, pytest, ESLint, and Prettier

## Setup

Prerequisites:

- Node.js 22 (see `.nvmrc`)
- npm 10 or 11
- Python 3.10 (see `.python-version`)
- Xcode and CocoaPods for native iOS development

Install dependencies:

```sh
npm ci
python3 -m pip install --requirement requirements-dev.txt
```

Run the web application:

```sh
npm run web
```

Run the Expo development client:

```sh
npm run start
```

Build and install the iOS development client on a connected device:

```sh
npm run ios:device
```

Native module changes require rebuilding the development client; a JavaScript
reload cannot load newly compiled Swift code.

## Validation

Run the same checks used by CI:

```sh
npm run ci
```

This checks formatting, linting, TypeScript, JavaScript and Python tests, and the
web export.

## Replay data

The application reads checked-in, versioned replay artifacts from
`apps/replay/public/replays/v1`. It does not contact OpenF1 or launch Python at
runtime. Raw downloads, caches, and intermediate reports are intentionally
ignored.

Prepare the checked-in tiny fixture without network access:

```sh
npm run replay:prepare
```

See [the ingestion guide](tools/ingestion/README.md) for discovery, normalization,
geometry, telemetry, and artifact commands.

## Architecture and planning

- [Universal Expo decision](docs/decisions/0001-universal-expo.md)
- [Preprocessed OpenF1 decision](docs/decisions/0002-preprocessed-openf1.md)
- [Style guide](docs/style-guide.md)
- [Schema evolution](docs/schema-evolution.md)
