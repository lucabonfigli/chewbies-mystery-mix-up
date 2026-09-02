#!/usr/bin/env python3
"""Inline every asset as a data URI and emit a single self-contained HTML file."""
import base64, json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC  = ROOT / "src" / "index.html"
ASS  = ROOT / "assets"
OUT  = ROOT / "index.html"          # served directly by GitHub Pages

assets = {}
for p in sorted(ASS.glob("*.webp")):
    assets[p.stem] = "data:image/webp;base64," + base64.b64encode(p.read_bytes()).decode()

discs = json.loads((ROOT / "src" / "discs.json").read_text())

html = SRC.read_text()
html = html.replace("__ASSETS__", json.dumps(assets))
html = html.replace("__DISCS__", json.dumps(discs, separators=(",", ":")))

OUT.write_text(html)
print(f"{OUT}  {OUT.stat().st_size/1024/1024:.2f} MB  ({len(assets)} assets inlined)")
