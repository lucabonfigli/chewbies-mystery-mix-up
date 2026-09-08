#!/usr/bin/env python3
"""Inline every asset as a data URI and emit a single self-contained HTML file."""
import base64, json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC  = ROOT / "legacy" / "src" / "index.html"
ASS  = ROOT / "legacy" / "assets"
OUT  = ROOT / "legacy" / "deck-build.html"   # superseded by the Sep-08 asset drop

assets = {}
for p in sorted(ASS.glob("*.webp")):
    assets[p.stem] = "data:image/webp;base64," + base64.b64encode(p.read_bytes()).decode()

discs = json.loads((ROOT / "legacy" / "src" / "discs.json").read_text())

html = SRC.read_text()
html = html.replace("__ASSETS__", json.dumps(assets))
html = html.replace("__DISCS__", json.dumps(discs, separators=(",", ":")))

OUT.write_text(html)
print(f"{OUT}  {OUT.stat().st_size/1024/1024:.2f} MB  ({len(assets)} assets inlined)")
