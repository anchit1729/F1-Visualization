import json
import math
from pathlib import Path

import pytest

from tools.ingestion.f1_replay.derive.telemetry import (
    SourceTelemetry,
    TelemetryConfig,
    derive_driver_samples,
    normalize_telemetry_snapshot,
)
from tools.ingestion.f1_replay.geometry.track import normalize_geometry_snapshot
from tools.ingestion.f1_replay.normalize.timing import normalize_timing_snapshot
from tools.ingestion.f1_replay.provider import FilesystemProvider, provider_readers


ROOT = Path(__file__).parents[3]
RAW_FIXTURE = ROOT / "tools" / "ingestion" / "fixtures" / "raw" / "tiny"


def sample(time_ms: int, speed_kph: float | None) -> SourceTelemetry:
    return SourceTelemetry(
        driver_id="driver-1",
        driver_number=1,
        time_ms=time_ms,
        speed_kph=speed_kph,
        throttle_percent=50,
        brake_applied=False,
        rpm=8000,
        gear=4,
        drs=0,
    )


def tiny_reports() -> tuple[dict[str, object], dict[str, object], dict[str, object]]:
    provider = FilesystemProvider(RAW_FIXTURE)
    source = {
        "provider": "filesystem",
        "datasets": {
            name: reader() for name, reader in provider_readers(provider).items()
        },
    }
    timing = normalize_timing_snapshot(source)
    geometry = normalize_geometry_snapshot(source, timing)
    return source, timing, geometry


def test_constant_speed_produces_near_zero_longitudinal_g() -> None:
    samples = [sample(time_ms, 100) for time_ms in range(0, 5000, 1000)]
    result = derive_driver_samples(samples, [], TelemetryConfig(), [])

    assert all(
        item["longitudinalG"] == pytest.approx(0, abs=0.0001) for item in result
    )


def test_linear_acceleration_matches_expected_g_after_smoothing() -> None:
    acceleration_mps2 = 2.0
    samples = [
        sample(time_ms, acceleration_mps2 * (time_ms / 1000) * 3.6)
        for time_ms in range(0, 5000, 1000)
    ]
    result = derive_driver_samples(samples, [], TelemetryConfig(), [])

    assert result[2]["longitudinalG"] == pytest.approx(
        acceleration_mps2 / 9.80665,
        abs=0.0001,
    )


def test_constant_radius_motion_matches_expected_lateral_g() -> None:
    angular_rate = 0.2
    speed_mps = 10.0
    samples = [sample(time_ms, speed_mps * 3.6) for time_ms in range(0, 5000, 1000)]
    positions = [
        {
            "timeMs": time_ms,
            "x": 100 * math.cos(angular_rate * time_ms / 1000),
            "y": 100 * math.sin(angular_rate * time_ms / 1000),
        }
        for time_ms in range(0, 5000, 1000)
    ]
    result = derive_driver_samples(samples, positions, TelemetryConfig(), [])

    assert abs(result[2]["lateralG"]) == pytest.approx(
        speed_mps * angular_rate / 9.80665,
        abs=0.0001,
    )
    assert result[2]["gForceQuality"] == "estimated"


def test_unsafe_gaps_are_unavailable_and_spikes_are_clipped_low_quality() -> None:
    gaps = [sample(0, 100), sample(1000, 100), sample(5000, 100)]
    unavailable = derive_driver_samples(gaps, [], TelemetryConfig(), [])
    warnings: list[str] = []
    spike_samples = [
        sample(time_ms, speed)
        for time_ms, speed in ((0, 0), (1000, 100), (2000, 200), (3000, 300), (4000, 400))
    ]
    clipped = derive_driver_samples(
        spike_samples,
        [],
        TelemetryConfig(max_abs_g=0.1),
        warnings,
    )

    assert unavailable[1]["gForceQuality"] == "unavailable"
    assert unavailable[1]["sourceGapMs"] is None
    assert clipped[2]["longitudinalG"] == 0.1
    assert clipped[2]["gForceQuality"] == "low"
    assert "clipped 5 derived g-force samples" in warnings[0]


def test_tiny_normalization_is_deterministic_and_preserves_missing_channels() -> None:
    source, timing, geometry = tiny_reports()
    first = normalize_telemetry_snapshot(source, timing, geometry)
    reversed_source = json.loads(json.dumps(source))
    reversed_source["datasets"]["car_data"].reverse()
    second = normalize_telemetry_snapshot(reversed_source, timing, geometry)

    assert first == second
    missing = first["telemetryByDriver"]["driver-5"][1]
    assert missing["speedKph"] is None
    assert missing["throttlePercent"] is None
    assert missing["rpm"] is None
    assert missing["longitudinalG"] is None
    assert missing["lateralG"] is None
    assert missing["gForceQuality"] == "unavailable"
    assert first["diagnostics"]["qualityCounts"]["estimated"] > 0


def test_invalid_source_speed_is_not_exposed_as_real_telemetry() -> None:
    source, timing, geometry = tiny_reports()
    changed = json.loads(json.dumps(source))
    changed["datasets"]["car_data"][0]["speed"] = 1000

    report = normalize_telemetry_snapshot(changed, timing, geometry)

    assert report["telemetryByDriver"]["driver-4"][0]["speedKph"] is None
    assert "invalid speed" in report["warnings"][0]
