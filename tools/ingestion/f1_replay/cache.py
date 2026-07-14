import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from .http import DownloadedJson
from .provider import JsonRecord


@dataclass(frozen=True)
class CacheResult:
    records: list[JsonRecord]
    was_hit: bool


class RawCache:
    def __init__(self, directory: Path) -> None:
        self.directory = directory

    def get_or_load(
        self,
        key: str,
        loader: Callable[[], list[JsonRecord]],
    ) -> CacheResult:
        digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
        path = self.directory / f"{digest}.json"

        if path.exists():
            try:
                records = json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError as error:
                raise ValueError(f"Corrupted raw cache entry: {path}") from error
            if not isinstance(records, list) or any(
                not isinstance(record, dict) for record in records
            ):
                raise ValueError(f"Corrupted raw cache entry: {path}")
            return CacheResult(records=records, was_hit=True)

        records = loader()
        self.directory.mkdir(parents=True, exist_ok=True)
        temporary_path = path.with_suffix(".tmp")
        temporary_path.write_text(
            json.dumps(records, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        temporary_path.replace(path)
        return CacheResult(records=records, was_hit=False)


@dataclass(frozen=True)
class HttpCacheResult:
    metadata: dict[str, object]
    records: list[JsonRecord]
    was_hit: bool


class HttpRawCache:
    def __init__(self, directory: Path) -> None:
        self.directory = directory

    def get_or_download(
        self,
        url: str,
        loader: Callable[[], DownloadedJson],
    ) -> HttpCacheResult:
        request_hash = hashlib.sha256(url.encode("utf-8")).hexdigest()
        metadata_path = self.directory / "requests" / f"{request_hash}.json"

        if metadata_path.exists():
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            if not isinstance(metadata, dict) or metadata.get("requestUrl") != url:
                raise ValueError(f"Corrupted HTTP cache metadata: {metadata_path}")
            content_hash = metadata.get("sha256")
            if not isinstance(content_hash, str):
                raise ValueError(f"Corrupted HTTP cache metadata: {metadata_path}")
            body_path = self.directory / "objects" / f"{content_hash}.json"
            body = body_path.read_bytes()
            if hashlib.sha256(body).hexdigest() != content_hash:
                raise ValueError(f"Hash mismatch for HTTP cache object: {body_path}")
            records = json.loads(body.decode("utf-8"))
            if not isinstance(records, list) or any(
                not isinstance(record, dict) for record in records
            ):
                raise ValueError(f"Corrupted HTTP cache object: {body_path}")
            return HttpCacheResult(metadata, records, True)

        download = loader()
        body_path = self.directory / "objects" / f"{download.sha256}.json"
        body_path.parent.mkdir(parents=True, exist_ok=True)
        if not body_path.exists():
            temporary_body = body_path.with_suffix(".tmp")
            temporary_body.write_bytes(download.body)
            temporary_body.replace(body_path)

        metadata = download.metadata()
        metadata_path.parent.mkdir(parents=True, exist_ok=True)
        temporary_metadata = metadata_path.with_suffix(".tmp")
        temporary_metadata.write_text(
            json.dumps(metadata, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        temporary_metadata.replace(metadata_path)
        return HttpCacheResult(metadata, download.records, False)
