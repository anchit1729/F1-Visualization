import json
import math
from collections import defaultdict
from dataclasses import dataclass
from statistics import median
from typing import Iterable

from ..normalize.timing import parse_timestamp, relative_milliseconds
from ..provider import JsonRecord


Point = tuple[float, float]
VIEW_SIZE = 1000.0
VIEW_PADDING = 60.0
SIMPLIFICATION_TOLERANCE = 2.0
THUMBNAIL_TOLERANCE = 8.0
OVERLAY_TOLERANCE = 60.0


@dataclass(frozen=True)
class LocationSample:
    driver_id: str
    driver_number: int
    time_ms: int
    x: float
    y: float


@dataclass(frozen=True)
class CoordinateTransform:
    scale: float
    translate_x: float
    translate_y: float
    view_width: float = VIEW_SIZE
    view_height: float = VIEW_SIZE

    def forward(self, point: Point) -> Point:
        return (
            point[0] * self.scale + self.translate_x,
            point[1] * -self.scale + self.translate_y,
        )

    def inverse(self, point: Point) -> Point:
        return (
            (point[0] - self.translate_x) / self.scale,
            (point[1] - self.translate_y) / -self.scale,
        )

    def as_dict(self) -> JsonRecord:
        return {
            "scaleX": rounded(self.scale),
            "scaleY": rounded(-self.scale),
            "translateX": rounded(self.translate_x),
            "translateY": rounded(self.translate_y),
        }


def rounded(value: float) -> float:
    return round(value, 3)


def point_dict(point: Point) -> JsonRecord:
    return {"x": rounded(point[0]), "y": rounded(point[1])}


def distance(first: Point, second: Point) -> float:
    return math.hypot(second[0] - first[0], second[1] - first[1])


def valid_coordinate(value: object) -> float | None:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return None
    coordinate = float(value)
    return coordinate if math.isfinite(coordinate) else None


def make_transform(points: Iterable[Point]) -> tuple[CoordinateTransform, JsonRecord]:
    points = list(points)
    if not points:
        raise ValueError("Track geometry requires location points")
    minimum_x = min(point[0] for point in points)
    maximum_x = max(point[0] for point in points)
    minimum_y = min(point[1] for point in points)
    maximum_y = max(point[1] for point in points)
    width = maximum_x - minimum_x
    height = maximum_y - minimum_y
    if width <= 0 or height <= 0:
        raise ValueError("Track geometry bounds are degenerate")

    available = VIEW_SIZE - VIEW_PADDING * 2
    scale = min(available / width, available / height)
    rendered_width = width * scale
    rendered_height = height * scale
    offset_x = (VIEW_SIZE - rendered_width) / 2
    offset_y = (VIEW_SIZE - rendered_height) / 2
    transform = CoordinateTransform(
        scale=scale,
        translate_x=offset_x - minimum_x * scale,
        translate_y=VIEW_SIZE - offset_y + minimum_y * scale,
    )
    bounds = {
        "minX": rounded(minimum_x),
        "minY": rounded(minimum_y),
        "maxX": rounded(maximum_x),
        "maxY": rounded(maximum_y),
    }
    return transform, bounds


def clean_locations(
    records: list[JsonRecord],
    driver_ids: dict[int, str],
    session_start: object,
    session_end_ms: int,
    warnings: list[str],
) -> tuple[list[LocationSample], int]:
    start = parse_timestamp(session_start, "session date_start")
    grouped: dict[int, list[tuple[LocationSample, str]]] = defaultdict(list)
    excluded = 0
    for record in records:
        driver_number = record.get("driver_number")
        x = valid_coordinate(record.get("x"))
        y = valid_coordinate(record.get("y"))
        if (
            not isinstance(driver_number, int)
            or isinstance(driver_number, bool)
            or driver_number not in driver_ids
            or x is None
            or y is None
        ):
            excluded += 1
            continue
        try:
            time_ms = relative_milliseconds(
                parse_timestamp(record.get("date"), "location date"),
                start,
            )
        except ValueError:
            excluded += 1
            continue
        if not 0 <= time_ms <= session_end_ms:
            excluded += 1
            continue
        grouped[driver_number].append(
            (
                LocationSample(driver_ids[driver_number], driver_number, time_ms, x, y),
                json.dumps(record, sort_keys=True, separators=(",", ":")),
            )
        )

    accepted: list[LocationSample] = []
    for driver_number, candidates in sorted(grouped.items()):
        candidates.sort(key=lambda item: (item[0].time_ms, item[1]))
        deduplicated: list[LocationSample] = []
        seen_times: set[int] = set()
        for sample, _ in candidates:
            if sample.time_ms in seen_times:
                excluded += 1
                continue
            seen_times.add(sample.time_ms)
            deduplicated.append(sample)

        steps = [
            distance((first.x, first.y), (second.x, second.y))
            for first, second in zip(deduplicated, deduplicated[1:])
        ]
        positive_steps = [step for step in steps if step > 0]
        step_rates = [
            step / (following.time_ms - previous.time_ms)
            for step, previous, following in zip(
                steps,
                deduplicated,
                deduplicated[1:],
            )
            if step > 0 and following.time_ms > previous.time_ms
        ]
        typical_step = median(positive_steps) if positive_steps else math.inf
        typical_rate = median(step_rates) if step_rates else math.inf
        driver_samples: list[LocationSample] = []
        jump_count = 0
        for sample in deduplicated:
            if driver_samples:
                elapsed_ms = sample.time_ms - driver_samples[-1].time_ms
                jump_limit = max(
                    typical_step * 8,
                    typical_rate * elapsed_ms * 8,
                )
                if distance(
                    (driver_samples[-1].x, driver_samples[-1].y),
                    (sample.x, sample.y),
                ) > jump_limit:
                    excluded += 1
                    jump_count += 1
                    continue
            driver_samples.append(sample)
        if jump_count:
            warnings.append(
                f"Driver {driver_number}: excluded {jump_count} large location jumps"
            )
        accepted.extend(driver_samples)

    accepted.sort(key=lambda sample: (sample.driver_number, sample.time_ms, sample.x, sample.y))
    return accepted, excluded


def is_closed(points: list[Point]) -> bool:
    if len(points) < 4:
        return False
    steps = [distance(first, second) for first, second in zip(points, points[1:])]
    typical_step = median([step for step in steps if step > 0]) if any(steps) else 0
    return distance(points[0], points[-1]) <= max(typical_step * 1.5, 1.0)


def smooth_path(points: list[Point]) -> list[Point]:
    closed = is_closed(points)
    working = points[:-1] if closed and points[0] == points[-1] else list(points)
    if len(working) < 3:
        return list(points)
    smoothed: list[Point] = []
    for index, current in enumerate(working):
        if not closed and index in {0, len(working) - 1}:
            smoothed.append(current)
            continue
        previous = working[(index - 1) % len(working)]
        following = working[(index + 1) % len(working)]
        smoothed.append(
            (
                previous[0] * 0.1 + current[0] * 0.8 + following[0] * 0.1,
                previous[1] * 0.1 + current[1] * 0.8 + following[1] * 0.1,
            )
        )
    if closed:
        smoothed.append(smoothed[0])
    return smoothed


def point_segment_distance(point: Point, start: Point, end: Point) -> float:
    delta_x = end[0] - start[0]
    delta_y = end[1] - start[1]
    length_squared = delta_x * delta_x + delta_y * delta_y
    if length_squared == 0:
        return distance(point, start)
    ratio = max(
        0.0,
        min(
            1.0,
            ((point[0] - start[0]) * delta_x + (point[1] - start[1]) * delta_y)
            / length_squared,
        ),
    )
    projection = (start[0] + ratio * delta_x, start[1] + ratio * delta_y)
    return distance(point, projection)


def simplify_open(points: list[Point], tolerance: float) -> list[Point]:
    if len(points) <= 2:
        return list(points)
    start, end = points[0], points[-1]
    distances = [point_segment_distance(point, start, end) for point in points[1:-1]]
    maximum = max(distances, default=0.0)
    if maximum <= tolerance:
        return [start, end]
    split = distances.index(maximum) + 1
    return simplify_open(points[: split + 1], tolerance)[:-1] + simplify_open(
        points[split:], tolerance
    )


def simplify_path(points: list[Point], tolerance: float) -> list[Point]:
    if not is_closed(points):
        return simplify_open(points, tolerance)
    ring = points[:-1] if points[0] == points[-1] else list(points)
    anchor_index = min(range(len(ring)), key=lambda index: ring[index])
    rotated = ring[anchor_index:] + ring[:anchor_index]
    split = max(range(1, len(rotated)), key=lambda index: distance(rotated[0], rotated[index]))
    first_half = simplify_open(rotated[: split + 1], tolerance)
    second_half = simplify_open(rotated[split:] + [rotated[0]], tolerance)
    return first_half[:-1] + second_half


def polyline_distance(point: Point, path: list[Point]) -> float:
    return min(
        point_segment_distance(point, first, second)
        for first, second in zip(path, path[1:])
    )


def nearest_path_point(point: Point, path: list[Point]) -> Point:
    best_point = path[0]
    best_distance = math.inf
    for start, end in zip(path, path[1:]):
        delta_x = end[0] - start[0]
        delta_y = end[1] - start[1]
        length_squared = delta_x * delta_x + delta_y * delta_y
        ratio = 0.0 if length_squared == 0 else max(
            0.0,
            min(
                1.0,
                ((point[0] - start[0]) * delta_x + (point[1] - start[1]) * delta_y)
                / length_squared,
            ),
        )
        candidate = (start[0] + ratio * delta_x, start[1] + ratio * delta_y)
        candidate_distance = distance(point, candidate)
        if candidate_distance < best_distance:
            best_distance = candidate_distance
            best_point = candidate
    return best_point


def select_representative_samples(
    samples: list[LocationSample],
    timing_report: JsonRecord,
) -> list[LocationSample]:
    overall = timing_report.get("overallFastestLap")
    laps = timing_report.get("laps", [])
    if isinstance(overall, dict) and isinstance(laps, list):
        matching_lap = next(
            (
                lap
                for lap in laps
                if isinstance(lap, dict)
                and lap.get("driverId") == overall.get("driverId")
                and lap.get("lapNumber") == overall.get("lapNumber")
            ),
            None,
        )
        if matching_lap:
            selected = [
                sample
                for sample in samples
                if sample.driver_id == matching_lap["driverId"]
                and int(matching_lap["startMs"]) <= sample.time_ms <= int(matching_lap["endMs"])
            ]
            if len(selected) >= 4:
                return selected

    grouped: dict[str, list[LocationSample]] = defaultdict(list)
    for sample in samples:
        grouped[sample.driver_id].append(sample)
    if not grouped:
        raise ValueError("Track geometry has no usable driver trajectory")
    return min(
        grouped.values(),
        key=lambda group: (-len(group), group[0].driver_number),
    )


def sector_boundaries(
    timing_report: JsonRecord,
    representative: list[LocationSample],
    transform: CoordinateTransform,
    centerline: list[Point],
) -> list[JsonRecord]:
    overall = timing_report.get("overallFastestLap")
    laps = timing_report.get("laps", [])
    if not isinstance(overall, dict) or not isinstance(laps, list):
        return []
    lap = next(
        (
            item
            for item in laps
            if isinstance(item, dict)
            and item.get("driverId") == overall.get("driverId")
            and item.get("lapNumber") == overall.get("lapNumber")
        ),
        None,
    )
    if not lap or not isinstance(lap.get("sectorsMs"), list):
        return []
    first, second, _ = lap["sectorsMs"]
    if not isinstance(first, int) or not isinstance(second, int):
        return []
    boundaries = []
    for offset in (first, first + second):
        target_time = int(lap["startMs"]) + offset
        sample = min(representative, key=lambda item: abs(item.time_ms - target_time))
        transformed = transform.forward((sample.x, sample.y))
        boundaries.append(point_dict(nearest_path_point(transformed, centerline)))
    return boundaries


def normalize_geometry_snapshot(
    snapshot: object,
    timing_report: object,
) -> JsonRecord:
    if not isinstance(snapshot, dict) or not isinstance(snapshot.get("datasets"), dict):
        raise ValueError("Provider snapshot must contain datasets")
    if not isinstance(timing_report, dict):
        raise ValueError("Geometry normalization requires a timing report")
    datasets = snapshot["datasets"]
    locations = datasets.get("locations")
    sessions = datasets.get("sessions")
    drivers = timing_report.get("drivers")
    if not isinstance(locations, list) or not isinstance(sessions, list) or len(sessions) != 1:
        raise ValueError("Geometry normalization requires locations and one session")
    if not isinstance(drivers, list):
        raise ValueError("Geometry normalization requires normalized drivers")
    driver_ids = {
        int(driver["driverNumber"]): str(driver["id"])
        for driver in drivers
        if isinstance(driver, dict)
    }
    warnings: list[str] = []
    samples, excluded = clean_locations(
        locations,
        driver_ids,
        sessions[0].get("date_start"),
        int(timing_report["sessionEndMs"]),
        warnings,
    )
    representative = select_representative_samples(samples, timing_report)
    representative_points = [(sample.x, sample.y) for sample in representative]
    if len(representative_points) < 4:
        raise ValueError("Track geometry requires at least four representative points")

    transform, bounds = make_transform((sample.x, sample.y) for sample in samples)
    smoothed = smooth_path(representative_points)
    transformed_smoothed = [transform.forward(point) for point in smoothed]
    centerline = simplify_path(transformed_smoothed, SIMPLIFICATION_TOLERANCE)
    thumbnail_centerline = simplify_path(centerline, THUMBNAIL_TOLERANCE)
    if len(centerline) < 3:
        raise ValueError("Track geometry centerline is degenerate")

    transformed_representative = [transform.forward(point) for point in representative_points]
    overlay_error = max(
        polyline_distance(point, centerline) for point in transformed_representative
    )
    simplification_error = max(
        polyline_distance(point, centerline) for point in transformed_smoothed
    )
    boundaries = sector_boundaries(
        timing_report,
        representative,
        transform,
        centerline,
    )
    start_finish = nearest_path_point(
        transform.forward(representative_points[0]),
        centerline,
    )
    track = {
        "viewBox": [0, 0, int(VIEW_SIZE), int(VIEW_SIZE)],
        "centerline": [point_dict(point) for point in centerline],
        "startFinish": point_dict(start_finish),
        "sectorBoundaries": boundaries,
    }
    thumbnail = {
        **track,
        "centerline": [point_dict(point) for point in thumbnail_centerline],
    }
    samples_by_driver: dict[str, list[JsonRecord]] = defaultdict(list)
    for sample in samples:
        x, y = transform.forward((sample.x, sample.y))
        samples_by_driver[sample.driver_id].append(
            {
                "timeMs": sample.time_ms,
                "x": rounded(x),
                "y": rounded(y),
                "quality": "source",
            }
        )

    source_count = len(locations)
    return {
        "normalizationVersion": 1,
        "track": track,
        "thumbnail": thumbnail,
        "locationsByDriver": dict(sorted(samples_by_driver.items())),
        "diagnostics": {
            "sourcePointCount": source_count,
            "acceptedPointCount": len(samples),
            "representativePointCount": len(representative),
            "centerlinePointCount": len(centerline),
            "thumbnailPointCount": len(thumbnail_centerline),
            "excludedSamplePercentage": rounded(
                excluded / source_count * 100 if source_count else 0
            ),
            "sourceBounds": bounds,
            "simplificationMaxError": rounded(simplification_error),
            "representativeOverlayMaxError": rounded(overlay_error),
            "overlayTolerance": OVERLAY_TOLERANCE,
            "transform": transform.as_dict(),
        },
        "warnings": sorted(set(warnings)),
    }


def render_geometry_svg(report: JsonRecord) -> str:
    track = report["track"]
    centerline = track["centerline"]
    path = " ".join(
        f"{'M' if index == 0 else 'L'} {point['x']} {point['y']}"
        for index, point in enumerate(centerline)
    )
    circles = []
    for driver_id, samples in report["locationsByDriver"].items():
        color = "#d3130b" if not circles else "#1464f4"
        for sample in samples:
            circles.append(
                f'<circle cx="{sample["x"]}" cy="{sample["y"]}" r="3" fill="{color}"><title>{driver_id} @ {sample["timeMs"]} ms</title></circle>'
            )
    circle_markup = "\n  ".join(circles)
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">\n'
        '  <rect width="1000" height="1000" fill="#f2f3f6"/>\n'
        f'  <path d="{path}" fill="none" stroke="#15161a" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>\n'
        f"  {circle_markup}\n"
        "</svg>\n"
    )
