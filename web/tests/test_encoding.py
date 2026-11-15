"""Guard against platform-default text encodings (cp1252 on Windows): every text-mode open()/read_text()/write_text() in web/tools and
web/tests must pass encoding=...  Binary opens (mode contains "b") and PIL's Image.open are exempt."""
import ast
from pathlib import Path

WEB = Path(__file__).resolve().parents[1]


def offenders(path):
    bad = []
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"), filename=str(path))):
        if not isinstance(node, ast.Call):
            continue
        f, kw = node.func, {k.arg for k in node.keywords}
        name = f.id if isinstance(f, ast.Name) else f.attr if isinstance(f, ast.Attribute) else None
        recv = f.value.id if isinstance(f, ast.Attribute) and isinstance(f.value, ast.Name) else None
        if name in ("read_text", "write_text"):
            ok = "encoding" in kw or (name == "read_text" and len(node.args) >= 1) or (name == "write_text" and len(node.args) >= 2)
        elif name == "open" and recv not in ("Image", "webbrowser", "os", "zipfile", "tarfile"):
            mode = node.keywords and next((k.value for k in node.keywords if k.arg == "mode"), None) or (node.args[1] if len(node.args) > 1 else None)
            binary = isinstance(mode, ast.Constant) and isinstance(mode.value, str) and "b" in mode.value
            ok = binary or "encoding" in kw or (name == "open" and recv is None and len(node.args) >= 4)
        else:
            continue
        if not ok:
            bad.append(f"{path.relative_to(WEB)}:{node.lineno}: {name}() without encoding=")
    return bad


def test_every_text_file_access_names_its_encoding():
    files = sorted((WEB / "tools").glob("*.py")) + sorted((WEB / "tests").glob("*.py"))
    assert files
    bad = [b for f in files for b in offenders(f)]
    assert not bad, "\n".join(bad)


def test_the_guard_catches_a_missing_encoding(tmp_path, monkeypatch):
    p = tmp_path / "x.py"
    p.write_text('from pathlib import Path\nopen("a")\nPath("a").read_text()\nPath("a").write_text("x")\nopen("a", "rb")\nopen("a", encoding="utf-8")\nImage.open("a")\n', encoding="utf-8")
    monkeypatch.setattr(__import__(__name__), "WEB", tmp_path, raising=False)
    found = offenders(p)
    assert len(found) == 3, found
