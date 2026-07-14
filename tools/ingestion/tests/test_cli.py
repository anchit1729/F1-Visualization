import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from tools.ingestion.f1_replay import cli
from tools.ingestion.f1_replay.cli import main
from tools.ingestion.f1_replay.provider import FilesystemProvider


ROOT = Path(__file__).parents[3]
FIXTURE = ROOT / "tools" / "ingestion" / "fixtures" / "raw" / "tiny"


def test_cli_help_and_missing_command_exit_codes() -> None:
    with pytest.raises(SystemExit) as help_exit:
        main(["--help"])
    with pytest.raises(SystemExit) as error_exit:
        main([])

    assert help_exit.value.code == 0
    assert error_exit.value.code == 2


def test_discover_reports_source_dataset_counts(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["discover", "--fixture", str(FIXTURE)]) == 0

    result = json.loads(capsys.readouterr().out)
    assert result["provider"] == "filesystem"
    assert result["counts"]["drivers"] == 2


def test_fetch_reports_cache_misses_then_hits(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    arguments = ["fetch", "--fixture", str(FIXTURE), "--cache", str(tmp_path)]

    assert main(arguments) == 0
    first = json.loads(capsys.readouterr().out)
    assert main(arguments) == 0
    second = json.loads(capsys.readouterr().out)

    assert set(first["cache"].values()) == {"miss"}
    assert set(second["cache"].values()) == {"hit"}


def test_tiny_recipe_builds_and_validates_without_network(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    output = tmp_path / "output" / "provider-snapshot.json"
    recipe = tmp_path / "recipe.json"
    recipe.write_text(
        json.dumps(
            {
                "provider": "filesystem",
                "fixture": str(FIXTURE),
                "cache": str(tmp_path / "cache"),
                "output": str(output),
            }
        ),
        encoding="utf-8",
    )

    assert main(["build", "--recipe", str(recipe)]) == 0
    capsys.readouterr()
    assert output.exists()
    assert main(["validate", str(output)]) == 0
    assert "Valid snapshot" in capsys.readouterr().out
    timing_output = tmp_path / "output" / "timing-report.json"
    assert main(["normalize", str(output), "--output", str(timing_output)]) == 0
    assert json.loads(timing_output.read_text(encoding="utf-8"))[
        "overallFastestLap"
    ] == {"driverId": "driver-4", "durationMs": 10000, "lapNumber": 1}
    geometry_output = tmp_path / "output" / "geometry-report.json"
    diagnostic_output = tmp_path / "output" / "geometry.svg"
    assert (
        main(
            [
                "geometry",
                str(output),
                "--timing",
                str(timing_output),
                "--output",
                str(geometry_output),
                "--diagnostic",
                str(diagnostic_output),
            ]
        )
        == 0
    )
    assert json.loads(geometry_output.read_text(encoding="utf-8"))["track"][
        "viewBox"
    ] == [0, 0, 1000, 1000]
    assert diagnostic_output.read_text(encoding="utf-8").startswith("<svg")
    telemetry_output = tmp_path / "output" / "telemetry-report.json"
    assert (
        main(
            [
                "telemetry",
                str(output),
                "--timing",
                str(timing_output),
                "--geometry",
                str(geometry_output),
                "--output",
                str(telemetry_output),
            ]
        )
        == 0
    )
    telemetry = json.loads(telemetry_output.read_text(encoding="utf-8"))
    assert telemetry["telemetryByDriver"]["driver-4"][0]["speedKph"] == 100


def test_validate_returns_failure_for_a_malformed_snapshot(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    snapshot = tmp_path / "invalid.json"
    snapshot.write_text('{"provider":"filesystem","datasets":{}}', encoding="utf-8")

    assert main(["validate", str(snapshot)]) == 1
    assert "missing or unknown datasets" in capsys.readouterr().err


def test_openf1_recipe_uses_human_selection_and_records_provenance(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    class StubOpenF1Provider(FilesystemProvider):
        def __init__(self) -> None:
            super().__init__(FIXTURE)
            self.api = SimpleNamespace(
                cache_status={"meetings": "miss"},
                provenance={
                    "https://recorded.test/v1/meetings?year=2024": {
                        "requestUrl": "https://recorded.test/v1/meetings?year=2024",
                        "retrievedAt": "2024-01-01T00:00:00+00:00",
                        "byteSize": 2,
                        "sha256": "abc",
                        "etag": None,
                        "lastModified": None,
                    }
                },
            )

    selections: list[dict[str, object]] = []

    def create_stub(**options: object) -> StubOpenF1Provider:
        selections.append(options)
        return StubOpenF1Provider()

    monkeypatch.setattr(cli, "create_openf1_provider", create_stub)
    output = tmp_path / "provider-snapshot.json"
    recipe = tmp_path / "openf1.json"
    recipe.write_text(
        json.dumps(
            {
                "provider": "openf1",
                "year": 2024,
                "meeting": "Tinyland",
                "sessionType": "Race",
                "cache": "cache",
                "output": output.name,
            }
        ),
        encoding="utf-8",
    )

    assert main(["build", "--recipe", str(recipe)]) == 0
    capsys.readouterr()
    snapshot = json.loads(output.read_text(encoding="utf-8"))
    assert selections[0]["meeting"] == "Tinyland"
    assert selections[0]["session_type"] == "Race"
    assert snapshot["provider"] == "openf1"
    assert snapshot["provenance"][0]["sha256"] == "abc"
