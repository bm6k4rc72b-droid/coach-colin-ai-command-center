#!/usr/bin/env python3
"""Regenerate course/assets/fonts.css and course/assets/katex.css.

Both are checked in so the book builds with no network access.  Run this only
to refresh them: it downloads the webfonts from Google Fonts and KaTeX from the
npm registry, then inlines every font file as a base64 data URI.
"""

import base64, json, pathlib, re, shutil, subprocess, sys, tarfile, tempfile

ASSETS = pathlib.Path(__file__).resolve().parent.parent / "assets"
UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

FAMILIES = [
    "Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,600;"
    "0,9..144,700;1,9..144,400",
    "Spectral:ital,wght@0,300;0,400;0,600;0,700;1,300;1,400",
    "Inter:wght@400;500;600;700",
    "JetBrains+Mono:wght@400;600",
]


def get(url):
    return subprocess.run(["curl", "-sS", "-A", UA, "--max-time", "90", url],
                          capture_output=True, check=True).stdout


def build_fonts():
    faces = []
    for spec in FAMILIES:
        css = get(f"https://fonts.googleapis.com/css2?family={spec}&display=swap").decode()
        for subset, block in re.findall(
                r"/\*\s*([a-z\-]+)\s*\*/\s*(@font-face\s*\{.*?\})", css, re.S):
            if subset not in ("latin", "latin-ext"):
                continue
            m = re.search(r"url\((https://[^)]+\.woff2)\)", block)
            if not m:
                continue
            b64 = base64.b64encode(get(m.group(1))).decode()
            faces.append(block.replace(
                m.group(0), f"url(data:font/woff2;base64,{b64}) format('woff2')"))
    out = "\n".join(faces)
    (ASSETS / "fonts.css").write_text(out)
    print(f"fonts.css: {len(faces)} faces, {len(out)/1024:.0f} KB")


def build_katex():
    meta = json.loads(get("https://registry.npmjs.org/katex"))
    version = meta["dist-tags"]["latest"]
    tarball = meta["versions"][version]["dist"]["tarball"]
    with tempfile.TemporaryDirectory() as tmp:
        tmp = pathlib.Path(tmp)
        (tmp / "katex.tgz").write_bytes(get(tarball))
        with tarfile.open(tmp / "katex.tgz") as tf:
            tf.extractall(tmp)
        dist = tmp / "package" / "dist"
        css = (dist / "katex.min.css").read_text()

        def inline(m):
            path = dist / m.group(1)
            if not m.group(1).endswith(".woff2") or not path.exists():
                return "url(about:blank)"
            return ("url(data:font/woff2;base64,"
                    + base64.b64encode(path.read_bytes()).decode() + ")")

        css = re.sub(r"url\((fonts/[^)]+)\)", inline, css)
        css = (css.replace(',url(about:blank) format("woff")', "")
                  .replace(',url(about:blank) format("truetype")', ""))
        (ASSETS / "katex.css").write_text(css)
        shutil.copy(dist / "katex.min.js", ASSETS / "katex.js")
    print(f"katex.css: v{version}, {len(css)/1024:.0f} KB")


if __name__ == "__main__":
    ASSETS.mkdir(exist_ok=True)
    build_fonts()
    build_katex()
