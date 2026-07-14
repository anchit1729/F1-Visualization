import json
import os
from pathlib import Path
from urllib.parse import urlsplit

import pytest

from tools.ingestion.f1_replay.http import HttpResponse, JsonHttpClient
from tools.ingestion.f1_replay.provider import provider_readers
from tools.ingestion.f1_replay.providers.openf1 import (
    OpenF1Api,
    OpenF1DataError,
    OpenF1Provider,
)


ROOT = Path(__file__).parents[3]
RECORDED_PATH = (
    ROOT / "tools" / "ingestion" / "fixtures" / "http" / "openf1" / "responses.json"
)


class RecordedTransport:
    def __init__(self, responses: dict[str, object]) -> None:
        self.responses = responses
        self.calls: list[str] = []

    def get(self, url: str, timeout_seconds: float) -> HttpResponse:
        del timeout_seconds
        key = urlsplit(url).path.rsplit("/", 1)[-1]
        if urlsplit(url).query:
            key = f"{key}?{urlsplit(url).query}"
        self.calls.append(key)
        item = self.responses[key]
        assert isinstance(item, dict)
        return HttpResponse(
            status_code=int(item["status"]),
            headers=item["headers"],
            body=json.dumps(item["body"]).encode("utf-8"),
        )


def recorded_responses() -> dict[str, object]:
    value = json.loads(RECORDED_PATH.read_text(encoding="utf-8"))
    assert isinstance(value, dict)
    return value


def create_api(tmp_path: Path, transport: RecordedTransport) -> OpenF1Api:
    return OpenF1Api(
        tmp_path,
        base_url="https://recorded.test/v1",
        client=JsonHttpClient(transport, sleep=lambda _: None),
    )


def test_discovers_human_session_and_fetches_each_endpoint_separately(
    tmp_path: Path,
) -> None:
    transport = RecordedTransport(recorded_responses())
    api = create_api(tmp_path, transport)
    provider = OpenF1Provider.discover(
        api,
        year=2024,
        meeting="Tinyland",
        session_type="Race",
    )

    datasets = {
        name: reader() for name, reader in provider_readers(provider).items()
    }

    assert provider.session_key == 10
    assert set(datasets) == {
        "meetings",
        "sessions",
        "drivers",
        "laps",
        "locations",
        "car_data",
    }
    assert transport.calls == [
        "meetings?year=2024",
        "sessions?meeting_key=1",
        "drivers?session_key=10",
        "laps?session_key=10",
        "location?driver_number=4&session_key=10",
        "car_data?driver_number=4&session_key=10",
    ]
    assert len(api.provenance) == 6
    assert set(api.cache_status.values()) == {"miss"}

    cached_transport = RecordedTransport({})
    cached_api = create_api(tmp_path, cached_transport)
    cached_provider = OpenF1Provider.discover(
        cached_api,
        year=2024,
        meeting="Tiny Grand Prix",
        session_type="Race",
    )
    for reader in provider_readers(cached_provider).values():
        reader()
    assert cached_transport.calls == []
    assert set(cached_api.cache_status.values()) == {"hit"}


def test_empty_discovery_is_reported_clearly(tmp_path: Path) -> None:
    responses = recorded_responses()
    meetings = responses["meetings?year=2024"]
    assert isinstance(meetings, dict)
    meetings["body"] = []
    api = create_api(tmp_path, RecordedTransport(responses))

    with pytest.raises(OpenF1DataError, match="No meeting"):
        OpenF1Provider.discover(
            api,
            year=2024,
            meeting="Tinyland",
            session_type="Race",
        )


def test_schema_drift_is_rejected_before_caching_as_provider_data(tmp_path: Path) -> None:
    responses = recorded_responses()
    meetings = responses["meetings?year=2024"]
    assert isinstance(meetings, dict)
    meetings["body"] = [{"meeting_name": "Tiny Grand Prix", "year": 2024}]
    api = create_api(tmp_path, RecordedTransport(responses))

    with pytest.raises(OpenF1DataError, match="meeting_key"):
        OpenF1Provider.discover(
            api,
            year=2024,
            meeting="Tiny Grand Prix",
            session_type="Race",
        )


@pytest.mark.skipif(
    os.getenv("OPENF1_LIVE_TEST") != "1",
    reason="Set OPENF1_LIVE_TEST=1 to use the bounded live API smoke test",
)
def test_live_openf1_discovery_smoke(tmp_path: Path) -> None:
    provider = OpenF1Provider.discover(
        OpenF1Api(tmp_path),
        year=2023,
        meeting="Belgium",
        session_type="Sprint Qualifying",
    )
    assert provider.session["session_key"] == 9140
