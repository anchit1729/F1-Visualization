import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

from tools.ingestion.f1_replay.cache import HttpRawCache
from tools.ingestion.f1_replay.http import (
    DownloadError,
    HttpResponse,
    JsonHttpClient,
)


class SequenceTransport:
    def __init__(self, responses: list[HttpResponse | Exception]) -> None:
        self.responses = responses
        self.calls = 0

    def get(self, url: str, timeout_seconds: float) -> HttpResponse:
        del url, timeout_seconds
        response = self.responses[self.calls]
        self.calls += 1
        if isinstance(response, Exception):
            raise response
        return response


def response(
    value: object,
    status: int = 200,
    headers: dict[str, str] | None = None,
) -> HttpResponse:
    return HttpResponse(status, headers or {}, json.dumps(value).encode("utf-8"))


def client_for(
    responses: list[HttpResponse | Exception],
    **options: object,
) -> tuple[JsonHttpClient, SequenceTransport, list[float]]:
    transport = SequenceTransport(responses)
    delays: list[float] = []
    client = JsonHttpClient(
        transport,
        sleep=delays.append,
        now=lambda: datetime(2024, 1, 1, tzinfo=timezone.utc),
        **options,
    )
    return client, transport, delays


def test_download_records_size_hash_time_and_http_validators(caplog: pytest.LogCaptureFixture) -> None:
    body = [{"meeting_key": 1}]
    headers = {"ETag": "abc", "Last-Modified": "yesterday"}
    client, _, _ = client_for([response(body, headers=headers)])

    with caplog.at_level("INFO"):
        result = client.download("https://example.test/meetings")

    assert result.records == body
    assert result.byte_size == len(result.body)
    assert result.sha256 == hashlib.sha256(result.body).hexdigest()
    assert result.etag == "abc"
    assert result.last_modified == "yesterday"
    assert result.retrieved_at == "2024-01-01T00:00:00+00:00"
    assert "Downloaded" in caplog.text


def test_retryable_responses_and_timeouts_use_bounded_backoff() -> None:
    client, transport, delays = client_for(
        [
            response({"message": "busy"}, 429, {"Retry-After": "0"}),
            TimeoutError(),
            response([{"meeting_key": 1}]),
        ]
    )

    assert client.download("https://example.test/meetings").records
    assert transport.calls == 3
    assert delays == [0.0, 2]


def test_server_error_stops_after_the_attempt_budget() -> None:
    client, transport, _ = client_for([response([], 500)] * 3)

    with pytest.raises(DownloadError, match="HTTP 500 after 3 attempts"):
        client.download("https://example.test/meetings")
    assert transport.calls == 3


@pytest.mark.parametrize(
    ("http_response", "message", "options"),
    [
        (HttpResponse(200, {}, b"not json"), "valid UTF-8 JSON", {}),
        (response({"not": "a list"}), "array of objects", {}),
        (response([{"large": "response"}]), "exceeds 4 bytes", {"max_response_bytes": 4}),
    ],
)
def test_malformed_and_oversized_responses_fail_without_retry(
    http_response: HttpResponse,
    message: str,
    options: dict[str, int],
) -> None:
    client, transport, _ = client_for([http_response], **options)

    with pytest.raises(DownloadError, match=message):
        client.download("https://example.test/data")
    assert transport.calls == 1


def test_http_cache_is_content_addressed_and_detects_hash_mismatch(tmp_path: Path) -> None:
    client, transport, _ = client_for([response([{"meeting_key": 1}])])
    cache = HttpRawCache(tmp_path)
    url = "https://example.test/meetings?year=2024"

    miss = cache.get_or_download(url, lambda: client.download(url))
    hit = cache.get_or_download(url, lambda: client.download(url))

    assert miss.was_hit is False
    assert hit.was_hit is True
    assert transport.calls == 1
    object_path = next((tmp_path / "objects").glob("*.json"))
    object_path.write_text("[]", encoding="utf-8")
    with pytest.raises(ValueError, match="Hash mismatch"):
        cache.get_or_download(url, lambda: client.download(url))

