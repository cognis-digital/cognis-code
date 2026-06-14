"""Write local-model config for every popular IDE / coding agent.

All configs point at an OpenAI-compatible local endpoint (Ollama or uncensored-fleet),
so the same uncensored coder/reasoner powers VS Code, JetBrains, Cursor, Zed, Neovim,
opencode, and Aider.
"""
from __future__ import annotations

import json
from pathlib import Path

from cognis_code.models import DEFAULT_ENDPOINT, resolve

IDES = ["continue", "cursor", "zed", "neovim", "opencode", "aider"]
HOME = Path.home()


def _validate_endpoint(endpoint: str) -> str:
    """Return the endpoint stripped of trailing whitespace.

    Raises ``ValueError`` if the endpoint is empty or obviously malformed.
    """
    if not endpoint or not isinstance(endpoint, str):
        raise ValueError(f"endpoint must be a non-empty string, got {endpoint!r}")
    endpoint = endpoint.strip()
    if not endpoint.startswith(("http://", "https://")):
        raise ValueError(
            f"endpoint must start with http:// or https://, got {endpoint!r}"
        )
    return endpoint


def _continue_cfg(endpoint, coder, reasoner):
    base = endpoint.rstrip("/")
    return {
        "models": [
            {
                "title": "Cognis Coder (local, uncensored)",
                "provider": "openai",
                "model": coder,
                "apiBase": base,
                "apiKey": "local",
            },
            {
                "title": "Cognis Reasoner (local)",
                "provider": "openai",
                "model": reasoner,
                "apiBase": base,
                "apiKey": "local",
            },
        ],
        "tabAutocompleteModel": {
            "title": "Coder",
            "provider": "openai",
            "model": coder,
            "apiBase": base,
            "apiKey": "local",
        },
    }


def write_ide_config(ide: str, endpoint: str = DEFAULT_ENDPOINT, dry_run: bool = False) -> dict:
    """Write (or preview) the config for one IDE/agent. Returns {ide, path, content}.

    Raises:
        ValueError: for unknown *ide* name or invalid *endpoint*.
        OSError: if the config file cannot be written (only when dry_run=False).
    """
    if not ide or not isinstance(ide, str):
        raise ValueError(f"ide must be a non-empty string, got {ide!r}")
    endpoint = _validate_endpoint(endpoint)
    coder = resolve("coder")
    reasoner = resolve("reasoner")
    ide = ide.lower().strip()
    if ide == "continue":  # VS Code + JetBrains (Continue.dev)
        p = HOME / ".continue" / "config.json"
        content = json.dumps(_continue_cfg(endpoint, coder, reasoner), indent=2)
    elif ide == "opencode":
        p = HOME / ".config" / "opencode" / "opencode.json"
        content = json.dumps(
            {
                "provider": {
                    "local": {
                        "npm": "@ai-sdk/openai-compatible",
                        "options": {"baseURL": endpoint},
                        "models": {coder: {}, reasoner: {}},
                    }
                },
                "model": f"local/{coder}",
            },
            indent=2,
        )
    elif ide == "aider":
        p = HOME / ".aider.conf.yml"
        content = (
            f"openai-api-base: {endpoint}\nopenai-api-key: local\n"
            f"model: openai/{coder}\nweak-model: openai/{coder}\n"
        )
    elif ide == "zed":
        p = HOME / ".config" / "zed" / "settings.json"
        content = json.dumps(
            {
                "assistant": {
                    "default_model": {"provider": "openai", "model": coder},
                    "version": "2",
                },
                "language_models": {
                    "openai": {
                        "api_url": endpoint,
                        "available_models": [{"name": coder, "max_tokens": 32768}],
                    }
                },
            },
            indent=2,
        )
    elif ide == "cursor":
        p = HOME / ".cognis-code" / "cursor-instructions.md"
        content = (
            "# Cursor → local uncensored model\n\n"
            "Settings → Models → enable 'Override OpenAI Base URL':\n"
            f"- Base URL: `{endpoint}`\n- API key: `local`\n- Model: add `{coder}`\n"
        )
    elif ide == "neovim":
        p = HOME / ".cognis-code" / "neovim-avante.lua"
        content = (
            "-- Avante.nvim (or codecompanion) → local endpoint\n"
            "require('avante').setup({ provider='openai', openai={\n"
            f"  endpoint='{endpoint}', model='{coder}', api_key_name='' }} }})\n"
        )
    else:
        raise ValueError(f"unknown ide: {ide!r}. Known IDEs: {', '.join(IDES)}")
    if not dry_run:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
    return {"ide": ide, "path": str(p), "content": content}
