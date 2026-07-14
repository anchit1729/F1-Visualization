# Replay ingestion

This package prepares deterministic replay source data outside the application.
The Expo app never launches Python or downloads source data on startup.

Run the checked-in, network-free demo recipe from the repository root:

```sh
npm run replay:prepare
```

The command writes ignored cache and intermediate output under
`tools/ingestion/data/`. These files are inputs to the normalization and artifact
emission work planned for later steps; they are not yet application-ready replay
artifacts.

OpenF1 discovery uses human inputs rather than committed session keys. For example:

```sh
python3 -m tools.ingestion.f1_replay discover \
  --provider openf1 \
  --year 2023 \
  --meeting Belgium \
  --session-type "Sprint Qualifying" \
  --cache tools/ingestion/data/raw/openf1
```

The checked-in `openf1-belgium-sprint-2023.json` recipe can be passed to `build`
to download every required endpoint separately. Raw responses are cached by SHA-256;
request URL, retrieval time, byte size, response hash, ETag, and Last-Modified are
recorded alongside them. Requests have bounded timeouts, response sizes, and retries.
The current OpenF1 API does not document pagination, so oversized responses fail
clearly instead of being silently truncated. No credentials are stored.

The OpenF1 test suite normally uses recorded responses. Set `OPENF1_LIVE_TEST=1`
when running the Python tests to explicitly enable its small live discovery test.

## Timing normalization

Recipes with a `timingOutput` path also create a normalized timing report. You can
normalize an existing provider snapshot directly with:

```sh
python3 -m tools.ingestion.f1_replay normalize \
  tools/ingestion/data/output/tiny/provider-snapshot.json \
  --output tools/ingestion/data/output/tiny/timing-report.json
```

Session time uses integer milliseconds from the official session start. Lap and
sector values preserve missing source data as `null`; warnings record duplicate,
out-of-order, incomplete, pit-out, deleted, and otherwise invalid rows. Fastest-lap
selection considers only valid laps and resolves equal times by driver number and
then lap number.

## Geometry normalization

Recipes with `geometryOutput` use the timing report to select a representative lap,
clean invalid coordinates and large jumps, and apply one source-to-SVG transform to
both the centerline and every car sample. The output includes full and thumbnail
geometry, optional sector boundaries, transformed positions, and diagnostics for
point counts, exclusions, bounds, simplification error, overlay error, and transform
parameters.

The default viewBox is `0 0 1000 1000`, with a uniform scale and 60-unit padding.
Representative source samples must remain within 60 viewBox units of the generated
centerline. The recipe also emits an SVG diagnostic so track/car alignment can be
reviewed without launching the application.

## Telemetry and estimated g-force

Recipes with `telemetryOutput` synchronize source car data to session-relative time
without filling missing channels. Speed, throttle, brake, RPM, gear, and DRS remain
sourced values. `longitudinalG` and `lateralG` are derived estimates:

- Longitudinal g is the time derivative of locally smoothed speed, divided by
  standard gravity (`9.80665 m/s²`).
- Lateral g is speed multiplied by trajectory heading-change rate, divided by
  standard gravity. This uses direction rather than assuming a physical unit for
  OpenF1's circuit coordinates.

The default smoothing window is three samples, the maximum safe gap is 1500 ms, and
derived values are limited to ±8 g. Estimates spanning unsafe gaps are unavailable;
one-sided, partial, or clipped estimates are low quality. Each emitted sample carries
`gForceQuality` and the largest `sourceGapMs` used, so consumers can clearly label
g-force as estimated rather than measured.

## Artifact emission

Recipe `artifact` settings assemble normalized reports into a versioned static replay
directory. Samples exactly on a chunk boundary appear in both adjacent chunks. Every
chunk and index is schema-validated before publication, and its descriptor records the
exact byte size and SHA-256 hash. The replay directory is swapped atomically; the
catalog is validated and written only after the entire replay and its byte budgets
pass.

The catalog and emitted files can be checked independently:

```sh
python3 -m tools.ingestion.f1_replay verify-artifacts \
  apps/replay/public/replays/v1
```

If normalized reports already exist, regenerate only the immutable distributable
bytes without repeating download or normalization:

```sh
python3 -m tools.ingestion.f1_replay emit \
  --recipe tools/ingestion/recipes/tiny.json
```

An artifact recipe may select one driver's lap while reusing the session reports:

```json
"replayScope": "lap",
"lap": { "driverNumber": 1, "lapNumber": 6 }
```

Lap artifacts contain only that driver and lap window. They retain the session's
full vector track and provenance without duplicating the full race payload.

The public replay directory is intentionally excluded from Prettier. Formatting a
generated JSON file would change its byte hash and correctly fail verification.

Rebuild the recorded tiny artifact twice and compare every JSON hash with:

```sh
python3 -m tools.ingestion.f1_replay reproduce \
  --recipe tools/ingestion/recipes/tiny.json
```

The curated OpenF1 recipe emits the 2023 Belgian Grand Prix Sprint into the same
catalog. Its raw responses and intermediate reports remain in the ignored ingestion
data directory; the application depends only on the validated static catalog, index,
and chunks under `apps/replay/public/replays/v1`.

The 2024 Miami Sprint recipe provides a second complete race. The Belgium and Miami
fastest-lap recipes reuse their corresponding normalized reports and can be emitted
without another network request.

Inspect the available commands with:

```sh
python3 -m tools.ingestion.f1_replay --help
```
