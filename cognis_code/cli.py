"""cognis-code CLI — install + wire a local uncensored coding suite into every IDE."""
from __future__ import annotations

import argparse
import sys

from cognis_code import TOOL_NAME, TOOL_VERSION
from cognis_code.ide import IDES, write_ide_config
from cognis_code import serve as _serve


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        prog="cognis-code",
        description="Local uncensored coding suite — one endpoint, every IDE.",
    )
    ap.add_argument("--version", action="version", version=f"{TOOL_NAME} {TOOL_VERSION}")
    sub = ap.add_subparsers(dest="cmd")
    sub.add_parser("models", help="list local model roles")
    p = sub.add_parser("pull", help="pull a model via Ollama")
    p.add_argument("role", nargs="?", default="coder")
    sub.add_parser("serve", help="serve the local OpenAI-compatible endpoint")
    i = sub.add_parser("ide", help="write config for an IDE/agent (or 'all')")
    i.add_argument(
        "name",
        help=f"IDE name or 'all'. Known IDEs: {', '.join(IDES)}",
    )
    i.add_argument("--endpoint", default="http://localhost:11434/v1")
    i.add_argument("--dry-run", action="store_true")
    sub.add_parser("doctor", help="check the local setup")
    a = ap.parse_args(argv)

    try:
        return _dispatch(a, ap)
    except KeyboardInterrupt:
        print("\ninterrupted", file=sys.stderr)
        return 130
    except Exception as exc:  # noqa: BLE001
        print(f"error: {exc}", file=sys.stderr)
        return 1


def _dispatch(a, ap) -> int:
    if a.cmd == "models":
        from cognis_code.models import MODELS
        for r, m in MODELS.items():
            print(f"  {r:11} {m.get('abliterated') or m.get('ollama')}  — {m['role']}")
    elif a.cmd == "pull":
        return _serve.pull(a.role)
    elif a.cmd == "serve":
        return _serve.serve()
    elif a.cmd == "ide":
        names = IDES if a.name == "all" else [a.name]
        for n in names:
            try:
                r = write_ide_config(n, a.endpoint, a.dry_run)
            except ValueError as exc:
                print(f"error: {exc}", file=sys.stderr)
                print(f"  known IDEs: {', '.join(IDES)}", file=sys.stderr)
                return 2
            except OSError as exc:
                print(f"error writing config for '{n}': {exc}", file=sys.stderr)
                return 1
            print(f"  {'(dry) ' if a.dry_run else ''}{r['ide']:9} -> {r['path']}")
    elif a.cmd == "doctor":
        import shutil
        print("ollama:", "found" if shutil.which("ollama") else "missing (or use uncensored-fleet)")
        print("endpoint default:", "http://localhost:11434/v1")
    else:
        ap.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())
