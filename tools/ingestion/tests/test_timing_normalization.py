import json
from pathlib import Path

from tools.ingestion.f1_replay.normalize.timing import normalize_timing_snapshot
from tools.ingestion.f1_replay.provider import FilesystemProvider, provider_readers


ROOT = Path(__file__).parents[3]
RAW_FIXTURE = ROOT / "tools" / "ingestion" / "fixtures" / "raw" / "tiny"
EXPECTED_REPORT = (
    ROOT
    / "tools"
    / "ingestion"
    / "fixtures"
    / "normalized"
    / "tiny"
    / "timing-report.json"
)


def driver(number: int) -> dict[str, object]:
    return {
        "driver_number": number,
        "full_name": f"Driver {number}",
        "name_acronym": f"D{number}",
        "session_key": 10,
        "team_colour": "112233",
        "team_name": "Test Team",
    }


def lap(
    number: int,
    lap_number: int,
    start: str,
    duration: float | None,
    **changes: object,
) -> dict[str, object]:
    value = {
        "date_start": start,
        "driver_number": number,
        "duration_sector_1": None,
        "duration_sector_2": None,
        "duration_sector_3": None,
        "is_pit_out_lap": False,
        "lap_duration": duration,
        "lap_number": lap_number,
        "session_key": 10,
    }
    value.update(changes)
    return value


def snapshot(
    drivers: list[dict[str, object]],
    laps: list[dict[str, object]],
    *,
    start: str = "2024-01-01T12:00:00Z",
    end: str = "2024-01-01T12:00:10Z",
) -> dict[str, object]:
    return {
        "provider": "filesystem",
        "datasets": {
            "meetings": [],
            "sessions": [{"date_start": start, "date_end": end}],
            "drivers": drivers,
            "laps": laps,
            "locations": [],
            "car_data": [],
        },
    }


def test_tiny_timing_report_matches_manually_checked_source_rows() -> None:
    provider = FilesystemProvider(RAW_FIXTURE)
    datasets = {
        name: reader() for name, reader in provider_readers(provider).items()
    }
    expected = json.loads(EXPECTED_REPORT.read_text(encoding="utf-8"))

    assert normalize_timing_snapshot(
        {"provider": "filesystem", "datasets": datasets}
    ) == expected


def test_timezone_offsets_become_relative_integer_milliseconds() -> None:
    report = normalize_timing_snapshot(
        snapshot(
            [driver(1)],
            [lap(1, 1, "2024-01-01T10:00:01.2346Z", 1.0005)],
            start="2024-01-01T12:00:00+02:00",
            end="2024-01-01T12:00:10+02:00",
        )
    )

    assert report["sessionStartUtc"] == "2024-01-01T10:00:00Z"
    assert report["laps"][0]["startMs"] == 1234
    assert report["laps"][0]["durationMs"] == 1001


def test_duplicate_out_of_order_invalid_and_tied_laps_follow_stable_rules() -> None:
    records = [
        lap(2, 2, "2024-01-01T12:00:04Z", 1.0),
        lap(1, 3, "2024-01-01T12:00:05Z", 1.0),
        lap(1, 1, "2024-01-01T12:00:01Z", None),
        lap(2, 1, "2024-01-01T12:00:02Z", 0.9, is_pit_out_lap=True),
        lap(1, 2, "2024-01-01T12:00:03Z", 0.8, is_deleted=True),
        lap(1, 1, "2024-01-01T12:00:01Z", 1.0),
        lap(99, 1, "2024-01-01T12:00:01Z", 0.5),
    ]
    report = normalize_timing_snapshot(
        snapshot([driver(3), driver(2), driver(1), driver(1)], records)
    )

    assert [item["driverNumber"] for item in report["drivers"]] == [1, 2, 3]
    assert report["fastestLapsByDriver"] == [
        {"driverId": "driver-1", "durationMs": 1000, "lapNumber": 1},
        {"driverId": "driver-2", "durationMs": 1000, "lapNumber": 2},
    ]
    assert report["overallFastestLap"] == {
        "driverId": "driver-1",
        "durationMs": 1000,
        "lapNumber": 1,
    }
    assert report["lastLapsByDriver"] == [
        {"driverId": "driver-1", "durationMs": 1000, "lapNumber": 3},
        {"driverId": "driver-2", "durationMs": 1000, "lapNumber": 2},
    ]
    invalid_laps = [item for item in report["laps"] if item["isValid"] is False]
    assert {item["lapNumber"] for item in invalid_laps} == {1, 2}
    pit_lap = next(
        item
        for item in report["laps"]
        if item["driverId"] == "driver-2" and item["lapNumber"] == 1
    )
    deleted_lap = next(
        item
        for item in report["laps"]
        if item["driverId"] == "driver-1" and item["lapNumber"] == 2
    )
    assert pit_lap["isPitOutLap"] is True and pit_lap["isValid"] is False
    assert deleted_lap["isValid"] is False
    warnings = "\n".join(report["warnings"])
    assert "out of order" in warnings
    assert "duplicate records" in warnings
    assert "unknown driver 99" in warnings
    assert "incomplete sector timing" in warnings


def test_first_lap_may_start_after_the_official_session_start() -> None:
    report = normalize_timing_snapshot(
        snapshot(
            [driver(1)],
            [
                lap(
                    1,
                    1,
                    "2024-01-01T12:00:03Z",
                    2.0,
                    duration_sector_1=0.6,
                    duration_sector_2=0.7,
                    duration_sector_3=0.7,
                )
            ],
        )
    )

    assert report["laps"][0]["startMs"] == 3000
    assert report["laps"][0]["sectorsMs"] == [600, 700, 700]


def test_late_source_data_expands_the_scheduled_session_end() -> None:
    value = snapshot(
        [driver(1)],
        [lap(1, 1, "2024-01-01T12:00:12Z", 2.0)],
        end="2024-01-01T12:00:10Z",
    )
    value["datasets"]["locations"] = [
        {
            "date": "2024-01-01T12:00:15Z",
            "driver_number": 1,
            "x": 0,
            "y": 0,
        }
    ]

    report = normalize_timing_snapshot(value)

    assert report["sessionEndMs"] == 15000
    assert report["laps"][0]["startMs"] == 12000
    assert "expanded beyond scheduled" in "\n".join(report["warnings"])
