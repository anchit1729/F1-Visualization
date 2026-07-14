import json
from pathlib import Path

import pytest

from tools.ingestion.f1_replay.derive.telemetry import normalize_telemetry_snapshot
from tools.ingestion.f1_replay.emit import artifacts
from tools.ingestion.f1_replay.emit.artifacts import (
    EmitConfig,
    build_chunks,
    emit_replay_artifacts,
    replay_start_ms,
    tree_hashes,
    verify_emitted_artifacts,
)
from tools.ingestion.f1_replay.geometry.track import normalize_geometry_snapshot
from tools.ingestion.f1_replay.normalize.timing import normalize_timing_snapshot
from tools.ingestion.f1_replay.provider import FilesystemProvider, provider_readers


ROOT = Path(__file__).parents[3]
RAW_FIXTURE = ROOT / "tools" / "ingestion" / "fixtures" / "raw" / "tiny"
PUBLIC_ARTIFACTS = ROOT / "apps" / "replay" / "public" / "replays" / "v1"


def reports() -> tuple[dict[str, object], ...]:
    provider = FilesystemProvider(RAW_FIXTURE)
    source = {
        "provider": "filesystem",
        "datasets": {
            name: reader() for name, reader in provider_readers(provider).items()
        },
    }
    timing = normalize_timing_snapshot(source)
    geometry = normalize_geometry_snapshot(source, timing)
    telemetry = normalize_telemetry_snapshot(source, timing, geometry)
    return source, timing, geometry, telemetry


def config(**changes: object) -> EmitConfig:
    values = {
        "replay_id": "tiny-demo",
        "title": "Tiny Grand Prix",
        "subtitle": "Race · deterministic fixture",
        "replay_scope": "race",
        "chunk_duration_ms": 5000,
        "max_total_bytes": 100000,
        "max_initial_bytes": 50000,
        "transformation_version": "ingestion-v1",
        "source_url": "https://f1-replay.local/fixtures/tiny",
        "retrieved_at_utc": "2024-01-01T12:00:00Z",
    }
    values.update(changes)
    return EmitConfig(**values)


def test_boundary_sample_is_in_both_chunks_and_final_partial_chunk_is_emitted() -> None:
    _, _, geometry, telemetry = reports()
    chunks = build_chunks(
        "tiny-demo",
        12000,
        5000,
        geometry["locationsByDriver"],
        telemetry["telemetryByDriver"],
    )

    assert [(chunk["startMs"], chunk["endMs"]) for chunk, _ in chunks] == [
        (0, 5000),
        (5000, 10000),
        (10000, 12000),
    ]
    assert chunks[0][0]["locationsByDriver"]["driver-4"][-1]["timeMs"] == 5000
    assert chunks[1][0]["locationsByDriver"]["driver-4"][0]["timeMs"] == 5000
    assert chunks[0][0]["telemetryByDriver"]["driver-4"][-1]["timeMs"] == 5000
    assert chunks[1][0]["telemetryByDriver"]["driver-4"][0]["timeMs"] == 5000


def test_replay_start_uses_first_lap_and_excludes_scheduled_delay_data() -> None:
    timing = {"laps": [{"startMs": 2737813}]}
    geometry = {"locationsByDriver": {"driver-1": [{"timeMs": 0}]}}
    telemetry = {
        "telemetryByDriver": {
            "driver-1": [{"timeMs": 0, "speedKph": 0}]
        }
    }

    assert replay_start_ms(timing, geometry, telemetry, 30000) == 2730000


def test_emitted_artifacts_are_schema_valid_and_reproducible(tmp_path: Path) -> None:
    source, timing, geometry, telemetry = reports()
    first = tmp_path / "first"
    second = tmp_path / "second"

    first_budget = emit_replay_artifacts(
        first, source, timing, geometry, telemetry, config()
    )
    second_budget = emit_replay_artifacts(
        second, source, timing, geometry, telemetry, config()
    )
    verify_emitted_artifacts(first)
    verify_emitted_artifacts(second)

    assert tree_hashes(first) == tree_hashes(second)
    assert first_budget == second_budget
    assert first_budget["chunkCount"] == 2
    assert first_budget["totalBytes"] <= first_budget["limits"]["maxTotalBytes"]


def test_lap_replay_contains_only_the_selected_driver_and_window(
    tmp_path: Path,
) -> None:
    source, timing, geometry, telemetry = reports()
    lap_config = config(
        replay_id="tiny-lap",
        replay_scope="lap",
        lap_driver_number=4,
        lap_number=1,
    )

    emit_replay_artifacts(
        tmp_path,
        source,
        timing,
        geometry,
        telemetry,
        lap_config,
    )

    index = json.loads((tmp_path / "tiny-lap" / "index.json").read_text())
    chunk = json.loads(
        (tmp_path / "tiny-lap" / "chunks" / "00000.json").read_text()
    )
    catalog = json.loads((tmp_path / "catalog.json").read_text())
    assert index["timeline"] == {
        "startMs": 0,
        "endMs": 10000,
        "chunkDurationMs": 5000,
    }
    assert [driver["id"] for driver in index["drivers"]] == ["driver-4"]
    assert [(lap["driverId"], lap["lapNumber"]) for lap in index["laps"]] == [
        ("driver-4", 1)
    ]
    assert set(chunk["locationsByDriver"]) == {"driver-4"}
    assert set(chunk["telemetryByDriver"]) == {"driver-4"}
    assert catalog["replays"][0]["replayScope"] == "lap"
    assert catalog["replays"][0]["driverCount"] == 1


@pytest.mark.parametrize(
    ("driver_number", "lap_number", "message"),
    [
        (99, 1, "Driver 99 is not available"),
        (4, 99, "Lap 99 for driver 4 is not available"),
    ],
)
def test_lap_replay_rejects_unknown_selection(
    tmp_path: Path,
    driver_number: int,
    lap_number: int,
    message: str,
) -> None:
    source, timing, geometry, telemetry = reports()

    with pytest.raises(ValueError, match=message):
        emit_replay_artifacts(
            tmp_path,
            source,
            timing,
            geometry,
            telemetry,
            config(
                replay_scope="lap",
                lap_driver_number=driver_number,
                lap_number=lap_number,
            ),
        )


def test_hash_mismatch_is_detected(tmp_path: Path) -> None:
    source, timing, geometry, telemetry = reports()
    emit_replay_artifacts(tmp_path, source, timing, geometry, telemetry, config())
    chunk = tmp_path / "tiny-demo" / "chunks" / "00000.json"
    value = json.loads(chunk.read_text(encoding="utf-8"))
    value["locationsByDriver"] = {}
    chunk.write_text(json.dumps(value), encoding="utf-8")

    with pytest.raises(ValueError, match="byte size mismatch|hash mismatch"):
        verify_emitted_artifacts(tmp_path)


def test_interrupted_build_keeps_previous_artifacts_and_cleans_temporary_directory(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source, timing, geometry, telemetry = reports()
    emit_replay_artifacts(tmp_path, source, timing, geometry, telemetry, config())
    before = tree_hashes(tmp_path)
    original_write = artifacts.atomic_write_bytes

    def interrupted_write(path: Path, value: bytes) -> None:
        if path.name == "00001.json":
            raise OSError("simulated interruption")
        original_write(path, value)

    monkeypatch.setattr(artifacts, "atomic_write_bytes", interrupted_write)
    with pytest.raises(OSError, match="simulated interruption"):
        emit_replay_artifacts(tmp_path, source, timing, geometry, telemetry, config())

    assert tree_hashes(tmp_path) == before
    assert not (tmp_path / ".tiny-demo.tmp").exists()


@pytest.mark.parametrize(
    "changes",
    [
        {"max_total_bytes": 1},
        {"max_initial_bytes": 1},
    ],
)
def test_byte_budget_failure_does_not_publish(
    tmp_path: Path,
    changes: dict[str, int],
) -> None:
    source, timing, geometry, telemetry = reports()

    with pytest.raises(ValueError, match="byte budget"):
        emit_replay_artifacts(
            tmp_path,
            source,
            timing,
            geometry,
            telemetry,
            config(**changes),
        )
    assert not (tmp_path / "tiny-demo").exists()
    assert not (tmp_path / "catalog.json").exists()


def test_checked_in_public_artifacts_pass_independent_verification() -> None:
    verify_emitted_artifacts(PUBLIC_ARTIFACTS)
