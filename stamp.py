#!/usr/bin/env python3
"""Stamp game.css/game.js with a content hash so a cached script can never run
against newer markup. Run after editing either file, before committing."""
import hashlib, pathlib, re
root = pathlib.Path(__file__).parent
ver = hashlib.sha1((root.joinpath("game.js").read_text()
                  + root.joinpath("game.css").read_text()).encode()).hexdigest()[:8]
p = root / "index.html"; s = p.read_text()
s = re.sub(r'href="game\.css(\?v=[0-9a-f]+)?"', f'href="game.css?v={ver}"', s)
s = re.sub(r'src="game\.js(\?v=[0-9a-f]+)?"',  f'src="game.js?v={ver}"',  s)
p.write_text(s); print("stamped v=" + ver)
