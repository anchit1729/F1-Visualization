import json
from pathlib import Path

import pytest

from tools.ingestion.f1_replay.provider import (
    DATASETS,
    FilesystemProvider,
    Provider,
    provider_readers,
)


ROOT = Path(__file__).parents[3]
FIXTURE = ROOT / "tools" / "ingestion" / "fixtures" / "raw" / "tiny"


def read_every_dataset(provider: Provider) -> dict[str, list[dict[str, object]]]:
    return {
        dataset: reader()
        for dataset, reader in provider_readers(provider).items()
    }


def test_filesystem_provider_satisfies_the_provider_contract() -> None:
    datasets = read_every_dataset(FilesystemProvider(FIXTURE))

    assert set(datasets) == set(DATASETS)
    assert len(datasets["drivers"]) == 2
    assert datasets["laps"][1]["lap_duration"] is None


@pytest.mark.parametrize("value", ["not json", "{}", "[1]"])
def test_filesystem_provider_rejects_malformed_fixture_data(
    tmp_path: Path,
    value: str,
) -> None:
    (tmp_path / "meetings.json").write_text(value, encoding="utf-8")

    with pytest.raises(ValueError, match="meetings.json"):
        FilesystemProvider(tmp_path).meetings()


def test_fixture_files_are_valid_json_arrays() -> None:
    for dataset in DATASETS:
        value = json.loads((FIXTURE / f"{dataset}.json").read_text(encoding="utf-8"))
        assert isinstance(value, list)

