import json
import re
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any, Iterable

from ..provider import JsonRecord


TEAM_COLOR = re.compile(r"^[0-9a-fA-F]{6}$")


def parse_timestamp(value: object, label: str) -> datetime:
    if not isinstance(value, str):
        raise ValueError(f"{label} must be an ISO 8601 timestamp")
    fraction = re.search(r"\.(\d{1,5})(?=Z|[+-]\d{2}:\d{2}$)", value)
    if fraction:
        padded = fraction.group(1).ljust(6, "0")
        value = f"{value[: fraction.start(1)]}{padded}{value[fraction.end(1) :]}"
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError(f"Invalid timestamp for {label}: {value}") from error
    if parsed.tzinfo is None:
        raise ValueError(f"{label} must include a UTC offset")
    return parsed.astimezone(timezone.utc)


def relative_milliseconds(timestamp: datetime, session_start: datetime) -> int:
    delta = timestamp - session_start
    return delta.days * 86_400_000 + delta.seconds * 1000 + delta.microseconds // 1000


def seconds_to_milliseconds(value: object) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        milliseconds = Decimal(str(value)) * 1000
    except (InvalidOperation, ValueError):
        return None
    if not milliseconds.is_finite():
        return None
    return int(milliseconds.to_integral_value(rounding=ROUND_HALF_UP))


def canonical_record(record: JsonRecord) -> str:
    return json.dumps(record, sort_keys=True, separators=(",", ":"))


def normalized_driver(record: JsonRecord, warnings: list[str]) -> JsonRecord:
    number = int(record["driver_number"])
    name = str(record.get("full_name") or record.get("broadcast_name") or f"Car {number}")
    raw_code = str(record.get("name_acronym") or "").strip().upper()
    if not 2 <= len(raw_code) <= 4:
        initials = "".join(part[0] for part in name.split() if part).upper()
        raw_code = initials[:4] if len(initials) >= 2 else "CAR"
        warnings.append(f"Driver {number}: generated missing driver code")
    team_name = str(record.get("team_name") or "Unknown team")
    if not record.get("team_name"):
        warnings.append(f"Driver {number}: missing team name")
    raw_color = str(record.get("team_colour") or "").removeprefix("#")
    team_color = f"#{raw_color}" if TEAM_COLOR.fullmatch(raw_color) else "#808080"
    if team_color == "#808080":
        warnings.append(f"Driver {number}: missing or invalid team colour")
    return {
        "id": f"driver-{number}",
        "driverNumber": number,
        "code": raw_code,
        "name": name,
        "teamName": team_name,
        "teamColor": team_color,
    }


def normalize_drivers(
    records: Iterable[JsonRecord],
    warnings: list[str],
) -> tuple[list[JsonRecord], dict[int, str]]:
    by_number: dict[int, list[JsonRecord]] = defaultdict(list)
    for record in records:
        number = record.get("driver_number")
        if not isinstance(number, int) or isinstance(number, bool) or not 1 <= number <= 99:
            warnings.append("Excluded driver with invalid driver_number")
            continue
        by_number[number].append(record)

    drivers: list[JsonRecord] = []
    ids: dict[int, str] = {}
    for number, candidates in sorted(by_number.items()):
        if len(candidates) > 1:
            warnings.append(f"Driver {number}: collapsed {len(candidates)} duplicate records")
        selected = min(
            candidates,
            key=lambda record: (
                -sum(value not in (None, "") for value in record.values()),
                canonical_record(record),
            ),
        )
        driver = normalized_driver(selected, warnings)
        drivers.append(driver)
        ids[number] = str(driver["id"])
    return drivers, ids


def lap_selection_key(record: JsonRecord) -> tuple[int, str]:
    duration = seconds_to_milliseconds(record.get("lap_duration"))
    unusable = (
        duration is None
        or duration <= 0
        or record.get("is_pit_out_lap") is True
        or record.get("is_deleted") is True
        or record.get("deleted") is True
        or record.get("is_valid") is False
    )
    return (1 if unusable else 0, canonical_record(record))


def deduplicate_laps(records: Iterable[JsonRecord], warnings: list[str]) -> list[JsonRecord]:
    grouped: dict[tuple[object, object], list[JsonRecord]] = defaultdict(list)
    for record in records:
        grouped[(record.get("driver_number"), record.get("lap_number"))].append(record)

    selected: list[JsonRecord] = []
    for key, candidates in grouped.items():
        if len(candidates) > 1:
            warnings.append(
                f"Driver {key[0]} lap {key[1]}: collapsed {len(candidates)} duplicate records"
            )
        selected.append(min(candidates, key=lap_selection_key))
    return selected


def source_laps_are_ordered(records: list[JsonRecord]) -> bool:
    def numeric(value: object) -> int:
        return value if isinstance(value, int) and not isinstance(value, bool) else 1_000_000

    keys = [
        (
            numeric(record.get("driver_number")),
            numeric(record.get("lap_number")),
            str(record.get("date_start", "")),
        )
        for record in records
    ]
    return keys == sorted(keys)


def normalize_laps(
    records: list[JsonRecord],
    driver_ids: dict[int, str],
    session_start: datetime,
    session_end_ms: int,
    warnings: list[str],
) -> list[JsonRecord]:
    if not source_laps_are_ordered(records):
        warnings.append("Lap source rows were out of order and have been sorted")

    preliminary: list[tuple[JsonRecord, int, int, int]] = []
    for record in deduplicate_laps(records, warnings):
        driver_number = record.get("driver_number")
        lap_number = record.get("lap_number")
        if (
            not isinstance(driver_number, int)
            or isinstance(driver_number, bool)
            or driver_number not in driver_ids
        ):
            warnings.append(f"Excluded lap for unknown driver {driver_number}")
            continue
        if not isinstance(lap_number, int) or isinstance(lap_number, bool) or lap_number < 1:
            warnings.append(f"Driver {driver_number}: excluded invalid lap number {lap_number}")
            continue
        try:
            start_ms = relative_milliseconds(
                parse_timestamp(
                    record.get("date_start"),
                    f"driver {driver_number} lap {lap_number} date_start",
                ),
                session_start,
            )
        except ValueError:
            warnings.append(f"Driver {driver_number} lap {lap_number}: missing valid start time")
            continue
        if start_ms < 0 or start_ms >= session_end_ms:
            warnings.append(f"Driver {driver_number} lap {lap_number}: start is outside session")
            continue
        preliminary.append((record, driver_number, lap_number, start_ms))

    preliminary.sort(key=lambda item: (item[1], item[2], item[3], canonical_record(item[0])))
    laps: list[JsonRecord] = []
    for index, (record, driver_number, lap_number, start_ms) in enumerate(preliminary):
        duration_ms = seconds_to_milliseconds(record.get("lap_duration"))
        next_start_ms = next(
            (
                candidate[3]
                for candidate in preliminary[index + 1 :]
                if candidate[1] == driver_number and candidate[3] > start_ms
            ),
            None,
        )
        if duration_ms is not None and duration_ms > 0:
            end_ms = start_ms + duration_ms
        else:
            end_ms = next_start_ms or session_end_ms
            warnings.append(
                f"Driver {driver_number} lap {lap_number}: missing duration; interval bounded by source time"
            )
        if end_ms <= start_ms or end_ms > session_end_ms:
            warnings.append(f"Driver {driver_number} lap {lap_number}: invalid lap interval")
            continue

        sectors = []
        for sector in (1, 2, 3):
            sector_ms = seconds_to_milliseconds(
                record.get(f"duration_sector_{sector}")
            )
            sectors.append(sector_ms if sector_ms is not None and sector_ms >= 0 else None)
        if any(sector is None for sector in sectors):
            warnings.append(f"Driver {driver_number} lap {lap_number}: incomplete sector timing")
        is_pit_out = record.get("is_pit_out_lap") is True
        is_deleted = record.get("is_deleted") is True or record.get("deleted") is True
        is_valid = (
            duration_ms is not None
            and duration_ms > 0
            and not is_pit_out
            and not is_deleted
            and record.get("is_valid") is not False
        )
        laps.append(
            {
                "driverId": driver_ids[driver_number],
                "lapNumber": lap_number,
                "startMs": start_ms,
                "endMs": end_ms,
                "durationMs": duration_ms if duration_ms and duration_ms > 0 else None,
                "sectorsMs": sectors,
                "isPitOutLap": is_pit_out,
                "isValid": is_valid,
            }
        )
    return laps


def fastest_laps(
    laps: list[JsonRecord],
    drivers: list[JsonRecord],
) -> tuple[list[JsonRecord], JsonRecord | None]:
    driver_numbers = {driver["id"]: driver["driverNumber"] for driver in drivers}
    valid_laps = [
        lap
        for lap in laps
        if lap["isValid"] is True and isinstance(lap["durationMs"], int)
    ]
    best_by_driver: dict[str, JsonRecord] = {}
    for lap in valid_laps:
        driver_id = str(lap["driverId"])
        candidate = {
            "driverId": driver_id,
            "lapNumber": lap["lapNumber"],
            "durationMs": lap["durationMs"],
        }
        previous = best_by_driver.get(driver_id)
        if previous is None or (
            candidate["durationMs"], candidate["lapNumber"]
        ) < (previous["durationMs"], previous["lapNumber"]):
            best_by_driver[driver_id] = candidate

    per_driver = sorted(
        best_by_driver.values(),
        key=lambda lap: int(driver_numbers[str(lap["driverId"])]),
    )
    overall = min(
        per_driver,
        key=lambda lap: (
            int(lap["durationMs"]),
            int(driver_numbers[str(lap["driverId"])]),
            int(lap["lapNumber"]),
        ),
        default=None,
    )
    return per_driver, overall


def last_laps(
    laps: list[JsonRecord],
    drivers: list[JsonRecord],
) -> list[JsonRecord]:
    driver_numbers = {driver["id"]: driver["driverNumber"] for driver in drivers}
    latest: dict[str, JsonRecord] = {}
    for lap in laps:
        driver_id = str(lap["driverId"])
        previous = latest.get(driver_id)
        if previous is None or (lap["lapNumber"], lap["startMs"]) > (
            previous["lapNumber"],
            previous["startMs"],
        ):
            latest[driver_id] = lap
    return [
        {
            "driverId": driver_id,
            "lapNumber": lap["lapNumber"],
            "durationMs": lap["durationMs"],
        }
        for driver_id, lap in sorted(
            latest.items(),
            key=lambda item: int(driver_numbers[item[0]]),
        )
    ]


def effective_source_end_ms(
    datasets: dict[str, Any],
    session_start: datetime,
) -> int:
    candidates = [0]
    for dataset, field in (("locations", "date"), ("car_data", "date")):
        records = datasets.get(dataset, [])
        if not isinstance(records, list):
            continue
        for record in records:
            if not isinstance(record, dict):
                continue
            try:
                candidates.append(
                    relative_milliseconds(
                        parse_timestamp(record.get(field), f"{dataset} {field}"),
                        session_start,
                    )
                )
            except ValueError:
                continue
    lap_records = datasets.get("laps", [])
    if isinstance(lap_records, list):
        for record in lap_records:
            if not isinstance(record, dict):
                continue
            try:
                start_ms = relative_milliseconds(
                    parse_timestamp(record.get("date_start"), "lap date_start"),
                    session_start,
                )
            except ValueError:
                continue
            duration_ms = seconds_to_milliseconds(record.get("lap_duration")) or 0
            candidates.append(start_ms + max(0, duration_ms))
    return max(candidates)


def normalize_timing_snapshot(snapshot: object) -> JsonRecord:
    if not isinstance(snapshot, dict) or not isinstance(snapshot.get("datasets"), dict):
        raise ValueError("Provider snapshot must contain datasets")
    datasets: dict[str, Any] = snapshot["datasets"]
    sessions = datasets.get("sessions")
    if not isinstance(sessions, list) or len(sessions) != 1 or not isinstance(sessions[0], dict):
        raise ValueError("Timing normalization requires exactly one session")
    session = sessions[0]
    session_start = parse_timestamp(session.get("date_start"), "session date_start")
    session_end = parse_timestamp(session.get("date_end"), "session date_end")
    official_end_ms = relative_milliseconds(session_end, session_start)
    session_end_ms = max(
        official_end_ms,
        effective_source_end_ms(datasets, session_start),
    )
    if session_end_ms <= 0:
        raise ValueError("Session end must be after session start")

    warnings: list[str] = []
    if session_end_ms > official_end_ms:
        warnings.append(
            "Session end expanded beyond scheduled date_end to include late source data"
        )
    driver_records = datasets.get("drivers", [])
    lap_records = datasets.get("laps", [])
    if not isinstance(driver_records, list) or not isinstance(lap_records, list):
        raise ValueError("Driver and lap datasets must be arrays")
    drivers, driver_ids = normalize_drivers(driver_records, warnings)
    if not drivers:
        raise ValueError("Timing normalization requires at least one valid driver")
    laps = normalize_laps(
        lap_records,
        driver_ids,
        session_start,
        session_end_ms,
        warnings,
    )
    per_driver, overall = fastest_laps(laps, drivers)
    return {
        "normalizationVersion": 1,
        "sessionStartUtc": session_start.isoformat().replace("+00:00", "Z"),
        "sessionEndMs": session_end_ms,
        "drivers": drivers,
        "laps": laps,
        "lastLapsByDriver": last_laps(laps, drivers),
        "fastestLapsByDriver": per_driver,
        "overallFastestLap": overall,
        "warnings": sorted(set(warnings)),
    }
