import hashlib
import json
import logging
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable, Mapping, Protocol
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from .provider import JsonRecord


LOGGER = logging.getLogger(__name__)
RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}


class DownloadError(ValueError):
    """Raised when an HTTP response cannot safely become raw source data."""


def header_value(headers: Mapping[str, str], name: str) -> str | None:
    target = name.casefold()
    return next(
        (value for key, value in headers.items() if key.casefold() == target),
        None,
    )


@dataclass(frozen=True)
class HttpResponse:
    status_code: int
    headers: Mapping[str, str]
    body: bytes


class HttpTransport(Protocol):
    def get(self, url: str, timeout_seconds: float) -> HttpResponse: ...


class UrllibTransport:
    def get(self, url: str, timeout_seconds: float) -> HttpResponse:
        request = Request(url, headers={"User-Agent": "f1-replay-ingestion/0.1"})
        try:
            with urlopen(request, timeout=timeout_seconds) as response:
                return HttpResponse(
                    status_code=response.status,
                    headers=dict(response.headers.items()),
                    body=response.read(),
                )
        except HTTPError as error:
            return HttpResponse(
                status_code=error.code,
                headers=dict(error.headers.items()),
                body=error.read(),
            )


@dataclass(frozen=True)
class DownloadedJson:
    body: bytes
    byte_size: int
    etag: str | None
    last_modified: str | None
    records: list[JsonRecord]
    request_url: str
    retrieved_at: str
    sha256: str

    def metadata(self) -> dict[str, object]:
        return {
            "byteSize": self.byte_size,
            "etag": self.etag,
            "lastModified": self.last_modified,
            "requestUrl": self.request_url,
            "retrievedAt": self.retrieved_at,
            "sha256": self.sha256,
        }


class JsonHttpClient:
    def __init__(
        self,
        transport: HttpTransport | None = None,
        *,
        timeout_seconds: float = 15,
        max_attempts: int = 3,
        max_response_bytes: int = 100_000_000,
        sleep: Callable[[float], None] = time.sleep,
        now: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
    ) -> None:
        self.transport = transport or UrllibTransport()
        self.timeout_seconds = timeout_seconds
        self.max_attempts = max_attempts
        self.max_response_bytes = max_response_bytes
        self.sleep = sleep
        self.now = now

    def download(self, url: str) -> DownloadedJson:
        response: HttpResponse | None = None
        for attempt in range(self.max_attempts):
            try:
                response = self.transport.get(url, self.timeout_seconds)
            except (OSError, TimeoutError) as error:
                if attempt + 1 == self.max_attempts:
                    raise DownloadError(
                        f"Request failed after {self.max_attempts} attempts: {url}"
                    ) from error
                self.sleep(2**attempt)
                continue

            if response.status_code in RETRYABLE_STATUS_CODES:
                if attempt + 1 == self.max_attempts:
                    raise DownloadError(
                        f"HTTP {response.status_code} after {self.max_attempts} attempts: {url}"
                    )
                retry_after = header_value(response.headers, "Retry-After")
                delay = float(retry_after) if retry_after else float(2**attempt)
                self.sleep(delay)
                continue
            break

        if response is None or not 200 <= response.status_code < 300:
            status = response.status_code if response else "unknown"
            raise DownloadError(f"HTTP {status}: {url}")
        if len(response.body) > self.max_response_bytes:
            raise DownloadError(
                f"Response exceeds {self.max_response_bytes} bytes: {url}"
            )

        try:
            records = json.loads(response.body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise DownloadError(f"Response is not valid UTF-8 JSON: {url}") from error
        if not isinstance(records, list) or any(
            not isinstance(record, dict) for record in records
        ):
            raise DownloadError(f"Response must be a JSON array of objects: {url}")

        byte_size = len(response.body)
        LOGGER.info("Downloaded %s bytes from %s", byte_size, url)
        return DownloadedJson(
            body=response.body,
            byte_size=byte_size,
            etag=header_value(response.headers, "ETag"),
            last_modified=header_value(response.headers, "Last-Modified"),
            records=records,
            request_url=url,
            retrieved_at=self.now().isoformat(),
            sha256=hashlib.sha256(response.body).hexdigest(),
        )
