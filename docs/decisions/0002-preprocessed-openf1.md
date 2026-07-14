# ADR 0002: Preprocess OpenF1 data for the demo

- Status: Accepted
- Date: 2026-07-12

## Context

Historical race position and telemetry feeds are large, asynchronous, and controlled by an upstream provider. Fetching and transforming them during application startup would make the demo dependent on network access, provider availability, CORS, and schema stability.

## Decision

Use an offline Python ingestion CLI to fetch, cache, normalize, validate, and emit versioned replay artifacts before publishing the application. The demo client reads only static, ready artifacts through `ReplayRepository` and never starts Python or contacts OpenF1 during normal startup.

## Consequences

- Demo playback is deterministic and cacheable.
- Provenance and transformation versions are stored with each artifact.
- Missing artifacts are developer/release errors during the demo phase.
- A future durable server worker may run the same idempotent ingestion pipeline and publish the same artifact contracts without changing replay screens.
