"""Tests for input validation, error handling, and edge-case paths added during hardening."""
from __future__ import annotations

import importlib.util
import io
import pathlib
import types

import pytest

from cognis_code.cli import main
from cognis_code.ide import IDES, write_ide_config
from cognis_code.models import MODELS, resolve


# ---------------------------------------------------------------------------
# models.py
# ---------------------------------------------------------------------------


def test_resolve_known_roles():
    for role in MODELS:
        tag = resolve(role)
        assert tag and isinstance(tag, str), f"resolve({role!r}) returned empty/non-string"


def test_resolve_unknown_role_falls_back(capsys):
    """Unknown role should warn on stderr and still return a usable tag."""
    tag = resolve("nonexistent_role_xyz")
    captured = capsys.readouterr()
    assert "warning" in captured.err.lower() or "unknown" in captured.err.lower()
    assert tag and isinstance(tag, str)


def test_resolve_empty_role_raises():
    with pytest.raises(ValueError, match="non-empty"):
        resolve("")


def test_resolve_none_role_raises():
    with pytest.raises((ValueError, TypeError)):
        resolve(None)  # type: ignore[arg-type]


def test_resolve_uncensored_false():
    """uncensored=False should prefer the 'ollama' tag."""
    tag = resolve("coder", uncensored=False)
    assert tag == MODELS["coder"]["ollama"]


# ---------------------------------------------------------------------------
# ide.py
# ---------------------------------------------------------------------------


def test_ide_unknown_raises():
    with pytest.raises(ValueError, match="unknown ide"):
        write_ide_config("vscode_imaginary_ide", dry_run=True)


def test_ide_empty_name_raises():
    with pytest.raises(ValueError):
        write_ide_config("", dry_run=True)


def test_ide_invalid_endpoint_raises():
    with pytest.raises(ValueError, match="http"):
        write_ide_config("continue", endpoint="ftp://bad-endpoint", dry_run=True)


def test_ide_empty_endpoint_raises():
    with pytest.raises(ValueError):
        write_ide_config("continue", endpoint="", dry_run=True)


def test_ide_all_known_dryrun():
    """All known IDEs must produce non-empty content in dry-run mode."""
    for ide in IDES:
        r = write_ide_config(ide, dry_run=True)
        assert r["content"], f"empty content for ide={ide!r}"
        assert r["path"], f"empty path for ide={ide!r}"
        assert r["ide"] == ide


# ---------------------------------------------------------------------------
# cli.py
# ---------------------------------------------------------------------------


def test_cli_no_args_exits_zero():
    """Running with no subcommand should print help and exit 0."""
    assert main([]) == 0


def test_cli_version(capsys):
    with pytest.raises(SystemExit) as exc_info:
        main(["--version"])
    assert exc_info.value.code == 0


def test_cli_ide_unknown_exits_2(capsys):
    rc = main(["ide", "vscode_totally_fake"])
    assert rc == 2
    captured = capsys.readouterr()
    assert "error" in captured.err.lower()
    assert "known" in captured.err.lower()


def test_cli_models_lists_all(capsys):
    rc = main(["models"])
    assert rc == 0
    captured = capsys.readouterr()
    for role in MODELS:
        assert role in captured.out


def test_cli_doctor_runs(capsys):
    rc = main(["doctor"])
    assert rc == 0
    captured = capsys.readouterr()
    assert "ollama" in captured.out.lower()


# ---------------------------------------------------------------------------
# integrations/webhook.py (unit-testable logic only — no real network calls)
# ---------------------------------------------------------------------------


def _load_webhook() -> types.ModuleType:
    spec = importlib.util.spec_from_file_location(
        "webhook",
        pathlib.Path(__file__).parent.parent / "integrations" / "webhook.py",
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


def test_webhook_bad_url_exits_2(monkeypatch):
    webhook = _load_webhook()
    monkeypatch.setattr("sys.argv", ["webhook.py", "--url", "ftp://bad"])
    monkeypatch.setattr("sys.stdin", io.TextIOWrapper(io.BytesIO(b"{}")))
    rc = webhook.main()
    assert rc == 2


def test_webhook_empty_stdin_exits_nonzero(monkeypatch):
    webhook = _load_webhook()
    monkeypatch.setattr("sys.argv", ["webhook.py", "--url", "http://localhost/hook"])
    monkeypatch.setattr("sys.stdin", io.TextIOWrapper(io.BytesIO(b"")))
    rc = webhook.main()
    assert rc != 0


def test_webhook_malformed_header_exits_2(monkeypatch):
    webhook = _load_webhook()
    monkeypatch.setattr(
        "sys.argv",
        ["webhook.py", "--url", "http://localhost/hook", "--header", "BadHeaderNoColon"],
    )
    monkeypatch.setattr("sys.stdin", io.TextIOWrapper(io.BytesIO(b'{"x":1}')))
    rc = webhook.main()
    assert rc == 2
