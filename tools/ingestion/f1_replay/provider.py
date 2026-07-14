import json
from pathlib import Path
from typing import Any, Callable, Protocol


JsonRecord = dict[str, Any]
DATASETS = (
    "meetings",
    "sessions",
    "drivers",
    "laps",
    "locations",
    "car_data",
)


class Provider(Protocol):
    def meetings(self) -> list[JsonRecord]: ...

    def sessions(self) -> list[JsonRecord]: ...

    def drivers(self) -> list[JsonRecord]: ...

    def laps(self) -> list[JsonRecord]: ...

    def locations(self) -> list[JsonRecord]: ...

    def car_data(self) -> list[JsonRecord]: ...


class FilesystemProvider:
    def __init__(self, directory: Path) -> None:
        self.directory = directory

    def _read(self, dataset: str) -> list[JsonRecord]:
        path = self.directory / f"{dataset}.json"
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            raise ValueError(f"Malformed JSON in {path}") from error

        if not isinstance(value, list) or any(
            not isinstance(record, dict) for record in value
        ):
            raise ValueError(f"{path} must contain a JSON array of objects")

        return value

    def meetings(self) -> list[JsonRecord]:
        return self._read("meetings")

    def sessions(self) -> list[JsonRecord]:
        return self._read("sessions")

    def drivers(self) -> list[JsonRecord]:
        return self._read("drivers")

    def laps(self) -> list[JsonRecord]:
        return self._read("laps")

    def locations(self) -> list[JsonRecord]:
        return self._read("locations")

    def car_data(self) -> list[JsonRecord]:
        return self._read("car_data")


def provider_readers(provider: Provider) -> dict[str, Callable[[], list[JsonRecord]]]:
    return {dataset: getattr(provider, dataset) for dataset in DATASETS}

