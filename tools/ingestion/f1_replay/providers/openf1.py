from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Mapping
from urllib.parse import urlencode

from ..cache import HttpRawCache
from ..http import JsonHttpClient
from ..provider import JsonRecord


DEFAULT_BASE_URL = "https://api.openf1.org/v1"
REQUIRED_FIELDS = {
    "meetings": {"meeting_key", "meeting_name", "year"},
    "sessions": {"meeting_key", "session_key", "session_name", "session_type"},
    "drivers": {"driver_number", "session_key"},
    "laps": {"driver_number", "lap_number", "session_key"},
    "location": {"date", "driver_number", "session_key", "x", "y", "z"},
    "car_data": {"date", "driver_number", "session_key", "speed"},
}


class OpenF1DataError(ValueError):
    """Raised when discovery is ambiguous or the provider shape has drifted."""


class OpenF1Api:
    def __init__(
        self,
        cache_directory: Path,
        *,
        base_url: str = DEFAULT_BASE_URL,
        client: JsonHttpClient | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.cache = HttpRawCache(cache_directory)
        self.client = client or JsonHttpClient()
        self.cache_status: dict[str, str] = {}
        self.provenance: dict[str, dict[str, object]] = {}

    def query(
        self,
        endpoint: str,
        parameters: Mapping[str, str | int],
    ) -> list[JsonRecord]:
        query = urlencode(sorted(parameters.items()))
        url = f"{self.base_url}/{endpoint}?{query}"
        result = self.cache.get_or_download(
            url,
            lambda: self.client.download(url),
        )
        self.cache_status[endpoint] = "hit" if result.was_hit else "miss"
        self.provenance[url] = result.metadata
        validate_records(endpoint, result.records)
        return result.records


def validate_records(endpoint: str, records: list[JsonRecord]) -> None:
    required = REQUIRED_FIELDS[endpoint]
    for index, record in enumerate(records):
        missing = required - record.keys()
        if missing:
            fields = ", ".join(sorted(missing))
            raise OpenF1DataError(
                f"OpenF1 {endpoint} record {index} is missing: {fields}"
            )


def normalized(value: object) -> str:
    return " ".join(str(value).casefold().split())


def select_human_match(
    records: Iterable[JsonRecord],
    query: str,
    fields: tuple[str, ...],
    label: str,
) -> JsonRecord:
    records = list(records)
    target = normalized(query)
    exact = [
        record
        for record in records
        if any(normalized(record.get(field, "")) == target for field in fields)
    ]
    candidates = exact or [
        record
        for record in records
        if any(target in normalized(record.get(field, "")) for field in fields)
    ]
    if not candidates:
        raise OpenF1DataError(f"No {label} matches {query!r}")
    if len(candidates) > 1:
        raise OpenF1DataError(f"Multiple {label} records match {query!r}")
    return candidates[0]


@dataclass
class OpenF1Provider:
    api: OpenF1Api
    meeting: JsonRecord
    session: JsonRecord
    _drivers: list[JsonRecord] | None = field(default=None, init=False, repr=False)

    @classmethod
    def discover(
        cls,
        api: OpenF1Api,
        *,
        year: int,
        meeting: str,
        session_type: str,
    ) -> "OpenF1Provider":
        meetings = api.query("meetings", {"year": year})
        selected_meeting = select_human_match(
            meetings,
            meeting,
            ("meeting_name", "country_name", "location", "circuit_short_name"),
            "meeting",
        )
        sessions = api.query(
            "sessions",
            {"meeting_key": int(selected_meeting["meeting_key"])},
        )
        selected_session = select_human_match(
            sessions,
            session_type,
            ("session_name", "session_type"),
            "session",
        )
        return cls(api, selected_meeting, selected_session)

    @property
    def session_key(self) -> int:
        return int(self.session["session_key"])

    def meetings(self) -> list[JsonRecord]:
        return [self.meeting]

    def sessions(self) -> list[JsonRecord]:
        return [self.session]

    def drivers(self) -> list[JsonRecord]:
        if self._drivers is None:
            self._drivers = self.api.query("drivers", {"session_key": self.session_key})
        return self._drivers

    def laps(self) -> list[JsonRecord]:
        return self.api.query("laps", {"session_key": self.session_key})

    def locations(self) -> list[JsonRecord]:
        return self._high_frequency_records("location")

    def car_data(self) -> list[JsonRecord]:
        return self._high_frequency_records("car_data")

    def _high_frequency_records(self, endpoint: str) -> list[JsonRecord]:
        driver_numbers = sorted(
            {
                int(driver["driver_number"])
                for driver in self.drivers()
                if isinstance(driver.get("driver_number"), int)
            }
        )
        records = []
        for driver_number in driver_numbers:
            records.extend(
                self.api.query(
                    endpoint,
                    {
                        "driver_number": driver_number,
                        "session_key": self.session_key,
                    },
                )
            )
        return records
