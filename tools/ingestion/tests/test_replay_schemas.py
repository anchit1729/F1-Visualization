import json
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker, RefResolver


ROOT = Path(__file__).parents[3]
SCHEMA_DIRECTORY = ROOT / "schemas"
FIXTURE_DIRECTORY = ROOT / "packages" / "test-fixtures" / "replays" / "tiny"


def load_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def validator_for(schema_name: str) -> Draft202012Validator:
    common_schema = load_json(SCHEMA_DIRECTORY / "common.schema.json")
    schema = load_json(SCHEMA_DIRECTORY / schema_name)
    store = {
        common_schema["$id"]: common_schema,
        schema["$id"]: schema,
    }
    resolver = RefResolver.from_schema(schema, store=store)
    return Draft202012Validator(
        schema,
        format_checker=FormatChecker(),
        resolver=resolver,
    )


def test_all_json_schemas_are_valid_draft_2020_12() -> None:
    for schema_path in SCHEMA_DIRECTORY.glob("*.schema.json"):
        Draft202012Validator.check_schema(load_json(schema_path))


def test_python_validates_the_same_tiny_fixture() -> None:
    fixtures = [
        ("catalog.schema.json", FIXTURE_DIRECTORY / "catalog.json"),
        ("replay-index.schema.json", FIXTURE_DIRECTORY / "index.json"),
        (
            "replay-chunk.schema.json",
            FIXTURE_DIRECTORY / "chunks" / "00000.json",
        ),
        (
            "replay-chunk.schema.json",
            FIXTURE_DIRECTORY / "chunks" / "00001.json",
        ),
    ]

    for schema_name, fixture_path in fixtures:
        validator_for(schema_name).validate(load_json(fixture_path))


def test_fixture_contains_boundary_overlap_and_missing_data() -> None:
    first_chunk = load_json(FIXTURE_DIRECTORY / "chunks" / "00000.json")
    second_chunk = load_json(FIXTURE_DIRECTORY / "chunks" / "00001.json")

    assert first_chunk["locationsByDriver"]["driver-1"][-1]["timeMs"] == 5000
    assert second_chunk["locationsByDriver"]["driver-1"][0]["timeMs"] == 5000
    assert first_chunk["telemetryByDriver"]["driver-2"][0]["speedKph"] == 95
    assert first_chunk["telemetryByDriver"]["driver-2"][0]["rpm"] is None
