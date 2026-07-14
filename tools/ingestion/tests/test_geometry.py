import json
from pathlib import Path

import pytest

from tools.ingestion.f1_replay.geometry.track import (
    SIMPLIFICATION_TOLERANCE,
    clean_locations,
    make_transform,
    normalize_geometry_snapshot,
    polyline_distance,
    render_geometry_svg,
    simplify_path,
)
from tools.ingestion.f1_replay.normalize.timing import normalize_timing_snapshot
from tools.ingestion.f1_replay.provider import FilesystemProvider, provider_readers


ROOT = Path(__file__).parents[3]
RAW_FIXTURE = ROOT / "tools" / "ingestion" / "fixtures" / "raw" / "tiny"
EXPECTED_SVG = (
    ROOT
    / "tools"
    / "ingestion"
    / "fixtures"
    / "normalized"
    / "tiny"
    / "geometry-diagnostic.svg"
)


def tiny_snapshot() -> dict[str, object]:
    provider = FilesystemProvider(RAW_FIXTURE)
    return {
        "provider": "filesystem",
        "datasets": {
            name: reader() for name, reader in provider_readers(provider).items()
        },
    }


def test_transform_round_trip_and_aspect_ratio_are_preserved() -> None:
    transform, _ = make_transform([(0, 0), (200, 100)])
    source = (125.25, 75.5)
    restored = transform.inverse(transform.forward(source))
    horizontal = abs(transform.forward((10, 0))[0] - transform.forward((0, 0))[0])
    vertical = abs(transform.forward((0, 10))[1] - transform.forward((0, 0))[1])

    assert restored == pytest.approx(source)
    assert horizontal == pytest.approx(vertical)


@pytest.mark.parametrize("points", [[], [(0, 0), (0, 10)], [(0, 0), (10, 0)]])
def test_empty_and_degenerate_tracks_are_rejected(points: list[tuple[int, int]]) -> None:
    with pytest.raises(ValueError, match="location points|degenerate"):
        make_transform(points)


def test_large_location_jump_is_excluded() -> None:
    points = [(0, 0), (10, 0), (20, 0), (1000, 1000), (30, 0), (40, 0), (50, 0)]
    records = [
        {
            "date": f"2024-01-01T12:00:0{index}Z",
            "driver_number": 1,
            "x": point[0],
            "y": point[1],
        }
        for index, point in enumerate(points)
    ]
    warnings: list[str] = []

    samples, excluded = clean_locations(
        records,
        {1: "driver-1"},
        "2024-01-01T12:00:00Z",
        6000,
        warnings,
    )

    assert excluded == 1
    assert len(samples) == 6
    assert "large location jumps" in warnings[0]


def test_simplification_stays_within_tolerance() -> None:
    points = [(float(index), 0.2 if index % 2 else 0.0) for index in range(20)]
    simplified = simplify_path(points, SIMPLIFICATION_TOLERANCE)

    assert len(simplified) < len(points)
    assert max(polyline_distance(point, simplified) for point in points) <= SIMPLIFICATION_TOLERANCE


def test_geometry_is_deterministic_and_uses_one_transform_for_track_and_cars() -> None:
    source = tiny_snapshot()
    timing = normalize_timing_snapshot(source)
    first = normalize_geometry_snapshot(source, timing)
    reversed_source = json.loads(json.dumps(source))
    reversed_source["datasets"]["locations"].reverse()
    second = normalize_geometry_snapshot(reversed_source, timing)

    assert first == second
    assert len(first["track"]["sectorBoundaries"]) == 2
    assert first["diagnostics"]["representativeOverlayMaxError"] <= first[
        "diagnostics"
    ]["overlayTolerance"]
    first_car = first["locationsByDriver"]["driver-4"][0]
    assert first_car["quality"] == "source"
    assert 0 <= first_car["x"] <= 1000
    assert 0 <= first_car["y"] <= 1000


def test_tiny_geometry_diagnostic_matches_golden_svg() -> None:
    source = tiny_snapshot()
    report = normalize_geometry_snapshot(source, normalize_timing_snapshot(source))

    assert render_geometry_svg(report) == EXPECTED_SVG.read_text(encoding="utf-8")
