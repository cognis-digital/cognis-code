"""Start a local OpenAI-compatible coding endpoint via Ollama (or defer to uncensored-fleet)."""
from __future__ import annotations

import shutil
import subprocess

from cognis_code.models import MODELS, resolve


def pull(role: str = "coder", uncensored: bool = True) -> int:
    """Pull *role*'s model via Ollama.

    Returns a non-zero exit code (and prints to stderr) if Ollama is absent,
    the role is invalid, or the subprocess fails.
    """
    import sys
    if not role or not isinstance(role, str):
        print(f"error: role must be a non-empty string, got {role!r}", file=sys.stderr)
        return 2
    if role not in MODELS:
        print(
            f"error: unknown role {role!r}. Known roles: {', '.join(MODELS)}",
            file=sys.stderr,
        )
        return 2
    tag = resolve(role, uncensored)
    if not shutil.which("ollama"):
        print(
            "Ollama not found. Install: https://ollama.com  (or use uncensored-fleet + llama.cpp)",
            file=sys.stderr,
        )
        return 1
    print(f"ollama pull {tag}")
    try:
        return subprocess.run(["ollama", "pull", tag]).returncode
    except FileNotFoundError:
        print("error: ollama executable disappeared unexpectedly", file=sys.stderr)
        return 1
    except OSError as exc:
        print(f"error launching ollama: {exc}", file=sys.stderr)
        return 1


def serve() -> int:
    """Start the Ollama serve process (or advise on uncensored-fleet)."""
    if shutil.which("ollama"):
        print("Ollama serves an OpenAI-compatible API at http://localhost:11434/v1")
        try:
            return subprocess.run(["ollama", "serve"]).returncode
        except FileNotFoundError:
            import sys
            print("error: ollama executable disappeared unexpectedly", file=sys.stderr)
            return 1
        except OSError as exc:
            import sys
            print(f"error launching ollama: {exc}", file=sys.stderr)
            return 1
    print("No Ollama. Start uncensored-fleet instead: `fleet up coding reasoning`.")
    return 1
