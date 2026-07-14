from pathlib import Path

import yaml


ROOT = Path(__file__).parents[3]


def test_ci_workflow_is_valid_yaml_with_required_quality_steps() -> None:
    workflow_path = ROOT / ".github" / "workflows" / "ci.yml"
    workflow = yaml.safe_load(workflow_path.read_text(encoding="utf-8"))

    assert workflow["name"] == "CI"
    assert "quality" in workflow["jobs"]

    run_commands = "\n".join(
        step.get("run", "") for step in workflow["jobs"]["quality"]["steps"]
    )
    assert "npm run format:check" in run_commands
    assert "npm run lint" in run_commands
    assert "npm run typecheck" in run_commands
    assert "npm test" in run_commands
    assert "npm run build:web" in run_commands
