from pathlib import Path

import pytest

from tools.ingestion.f1_replay.cache import RawCache


def test_raw_cache_loads_once_then_reuses_the_cached_value(tmp_path: Path) -> None:
    load_count = 0

    def load() -> list[dict[str, int]]:
        nonlocal load_count
        load_count += 1
        return [{"meeting_key": 1}]

    cache = RawCache(tmp_path)
    miss = cache.get_or_load("meetings", load)
    hit = cache.get_or_load("meetings", load)

    assert miss.was_hit is False
    assert hit.was_hit is True
    assert hit.records == miss.records
    assert load_count == 1


def test_raw_cache_rejects_corrupted_json(tmp_path: Path) -> None:
    cache = RawCache(tmp_path)
    cache.get_or_load("meetings", lambda: [{"meeting_key": 1}])
    cache_file = next(tmp_path.glob("*.json"))
    cache_file.write_text("not json", encoding="utf-8")

    with pytest.raises(ValueError, match="Corrupted raw cache"):
        cache.get_or_load("meetings", lambda: [])

