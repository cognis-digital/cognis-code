"""cognis-code — set up a local, uncensored AI coding suite wired into every IDE."""
from cognis_code.models import MODELS, resolve
from cognis_code.ide import write_ide_config, IDES
TOOL_NAME = "cognis-code"
TOOL_VERSION = "0.1.0"
__version__ = TOOL_VERSION
__all__ = ["MODELS", "resolve", "write_ide_config", "IDES", "TOOL_NAME", "TOOL_VERSION"]
