import bisect
import json
import math
from collections import defaultdict
from dataclasses import dataclass

from ..normalize.timing import parse_timestamp, relative_milliseconds
from ..provider import JsonRecord


@dataclass(frozen=True)
class TelemetryConfig:
    max_gap_ms: int = 1500
    max_speed_kph: float = 450.0
    max_abs_g: float = 8.0
    gravity_mps2: float = 9.80665
    smoothing_radius: int = 1


@dataclass(frozen=True)
class SourceTelemetry:
    driver_id: str
    driver_number: int
    time_ms: int
    speed_kph: float | None
    throttle_percent: float | None
    brake_applied: bool | None
    rpm: int | None
    gear: int | None
    drs: int | None


def finite_number(
    value: object,
    minimum: float,
    maximum: float | None = None,
) -> float | None:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return None
    result = float(value)
    if not math.isfinite(result) or result < minimum:
        return None
    if maximum is not None and result > maximum:
        return None
    return result


def bounded_integer(value: object, minimum: int, maximum: int | None = None) -> int | None:
    if not isinstance(value, int) or isinstance(value, bool) or value < minimum:
        return None
    if maximum is not None and value > maximum:
        return None
    return value


def normalized_brake(value: object) -> bool | None:
    if value == 0 and not isinstance(value, bool):
        return False
    if value == 100 and not isinstance(value, bool):
        return True
    return None


def normalize_source_samples(
    records: list[JsonRecord],
    driver_ids: dict[int, str],
    session_start: object,
    session_end_ms: int,
    config: TelemetryConfig,
    warnings: list[str],
) -> tuple[dict[str, list[SourceTelemetry]], int]:
    start = parse_timestamp(session_start, "session date_start")
    candidates: dict[tuple[int, int], list[tuple[SourceTelemetry, str]]] = defaultdict(list)
    excluded = 0
    for record in records:
        driver_number = record.get("driver_number")
        if (
            not isinstance(driver_number, int)
            or isinstance(driver_number, bool)
            or driver_number not in driver_ids
        ):
            excluded += 1
            continue
        try:
            time_ms = relative_milliseconds(
                parse_timestamp(record.get("date"), "car_data date"),
                start,
            )
        except ValueError:
            excluded += 1
            continue
        if not 0 <= time_ms <= session_end_ms:
            excluded += 1
            continue
        speed = finite_number(record.get("speed"), 0, config.max_speed_kph)
        if record.get("speed") is not None and speed is None:
            warnings.append(
                f"Driver {driver_number}: invalid speed at {time_ms} ms preserved as unavailable"
            )
        sample = SourceTelemetry(
            driver_id=driver_ids[driver_number],
            driver_number=driver_number,
            time_ms=time_ms,
            speed_kph=speed,
            throttle_percent=finite_number(record.get("throttle"), 0, 100),
            brake_applied=normalized_brake(record.get("brake")),
            rpm=bounded_integer(record.get("rpm"), 0),
            gear=bounded_integer(record.get("n_gear"), 0, 8),
            drs=bounded_integer(record.get("drs"), 0),
        )
        candidates[(driver_number, time_ms)].append(
            (sample, json.dumps(record, sort_keys=True, separators=(",", ":")))
        )

    by_driver: dict[str, list[SourceTelemetry]] = defaultdict(list)
    for (driver_number, time_ms), duplicates in sorted(candidates.items()):
        if len(duplicates) > 1:
            excluded += len(duplicates) - 1
            warnings.append(
                f"Driver {driver_number}: collapsed {len(duplicates)} telemetry records at {time_ms} ms"
            )
        selected = min(
            duplicates,
            key=lambda item: (
                -sum(
                    value is not None
                    for value in (
                        item[0].speed_kph,
                        item[0].throttle_percent,
                        item[0].brake_applied,
                        item[0].rpm,
                        item[0].gear,
                        item[0].drs,
                    )
                ),
                item[1],
            ),
        )[0]
        by_driver[selected.driver_id].append(selected)
    return dict(sorted(by_driver.items())), excluded


def smooth_speeds(
    samples: list[SourceTelemetry],
    config: TelemetryConfig,
) -> list[float | None]:
    smoothed: list[float | None] = []
    for index, sample in enumerate(samples):
        start = max(0, index - config.smoothing_radius)
        end = min(len(samples), index + config.smoothing_radius + 1)
        window = samples[start:end]
        speeds = [item.speed_kph for item in window]
        gaps = [
            following.time_ms - previous.time_ms
            for previous, following in zip(window, window[1:])
        ]
        if (
            sample.speed_kph is None
            or any(speed is None for speed in speeds)
            or any(gap > config.max_gap_ms for gap in gaps)
        ):
            smoothed.append(None)
        else:
            smoothed.append(sum(float(speed) for speed in speeds) / len(speeds))
    return smoothed


def longitudinal_g(
    index: int,
    samples: list[SourceTelemetry],
    smoothed_speeds: list[float | None],
    config: TelemetryConfig,
) -> tuple[float | None, bool, int | None]:
    if len(samples) < 2:
        return None, False, None
    if 0 < index < len(samples) - 1:
        before, after = index - 1, index + 1
        high_quality = True
    elif index == 0:
        before, after = 0, 1
        high_quality = False
    else:
        before, after = len(samples) - 2, len(samples) - 1
        high_quality = False
    gaps = [
        samples[position + 1].time_ms - samples[position].time_ms
        for position in range(before, after)
    ]
    if (
        smoothed_speeds[before] is None
        or smoothed_speeds[after] is None
        or any(gap > config.max_gap_ms for gap in gaps)
    ):
        return None, False, None
    elapsed_seconds = (samples[after].time_ms - samples[before].time_ms) / 1000
    velocity_change = (
        float(smoothed_speeds[after]) - float(smoothed_speeds[before])
    ) / 3.6
    return (
        velocity_change / elapsed_seconds / config.gravity_mps2,
        high_quality,
        max(gaps),
    )


def wrapped_angle(value: float) -> float:
    return (value + math.pi) % (2 * math.pi) - math.pi


def lateral_g(
    sample: SourceTelemetry,
    positions: list[JsonRecord],
    position_times: list[int],
    config: TelemetryConfig,
) -> tuple[float | None, bool, int | None]:
    if sample.speed_kph is None or len(positions) < 3:
        return None, False, None
    insertion = bisect.bisect_left(position_times, sample.time_ms)
    nearest = min(
        {
            max(0, insertion - 1),
            min(len(position_times) - 1, insertion),
        },
        key=lambda index: (abs(position_times[index] - sample.time_ms), index),
    )
    if nearest == 0 or nearest == len(positions) - 1:
        return None, False, None
    previous, current, following = (
        positions[nearest - 1],
        positions[nearest],
        positions[nearest + 1],
    )
    gaps = [
        int(current["timeMs"]) - int(previous["timeMs"]),
        int(following["timeMs"]) - int(current["timeMs"]),
        abs(int(current["timeMs"]) - sample.time_ms),
    ]
    if any(gap > config.max_gap_ms for gap in gaps):
        return None, False, None
    incoming = math.atan2(
        float(current["y"]) - float(previous["y"]),
        float(current["x"]) - float(previous["x"]),
    )
    outgoing = math.atan2(
        float(following["y"]) - float(current["y"]),
        float(following["x"]) - float(current["x"]),
    )
    midpoint_seconds = (
        int(following["timeMs"]) - int(previous["timeMs"])
    ) / 2000
    if midpoint_seconds <= 0:
        return None, False, None
    yaw_rate = wrapped_angle(outgoing - incoming) / midpoint_seconds
    result = sample.speed_kph / 3.6 * yaw_rate / config.gravity_mps2
    return result, True, max(gaps)


def clipped_g(
    value: float | None,
    config: TelemetryConfig,
) -> tuple[float | None, bool]:
    if value is None:
        return None, False
    if abs(value) <= config.max_abs_g:
        return value, False
    return math.copysign(config.max_abs_g, value), True


def derive_driver_samples(
    samples: list[SourceTelemetry],
    positions: list[JsonRecord],
    config: TelemetryConfig,
    warnings: list[str],
) -> list[JsonRecord]:
    smoothed = smooth_speeds(samples, config)
    position_times = [int(position["timeMs"]) for position in positions]
    derived: list[JsonRecord] = []
    clipped_count = 0
    for index, sample in enumerate(samples):
        longitudinal, longitudinal_high, longitudinal_gap = longitudinal_g(
            index,
            samples,
            smoothed,
            config,
        )
        lateral, lateral_high, lateral_gap = lateral_g(
            sample,
            positions,
            position_times,
            config,
        )
        longitudinal, clipped_longitudinal = clipped_g(longitudinal, config)
        lateral, clipped_lateral = clipped_g(lateral, config)
        if clipped_longitudinal or clipped_lateral:
            clipped_count += 1
        gaps = [gap for gap in (longitudinal_gap, lateral_gap) if gap is not None]
        available_count = sum(value is not None for value in (longitudinal, lateral))
        if available_count == 0:
            quality = "unavailable"
        elif (
            available_count == 2
            and longitudinal_high
            and lateral_high
            and not clipped_longitudinal
            and not clipped_lateral
        ):
            quality = "estimated"
        else:
            quality = "low"
        derived.append(
            {
                "timeMs": sample.time_ms,
                "speedKph": sample.speed_kph,
                "throttlePercent": sample.throttle_percent,
                "brakeApplied": sample.brake_applied,
                "rpm": sample.rpm,
                "gear": sample.gear,
                "drs": sample.drs,
                "longitudinalG": round(longitudinal, 4)
                if longitudinal is not None
                else None,
                "lateralG": round(lateral, 4) if lateral is not None else None,
                "gForceQuality": quality,
                "sourceGapMs": max(gaps) if gaps else None,
            }
        )
    if clipped_count:
        warnings.append(
            f"{samples[0].driver_id}: clipped {clipped_count} derived g-force samples"
        )
    return derived


def normalize_telemetry_snapshot(
    snapshot: object,
    timing_report: object,
    geometry_report: object,
    config: TelemetryConfig = TelemetryConfig(),
) -> JsonRecord:
    if not isinstance(snapshot, dict) or not isinstance(snapshot.get("datasets"), dict):
        raise ValueError("Provider snapshot must contain datasets")
    if not isinstance(timing_report, dict) or not isinstance(geometry_report, dict):
        raise ValueError("Telemetry normalization requires timing and geometry reports")
    datasets = snapshot["datasets"]
    sessions = datasets.get("sessions")
    car_data = datasets.get("car_data")
    drivers = timing_report.get("drivers")
    positions = geometry_report.get("locationsByDriver")
    if (
        not isinstance(sessions, list)
        or len(sessions) != 1
        or not isinstance(car_data, list)
        or not isinstance(drivers, list)
        or not isinstance(positions, dict)
    ):
        raise ValueError("Telemetry normalization inputs are incomplete")
    driver_ids = {
        int(driver["driverNumber"]): str(driver["id"])
        for driver in drivers
        if isinstance(driver, dict)
    }
    warnings: list[str] = []
    source_by_driver, excluded = normalize_source_samples(
        car_data,
        driver_ids,
        sessions[0].get("date_start"),
        int(timing_report["sessionEndMs"]),
        config,
        warnings,
    )
    telemetry_by_driver = {
        driver_id: derive_driver_samples(
            samples,
            positions.get(driver_id, []),
            config,
            warnings,
        )
        for driver_id, samples in source_by_driver.items()
    }
    all_samples = [
        sample for samples in telemetry_by_driver.values() for sample in samples
    ]
    source_count = len(car_data)
    quality_counts = {
        quality: sum(sample["gForceQuality"] == quality for sample in all_samples)
        for quality in ("estimated", "low", "unavailable")
    }
    return {
        "normalizationVersion": 1,
        "telemetryByDriver": telemetry_by_driver,
        "diagnostics": {
            "sourceSampleCount": source_count,
            "acceptedSampleCount": len(all_samples),
            "excludedSamplePercentage": round(
                excluded / source_count * 100 if source_count else 0,
                3,
            ),
            "qualityCounts": quality_counts,
            "config": {
                "maxGapMs": config.max_gap_ms,
                "maxSpeedKph": config.max_speed_kph,
                "maxAbsG": config.max_abs_g,
                "gravityMps2": config.gravity_mps2,
                "speedSmoothingWindow": config.smoothing_radius * 2 + 1,
            },
        },
        "warnings": sorted(set(warnings)),
    }
