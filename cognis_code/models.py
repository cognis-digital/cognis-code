"""Local uncensored coding + reasoning model registry.

Defaults are abliterated / open-weight GGUFs servable via Ollama or llama.cpp
(OpenAI-compatible). Override in cognis-code.toml. Pairs with `uncensored-fleet`.
"""
from __future__ import annotations

# role -> spec. 'ollama' is the convenient pull tag; 'gguf' is the explicit HF repo.
MODELS = {
    "coder": {
        "ollama": "qwen2.5-coder:7b",
        "gguf": "bartowski/Qwen2.5-Coder-7B-Instruct-GGUF",
        "abliterated": "huihui_ai/qwen2.5-coder-abliterate:7b",
        "role": "code generation, edits, refactors, completions",
    },
    "coder-big": {
        "ollama": "qwen2.5-coder:32b",
        "abliterated": "huihui_ai/qwen2.5-coder-abliterate:32b",
        "role": "heavy coding on big VRAM",
    },
    "reasoner": {
        "ollama": "deepseek-r1:7b",
        "gguf": "bartowski/DeepSeek-R1-Distill-Qwen-7B-GGUF",
        "abliterated": "huihui_ai/deepseek-r1-abliterated:7b",
        "role": "planning, architecture, hard bugs, chain-of-thought",
    },
    "commander": {
        "ollama": "josiefied-qwen3:8b",
        "gguf": "Goekdeniz-Guelmez/Josiefied-Qwen3-8B-abliterated-v1-gguf",
        "role": "unrestricted local agent lead (see uncensored-fleet)",
    },
}
DEFAULT_ENDPOINT = "http://localhost:11434/v1"   # Ollama OpenAI-compatible; or fleet ports

_FALLBACK_ROLE = "coder"


def resolve(role: str, uncensored: bool = True) -> str:
    """Return the model tag for *role*.

    Raises ``ValueError`` for a completely empty/None role string so callers
    get a clear error rather than a silent fallback to the wrong model.
    Falls back to the ``coder`` role for unknown-but-non-empty names (preserving
    the original lenient behaviour) and emits a warning on stderr.
    """
    if not role or not isinstance(role, str):
        raise ValueError(f"role must be a non-empty string, got {role!r}")
    if role.strip() != role:
        role = role.strip()
    m = MODELS.get(role)
    if m is None:
        import sys
        print(
            f"warning: unknown role {role!r}, falling back to '{_FALLBACK_ROLE}'. "
            f"Known roles: {', '.join(MODELS)}",
            file=sys.stderr,
        )
        m = MODELS[_FALLBACK_ROLE]
    return m.get("abliterated") if uncensored and m.get("abliterated") else m.get("ollama", "qwen2.5-coder:7b")
