import hashlib
import json
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator, FormatChecker, RefResolver

from ..provider import JsonRecord


ROOT = Path(__file__).parents[4]
SCHEMAS = ROOT / "schemas"


@dataclass(frozen=True)
class EmitConfig:
    replay_id: str
    title: str
    subtitle: str
    replay_scope: str
    chunk_duration_ms: int
    max_total_bytes: int
    max_initial_bytes: int
    transformation_version: str
    source_url: str | None = None
    retrieved_at_utc: str | None = None
    lap_driver_number: int | None = None
    lap_number: int | None = None


def canonical_bytes(value: object) -> bytes:
    return (json.dumps(value, indent=2, sort_keys=True) + "\n").encode("utf-8")


def sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def load_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def validator_for(schema_name: str) -> Draft202012Validator:
    common = load_json(SCHEMAS / "common.schema.json")
    schema = load_json(SCHEMAS / schema_name)
    resolver = RefResolver.from_schema(
        schema,
        store={common["$id"]: common, schema["$id"]: schema},
    )
    return Draft202012Validator(
        schema,
        format_checker=FormatChecker(),
        resolver=resolver,
    )


def validate(value: object, schema_name: str) -> None:
    errors = sorted(validator_for(schema_name).iter_errors(value), key=lambda error: list(error.path))
    if errors:
        location = ".".join(str(part) for part in errors[0].path) or "root"
        raise ValueError(f"{schema_name} validation failed at {location}: {errors[0].message}")


def atomic_write_bytes(path: Path, value: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(f"{path.suffix}.tmp")
    temporary.write_bytes(value)
    temporary.replace(path)


def records_in_range(
    records_by_driver: dict[str, list[JsonRecord]],
    start_ms: int,
    end_ms: int,
) -> dict[str, list[JsonRecord]]:
    return {
        driver_id: [
            record
            for record in records
            if start_ms <= int(record["timeMs"]) <= end_ms
        ]
        for driver_id, records in sorted(records_by_driver.items())
        if any(start_ms <= int(record["timeMs"]) <= end_ms for record in records)
    }


def build_chunks(
    replay_id: str,
    end_ms: int,
    chunk_duration_ms: int,
    locations_by_driver: dict[str, list[JsonRecord]],
    telemetry_by_driver: dict[str, list[JsonRecord]],
    start_ms: int = 0,
) -> list[tuple[JsonRecord, bytes]]:
    if chunk_duration_ms <= 0:
        raise ValueError("Chunk duration must be positive")
    chunks: list[tuple[JsonRecord, bytes]] = []
    while start_ms < end_ms:
        chunk_end_ms = min(start_ms + chunk_duration_ms, end_ms)
        chunk: JsonRecord = {
            "schemaVersion": 1,
            "replayId": replay_id,
            "startMs": start_ms,
            "endMs": chunk_end_ms,
            "locationsByDriver": records_in_range(
                locations_by_driver,
                start_ms,
                chunk_end_ms,
            ),
            "telemetryByDriver": records_in_range(
                telemetry_by_driver,
                start_ms,
                chunk_end_ms,
            ),
        }
        validate(chunk, "replay-chunk.schema.json")
        chunks.append((chunk, canonical_bytes(chunk)))
        start_ms = chunk_end_ms
    return chunks


def replay_start_ms(
    timing: JsonRecord,
    geometry: JsonRecord,
    telemetry: JsonRecord,
    chunk_duration_ms: int,
) -> int:
    location_times = [
        int(record["timeMs"])
        for records in geometry["locationsByDriver"].values()
        for record in records
    ]
    lap_times = [int(lap["startMs"]) for lap in timing["laps"]]
    times = lap_times or [
        int(record["timeMs"])
        for records in telemetry["telemetryByDriver"].values()
        for record in records
        if isinstance(record.get("speedKph"), (int, float))
        and record["speedKph"] > 0
    ]
    if not times:
        times = location_times
    if not times:
        raise ValueError("Replay artifacts require timed samples")
    return min(times) // chunk_duration_ms * chunk_duration_ms


def select_lap_reports(
    timing: JsonRecord,
    geometry: JsonRecord,
    telemetry: JsonRecord,
    config: EmitConfig,
) -> tuple[JsonRecord, JsonRecord, JsonRecord, int, int]:
    if config.lap_driver_number is None or config.lap_number is None:
        raise ValueError("Lap replays require a driver number and lap number")
    driver = next(
        (
            item
            for item in timing["drivers"]
            if item["driverNumber"] == config.lap_driver_number
        ),
        None,
    )
    if driver is None:
        raise ValueError(f"Driver {config.lap_driver_number} is not available")
    driver_id = str(driver["id"])
    lap = next(
        (
            item
            for item in timing["laps"]
            if item["driverId"] == driver_id
            and item["lapNumber"] == config.lap_number
        ),
        None,
    )
    if lap is None:
        raise ValueError(
            f"Lap {config.lap_number} for driver {config.lap_driver_number} is not available"
        )
    start_ms = int(lap["startMs"])
    end_ms = int(lap["endMs"])
    fastest_lap = (
        {
            "driverId": driver_id,
            "durationMs": lap["durationMs"],
            "lapNumber": lap["lapNumber"],
        }
        if lap["isValid"] and lap["durationMs"] is not None
        else None
    )
    selected_timing = {
        **timing,
        "drivers": [driver],
        "laps": [lap],
        "overallFastestLap": fastest_lap,
        "sessionEndMs": end_ms,
    }
    selected_geometry = {
        **geometry,
        "locationsByDriver": {
            driver_id: geometry["locationsByDriver"].get(driver_id, [])
        },
    }
    selected_telemetry = {
        **telemetry,
        "telemetryByDriver": {
            driver_id: telemetry["telemetryByDriver"].get(driver_id, [])
        },
    }
    return selected_timing, selected_geometry, selected_telemetry, start_ms, end_ms


def build_provenance(
    snapshot: JsonRecord,
    config: EmitConfig,
) -> list[JsonRecord]:
    raw_provenance = snapshot.get("provenance")
    if snapshot.get("provider") == "openf1" and isinstance(raw_provenance, list):
        provenance = [
            {
                "provider": "OpenF1",
                "sourceUrl": item["requestUrl"],
                "retrievedAtUtc": item["retrievedAt"],
                "sourceHash": item["sha256"],
                "transformationVersion": config.transformation_version,
            }
            for item in raw_provenance
            if isinstance(item, dict)
        ]
        if provenance:
            return provenance
    if not config.source_url or not config.retrieved_at_utc:
        raise ValueError("Filesystem artifacts require source URL and retrieval time")
    return [
        {
            "provider": str(snapshot.get("provider", "filesystem")),
            "sourceUrl": config.source_url,
            "retrievedAtUtc": config.retrieved_at_utc,
            "sourceHash": sha256(canonical_bytes(snapshot)),
            "transformationVersion": config.transformation_version,
        }
    ]


def data_quality(
    timing: JsonRecord,
    geometry: JsonRecord,
    telemetry: JsonRecord,
) -> JsonRecord:
    counts = telemetry["diagnostics"]["qualityCounts"]
    if counts["estimated"] > 0:
        derived_quality = "estimated"
    elif counts["low"] > 0:
        derived_quality = "low"
    else:
        derived_quality = "unavailable"
    warnings = sorted(
        set(timing.get("warnings", []))
        | set(geometry.get("warnings", []))
        | set(telemetry.get("warnings", []))
    )
    return {
        "warnings": warnings,
        "excludedLocationSamplePercentage": geometry["diagnostics"][
            "excludedSamplePercentage"
        ],
        "derivedGForce": derived_quality,
    }


def catalog_entry(
    snapshot: JsonRecord,
    timing: JsonRecord,
    geometry: JsonRecord,
    config: EmitConfig,
    index_bytes: bytes,
    provenance: list[JsonRecord],
    start_ms: int,
) -> JsonRecord:
    meetings = snapshot["datasets"]["meetings"]
    sessions = snapshot["datasets"]["sessions"]
    meeting = meetings[0]
    session = sessions[0]
    end_ms = int(timing["sessionEndMs"])
    return {
        "id": config.replay_id,
        "schemaVersion": 1,
        "title": config.title,
        "subtitle": config.subtitle,
        "season": int(meeting["year"]),
        "meetingName": str(meeting["meeting_name"]),
        "sessionName": str(session["session_name"]),
        "replayScope": config.replay_scope,
        "durationMs": end_ms - start_ms,
        "startTimeMs": start_ms,
        "endTimeMs": end_ms,
        "driverCount": len(timing["drivers"]),
        "trackPreview": geometry["thumbnail"],
        "bundle": {
            "indexUrl": f"{config.replay_id}/index.json",
            "byteSize": len(index_bytes),
            "sha256": sha256(index_bytes),
        },
        "provenance": provenance,
    }


def replace_directory(temporary: Path, target: Path) -> None:
    backup = target.with_name(f".{target.name}.backup")
    if backup.exists():
        shutil.rmtree(backup)
    if target.exists():
        target.rename(backup)
    try:
        temporary.rename(target)
    except Exception:
        if backup.exists() and not target.exists():
            backup.rename(target)
        raise
    if backup.exists():
        shutil.rmtree(backup)


def emit_replay_artifacts(
    root: Path,
    snapshot: JsonRecord,
    timing: JsonRecord,
    geometry: JsonRecord,
    telemetry: JsonRecord,
    config: EmitConfig,
) -> JsonRecord:
    if config.replay_scope not in {"race", "lap"}:
        raise ValueError("Replay scope must be race or lap")
    if config.replay_scope == "lap":
        timing, geometry, telemetry, timeline_start_ms, timeline_end_ms = (
            select_lap_reports(timing, geometry, telemetry, config)
        )
    else:
        timeline_start_ms = replay_start_ms(
            timing,
            geometry,
            telemetry,
            config.chunk_duration_ms,
        )
        timeline_end_ms = int(timing["sessionEndMs"])
    root.mkdir(parents=True, exist_ok=True)
    target = root / config.replay_id
    temporary = root / f".{config.replay_id}.tmp"
    if temporary.exists():
        shutil.rmtree(temporary)
    temporary.mkdir()

    try:
        chunks = build_chunks(
            config.replay_id,
            timeline_end_ms,
            config.chunk_duration_ms,
            geometry["locationsByDriver"],
            telemetry["telemetryByDriver"],
            timeline_start_ms,
        )
        descriptors = []
        for index, (chunk, chunk_bytes) in enumerate(chunks):
            url = f"chunks/{index:05d}.json"
            atomic_write_bytes(temporary / url, chunk_bytes)
            descriptors.append(
                {
                    "startMs": chunk["startMs"],
                    "endMs": chunk["endMs"],
                    "url": url,
                    "byteSize": len(chunk_bytes),
                    "sha256": sha256(chunk_bytes),
                }
            )

        provenance = build_provenance(snapshot, config)
        replay_index: JsonRecord = {
            "id": config.replay_id,
            "schemaVersion": 1,
            "sessionStartUtc": timing["sessionStartUtc"],
            "timeline": {
                "startMs": timeline_start_ms,
                "endMs": timeline_end_ms,
                "chunkDurationMs": config.chunk_duration_ms,
            },
            "track": geometry["track"],
            "drivers": timing["drivers"],
            "laps": timing["laps"],
            "overallFastestLap": timing["overallFastestLap"],
            "chunks": descriptors,
            "dataQuality": data_quality(timing, geometry, telemetry),
            "provenance": provenance,
        }
        validate(replay_index, "replay-index.schema.json")
        index_bytes = canonical_bytes(replay_index)
        atomic_write_bytes(temporary / "index.json", index_bytes)

        existing_catalog: JsonRecord = {"schemaVersion": 1, "replays": []}
        catalog_path = root / "catalog.json"
        if catalog_path.exists():
            loaded_catalog = load_json(catalog_path)
            if not isinstance(loaded_catalog, dict):
                raise ValueError("Existing catalog must be an object")
            existing_catalog = loaded_catalog
        entry = catalog_entry(
            snapshot,
            timing,
            geometry,
            config,
            index_bytes,
            provenance,
            timeline_start_ms,
        )
        entries = [
            replay
            for replay in existing_catalog["replays"]
            if replay["id"] != config.replay_id
        ] + [entry]
        entries.sort(key=lambda replay: (-int(replay["season"]), str(replay["id"])))
        catalog: JsonRecord = {"schemaVersion": 1, "replays": entries}
        validate(catalog, "catalog.schema.json")
        catalog_bytes = canonical_bytes(catalog)

        total_bytes = len(index_bytes) + sum(len(chunk_bytes) for _, chunk_bytes in chunks)
        initial_bytes = len(catalog_bytes) + len(index_bytes)
        if total_bytes > config.max_total_bytes:
            raise ValueError(
                f"Replay byte budget exceeded: {total_bytes} > {config.max_total_bytes}"
            )
        if initial_bytes > config.max_initial_bytes:
            raise ValueError(
                f"Initial-load byte budget exceeded: {initial_bytes} > {config.max_initial_bytes}"
            )

        replace_directory(temporary, target)
        atomic_write_bytes(catalog_path, catalog_bytes)
        return {
            "replayId": config.replay_id,
            "chunkCount": len(chunks),
            "totalBytes": total_bytes,
            "initialScreenBytes": initial_bytes,
            "limits": {
                "maxTotalBytes": config.max_total_bytes,
                "maxInitialBytes": config.max_initial_bytes,
            },
            "indexSha256": sha256(index_bytes),
            "catalogSha256": sha256(catalog_bytes),
        }
    except Exception:
        if temporary.exists():
            shutil.rmtree(temporary)
        raise


def verify_emitted_artifacts(root: Path, replay_id: str | None = None) -> None:
    catalog = load_json(root / "catalog.json")
    validate(catalog, "catalog.schema.json")
    for replay in catalog["replays"]:
        if replay_id is not None and replay["id"] != replay_id:
            continue
        index_path = root / replay["bundle"]["indexUrl"]
        index_bytes = index_path.read_bytes()
        if len(index_bytes) != replay["bundle"]["byteSize"]:
            raise ValueError(f"Index byte size mismatch: {index_path}")
        if sha256(index_bytes) != replay["bundle"]["sha256"]:
            raise ValueError(f"Index hash mismatch: {index_path}")
        replay_index = json.loads(index_bytes)
        validate(replay_index, "replay-index.schema.json")
        for descriptor in replay_index["chunks"]:
            chunk_path = index_path.parent / descriptor["url"]
            chunk_bytes = chunk_path.read_bytes()
            if len(chunk_bytes) != descriptor["byteSize"]:
                raise ValueError(f"Chunk byte size mismatch: {chunk_path}")
            if sha256(chunk_bytes) != descriptor["sha256"]:
                raise ValueError(f"Chunk hash mismatch: {chunk_path}")
            validate(json.loads(chunk_bytes), "replay-chunk.schema.json")


def tree_hashes(root: Path) -> dict[str, str]:
    return {
        str(path.relative_to(root)): sha256(path.read_bytes())
        for path in sorted(root.rglob("*.json"))
    }
