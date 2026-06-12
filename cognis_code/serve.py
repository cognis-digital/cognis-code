"""Start a local OpenAI-compatible coding endpoint via Ollama (or defer to uncensored-fleet)."""
from __future__ import annotations
import shutil, subprocess
from cognis_code.models import resolve

def pull(role: str = "coder", uncensored: bool = True) -> int:
    tag = resolve(role, uncensored)
    if not shutil.which("ollama"):
        print("Ollama not found. Install: https://ollama.com  (or use uncensored-fleet + llama.cpp)")
        return 1
    print(f"ollama pull {tag}")
    return subprocess.run(["ollama", "pull", tag]).returncode

def serve() -> int:
    if shutil.which("ollama"):
        print("Ollama serves an OpenAI-compatible API at http://localhost:11434/v1")
        return subprocess.run(["ollama", "serve"]).returncode
    print("No Ollama. Start uncensored-fleet instead: `fleet up coding reasoning`.")
    return 1
