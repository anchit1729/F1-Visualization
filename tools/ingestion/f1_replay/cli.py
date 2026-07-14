import argparse
import hashlib
import json
import sys
import tempfile
from pathlib import Path
from typing import Sequence

from .cache import RawCache
from .derive.telemetry import normalize_telemetry_snapshot
from .emit.artifacts import (
    EmitConfig,
    emit_replay_artifacts,
    tree_hashes,
    verify_emitted_artifacts,
)
from .geometry.track import normalize_geometry_snapshot, render_geometry_svg
from .normalize.timing import normalize_timing_snapshot
from .provider import (
    DATASETS,
    FilesystemProvider,
    JsonRecord,
    Provider,
    provider_readers,
)
from .providers.openf1 import DEFAULT_BASE_URL, OpenF1Api, OpenF1Provider


Snapshot = dict[str, object]


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = path.with_suffix(".tmp")
    temporary_path.write_text(
        json.dumps(value, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    temporary_path.replace(path)


def write_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = path.with_suffix(".tmp")
    temporary_path.write_text(value, encoding="utf-8")
    temporary_path.replace(path)


def read_provider(provider: Provider) -> dict[str, list[JsonRecord]]:
    return {
        dataset: reader() for dataset, reader in provider_readers(provider).items()
    }


def fetch_filesystem_datasets(
    fixture: Path,
    cache_directory: Path,
) -> tuple[dict[str, list[JsonRecord]], dict[str, str]]:
    provider = FilesystemProvider(fixture)
    cache = RawCache(cache_directory)
    datasets: dict[str, list[JsonRecord]] = {}
    cache_status: dict[str, str] = {}

    for dataset, reader in provider_readers(provider).items():
        source_path = fixture / f"{dataset}.json"
        source_hash = hashlib.sha256(source_path.read_bytes()).hexdigest()
        result = cache.get_or_load(
            f"filesystem:{fixture.resolve()}:{dataset}:{source_hash}",
            reader,
        )
        datasets[dataset] = result.records
        cache_status[dataset] = "hit" if result.was_hit else "miss"

    return datasets, cache_status


def require(value: object, name: str) -> object:
    if value is None:
        raise ValueError(f"{name} is required for this provider")
    return value


def create_openf1_provider(
    *,
    cache: Path,
    year: int,
    meeting: str,
    session_type: str,
    base_url: str = DEFAULT_BASE_URL,
) -> OpenF1Provider:
    api = OpenF1Api(cache, base_url=base_url)
    return OpenF1Provider.discover(
        api,
        year=year,
        meeting=meeting,
        session_type=session_type,
    )


def validate_snapshot(snapshot: object) -> None:
    if not isinstance(snapshot, dict) or snapshot.get("provider") not in {
        "filesystem",
        "openf1",
    }:
        raise ValueError("Snapshot must declare a supported provider")

    datasets = snapshot.get("datasets")
    if not isinstance(datasets, dict) or set(datasets) != set(DATASETS):
        raise ValueError("Snapshot has missing or unknown datasets")

    for dataset, records in datasets.items():
        if not isinstance(records, list) or any(
            not isinstance(record, dict) for record in records
        ):
            raise ValueError(f"Dataset {dataset} must be an array of objects")


def load_recipe(path: Path) -> dict[str, object]:
    recipe = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(recipe, dict) or recipe.get("provider") not in {
        "filesystem",
        "openf1",
    }:
        raise ValueError("Recipe must declare a supported provider")
    return recipe


def recipe_path(recipe_path: Path, value: object, name: str) -> Path:
    if not isinstance(value, str):
        raise ValueError(f"Recipe requires a {name} path")
    return (recipe_path.parent / value).resolve()


def emit_config(value: object) -> EmitConfig:
    if not isinstance(value, dict):
        raise ValueError("Recipe artifact configuration must be an object")
    try:
        lap = value.get("lap")
        if lap is not None and not isinstance(lap, dict):
            raise ValueError("Recipe lap configuration must be an object")
        return EmitConfig(
            replay_id=str(value["id"]),
            title=str(value["title"]),
            subtitle=str(value["subtitle"]),
            replay_scope=str(value["replayScope"]),
            chunk_duration_ms=int(value["chunkDurationMs"]),
            max_total_bytes=int(value["maxTotalBytes"]),
            max_initial_bytes=int(value["maxInitialBytes"]),
            transformation_version=str(value["transformationVersion"]),
            source_url=str(value["sourceUrl"]) if value.get("sourceUrl") else None,
            retrieved_at_utc=str(value["retrievedAtUtc"])
            if value.get("retrievedAtUtc")
            else None,
            lap_driver_number=int(lap["driverNumber"]) if lap else None,
            lap_number=int(lap["lapNumber"]) if lap else None,
        )
    except (KeyError, TypeError, ValueError) as error:
        raise ValueError("Recipe artifact configuration is incomplete") from error


def discover_command(args: argparse.Namespace) -> None:
    if args.provider == "filesystem":
        fixture = require(args.fixture, "--fixture")
        provider = FilesystemProvider(fixture)
        counts = {
            dataset: len(reader())
            for dataset, reader in provider_readers(provider).items()
        }
        result = {"provider": "filesystem", "counts": counts}
    else:
        provider = create_openf1_provider(
            cache=require(args.cache, "--cache"),
            year=require(args.year, "--year"),
            meeting=require(args.meeting, "--meeting"),
            session_type=require(args.session_type, "--session-type"),
            base_url=args.base_url,
        )
        result = {
            "provider": "openf1",
            "meeting": provider.meeting,
            "session": provider.session,
        }
    print(json.dumps(result, sort_keys=True))


def fetch_command(args: argparse.Namespace) -> None:
    if args.provider == "filesystem":
        datasets, cache_status = fetch_filesystem_datasets(
            require(args.fixture, "--fixture"),
            args.cache,
        )
    else:
        provider = create_openf1_provider(
            cache=args.cache,
            year=require(args.year, "--year"),
            meeting=require(args.meeting, "--meeting"),
            session_type=require(args.session_type, "--session-type"),
            base_url=args.base_url,
        )
        datasets = read_provider(provider)
        cache_status = provider.api.cache_status
    print(
        json.dumps(
            {
                "cache": cache_status,
                "counts": {key: len(value) for key, value in datasets.items()},
            },
            sort_keys=True,
        )
    )


def build_command(args: argparse.Namespace) -> None:
    recipe = load_recipe(args.recipe)
    cache = recipe_path(args.recipe, recipe.get("cache"), "cache")
    output = recipe_path(args.recipe, recipe.get("output"), "output")

    if recipe["provider"] == "filesystem":
        fixture = recipe_path(args.recipe, recipe.get("fixture"), "fixture")
        datasets, cache_status = fetch_filesystem_datasets(fixture, cache)
        snapshot: Snapshot = {"provider": "filesystem", "datasets": datasets}
    else:
        provider = create_openf1_provider(
            cache=cache,
            year=int(require(recipe.get("year"), "year")),
            meeting=str(require(recipe.get("meeting"), "meeting")),
            session_type=str(require(recipe.get("sessionType"), "sessionType")),
            base_url=str(recipe.get("baseUrl", DEFAULT_BASE_URL)),
        )
        datasets = read_provider(provider)
        cache_status = provider.api.cache_status
        snapshot = {
            "provider": "openf1",
            "datasets": datasets,
            "provenance": sorted(
                provider.api.provenance.values(),
                key=lambda item: str(item["requestUrl"]),
            ),
        }

    validate_snapshot(snapshot)
    write_json(output, snapshot)
    result = {"cache": cache_status, "output": str(output)}
    timing_output_value = recipe.get("timingOutput")
    timing_report = None
    if timing_output_value is not None:
        timing_output = recipe_path(args.recipe, timing_output_value, "timingOutput")
        timing_report = normalize_timing_snapshot(snapshot)
        write_json(timing_output, timing_report)
        result["timingOutput"] = str(timing_output)
    geometry_output_value = recipe.get("geometryOutput")
    geometry_report = None
    if geometry_output_value is not None:
        geometry_output = recipe_path(args.recipe, geometry_output_value, "geometryOutput")
        timing_report = timing_report or normalize_timing_snapshot(snapshot)
        geometry_report = normalize_geometry_snapshot(snapshot, timing_report)
        write_json(geometry_output, geometry_report)
        result["geometryOutput"] = str(geometry_output)
        diagnostic_value = recipe.get("geometryDiagnosticOutput")
        if diagnostic_value is not None:
            diagnostic_output = recipe_path(
                args.recipe,
                diagnostic_value,
                "geometryDiagnosticOutput",
            )
            write_text(diagnostic_output, render_geometry_svg(geometry_report))
            result["geometryDiagnosticOutput"] = str(diagnostic_output)
    telemetry_output_value = recipe.get("telemetryOutput")
    if telemetry_output_value is not None:
        telemetry_output = recipe_path(
            args.recipe,
            telemetry_output_value,
            "telemetryOutput",
        )
        timing_report = timing_report or normalize_timing_snapshot(snapshot)
        geometry_report = geometry_report or normalize_geometry_snapshot(
            snapshot,
            timing_report,
        )
        write_json(
            telemetry_output,
            normalize_telemetry_snapshot(snapshot, timing_report, geometry_report),
        )
        result["telemetryOutput"] = str(telemetry_output)
    artifact = recipe.get("artifact")
    if artifact is not None:
        if not isinstance(artifact, dict):
            raise ValueError("Recipe artifact configuration must be an object")
        artifact_root = recipe_path(
            args.recipe,
            artifact.get("root"),
            "artifact root",
        )
        timing_report = timing_report or normalize_timing_snapshot(snapshot)
        geometry_report = geometry_report or normalize_geometry_snapshot(
            snapshot,
            timing_report,
        )
        telemetry_report = normalize_telemetry_snapshot(
            snapshot,
            timing_report,
            geometry_report,
        )
        budget_report = emit_replay_artifacts(
            artifact_root,
            snapshot,
            timing_report,
            geometry_report,
            telemetry_report,
            emit_config(artifact),
        )
        verify_emitted_artifacts(artifact_root, budget_report["replayId"])
        budget_output = recipe_path(
            args.recipe,
            artifact.get("budgetOutput"),
            "budgetOutput",
        )
        write_json(budget_output, budget_report)
        result["artifactRoot"] = str(artifact_root)
        result["budgetOutput"] = str(budget_output)
    print(json.dumps(result, sort_keys=True))


def validate_command(args: argparse.Namespace) -> None:
    snapshot = json.loads(args.snapshot.read_text(encoding="utf-8"))
    validate_snapshot(snapshot)
    print(f"Valid snapshot: {args.snapshot}")


def normalize_command(args: argparse.Namespace) -> None:
    snapshot = json.loads(args.snapshot.read_text(encoding="utf-8"))
    validate_snapshot(snapshot)
    write_json(args.output, normalize_timing_snapshot(snapshot))
    print(f"Normalized timing report: {args.output}")


def geometry_command(args: argparse.Namespace) -> None:
    snapshot = json.loads(args.snapshot.read_text(encoding="utf-8"))
    timing_report = json.loads(args.timing.read_text(encoding="utf-8"))
    validate_snapshot(snapshot)
    geometry_report = normalize_geometry_snapshot(snapshot, timing_report)
    write_json(args.output, geometry_report)
    if args.diagnostic:
        write_text(args.diagnostic, render_geometry_svg(geometry_report))
    print(f"Normalized geometry report: {args.output}")


def telemetry_command(args: argparse.Namespace) -> None:
    snapshot = json.loads(args.snapshot.read_text(encoding="utf-8"))
    timing_report = json.loads(args.timing.read_text(encoding="utf-8"))
    geometry_report = json.loads(args.geometry.read_text(encoding="utf-8"))
    validate_snapshot(snapshot)
    write_json(
        args.output,
        normalize_telemetry_snapshot(snapshot, timing_report, geometry_report),
    )
    print(f"Normalized telemetry report: {args.output}")


def verify_artifacts_command(args: argparse.Namespace) -> None:
    verify_emitted_artifacts(args.root)
    print(f"Verified replay artifacts: {args.root}")


def emit_command(args: argparse.Namespace) -> None:
    recipe = load_recipe(args.recipe)
    artifact = recipe.get("artifact")
    if not isinstance(artifact, dict):
        raise ValueError("Recipe requires artifact configuration")
    snapshot = load_recipe_output(args.recipe, recipe, "output")
    timing = load_recipe_output(args.recipe, recipe, "timingOutput")
    geometry = load_recipe_output(args.recipe, recipe, "geometryOutput")
    telemetry = load_recipe_output(args.recipe, recipe, "telemetryOutput")
    artifact_root = recipe_path(
        args.recipe,
        artifact.get("root"),
        "artifact root",
    )
    report = emit_replay_artifacts(
        artifact_root,
        snapshot,
        timing,
        geometry,
        telemetry,
        emit_config(artifact),
    )
    verify_emitted_artifacts(artifact_root, str(report["replayId"]))
    budget_output = recipe_path(
        args.recipe,
        artifact.get("budgetOutput"),
        "budgetOutput",
    )
    write_json(budget_output, report)
    print(f"Emitted replay artifacts: {report['replayId']}")


def reproduce_command(args: argparse.Namespace) -> None:
    recipe = load_recipe(args.recipe)
    artifact = recipe.get("artifact")
    if not isinstance(artifact, dict):
        raise ValueError("Recipe requires artifact configuration")
    snapshot = load_recipe_output(args.recipe, recipe, "output")
    timing = load_recipe_output(args.recipe, recipe, "timingOutput")
    geometry = load_recipe_output(args.recipe, recipe, "geometryOutput")
    telemetry = load_recipe_output(args.recipe, recipe, "telemetryOutput")
    with tempfile.TemporaryDirectory() as first, tempfile.TemporaryDirectory() as second:
        first_root = Path(first)
        second_root = Path(second)
        config = emit_config(artifact)
        emit_replay_artifacts(first_root, snapshot, timing, geometry, telemetry, config)
        emit_replay_artifacts(second_root, snapshot, timing, geometry, telemetry, config)
        if tree_hashes(first_root) != tree_hashes(second_root):
            raise ValueError("Artifact rebuild is not reproducible")
    print(f"Reproducible replay artifacts: {config.replay_id}")


def load_recipe_output(
    recipe_path_value: Path,
    recipe: dict[str, object],
    field: str,
) -> JsonRecord:
    path = recipe_path(recipe_path_value, recipe.get(field), field)
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"Recipe output {field} must be an object")
    return value


def add_provider_options(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--provider",
        choices=("filesystem", "openf1"),
        default="filesystem",
    )
    parser.add_argument("--fixture", type=Path)
    parser.add_argument("--year", type=int)
    parser.add_argument("--meeting")
    parser.add_argument("--session-type")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)


def create_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="f1-replay",
        description="Prepare deterministic F1 replay source data.",
    )
    commands = parser.add_subparsers(dest="command", required=True)

    discover = commands.add_parser("discover", help="Resolve source data")
    add_provider_options(discover)
    discover.add_argument("--cache", type=Path)
    discover.set_defaults(handler=discover_command)

    fetch = commands.add_parser("fetch", help="Populate the raw cache")
    add_provider_options(fetch)
    fetch.add_argument("--cache", required=True, type=Path)
    fetch.set_defaults(handler=fetch_command)

    build = commands.add_parser("build", help="Build an intermediate snapshot")
    build.add_argument("--recipe", required=True, type=Path)
    build.set_defaults(handler=build_command)

    validate = commands.add_parser("validate", help="Validate a provider snapshot")
    validate.add_argument("snapshot", type=Path)
    validate.set_defaults(handler=validate_command)

    normalize = commands.add_parser("normalize", help="Normalize timing data")
    normalize.add_argument("snapshot", type=Path)
    normalize.add_argument("--output", required=True, type=Path)
    normalize.set_defaults(handler=normalize_command)

    geometry = commands.add_parser("geometry", help="Normalize track geometry")
    geometry.add_argument("snapshot", type=Path)
    geometry.add_argument("--timing", required=True, type=Path)
    geometry.add_argument("--output", required=True, type=Path)
    geometry.add_argument("--diagnostic", type=Path)
    geometry.set_defaults(handler=geometry_command)

    telemetry = commands.add_parser("telemetry", help="Normalize telemetry data")
    telemetry.add_argument("snapshot", type=Path)
    telemetry.add_argument("--timing", required=True, type=Path)
    telemetry.add_argument("--geometry", required=True, type=Path)
    telemetry.add_argument("--output", required=True, type=Path)
    telemetry.set_defaults(handler=telemetry_command)

    verify_artifacts = commands.add_parser(
        "verify-artifacts",
        help="Verify emitted replay hashes and schemas",
    )
    verify_artifacts.add_argument("root", type=Path)
    verify_artifacts.set_defaults(handler=verify_artifacts_command)

    emit = commands.add_parser(
        "emit",
        help="Emit artifacts from existing normalized reports",
    )
    emit.add_argument("--recipe", required=True, type=Path)
    emit.set_defaults(handler=emit_command)

    reproduce = commands.add_parser(
        "reproduce",
        help="Rebuild emitted artifacts twice and compare hashes",
    )
    reproduce.add_argument("--recipe", required=True, type=Path)
    reproduce.set_defaults(handler=reproduce_command)

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = create_parser()
    args = parser.parse_args(argv)
    try:
        args.handler(args)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    return 0
