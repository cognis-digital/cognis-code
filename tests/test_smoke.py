from cognis_code.ide import write_ide_config, IDES
from cognis_code.models import resolve
def test_resolve():
    assert resolve("coder")
def test_ide_dryrun():
    for ide in IDES:
        r = write_ide_config(ide, dry_run=True)
        assert r["content"] and r["path"]
