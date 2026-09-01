#!/usr/bin/env python3
"""Build THE AI ENGINEER — assembles HTML partials, typesets with headless
Chromium, resolves the table of contents against real page numbers, and
merges cover + body into a single bookmarked PDF."""

import html as _html
import json, os, re, subprocess, sys, tempfile, pathlib

ROOT   = pathlib.Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
CONTENT= ROOT / "content"
DIST   = ROOT / "dist"
BUILD  = ROOT / ".build"
OUT    = DIST / "The-AI-Engineer.pdf"

MM = 1 / 25.4
PAPER_W, PAPER_H = 170 * MM, 240 * MM

BODY_MARGINS = dict(marginTop=20 * MM, marginBottom=22 * MM,
                    marginLeft=26 * MM, marginRight=26 * MM)
FRONT_MARGINS = dict(marginTop=22 * MM, marginBottom=20 * MM,
                     marginLeft=26 * MM, marginRight=26 * MM)
ZERO_MARGINS = dict(marginTop=0, marginBottom=0, marginLeft=0, marginRight=0)

FRONT_FILES = ["colophon.html", "provenance.html", "howto.html", "map.html"]
BODY_FILES  = [
    "intro.html",
    "part1.html", "m01.html", "m02.html", "m03.html",
    "part2.html", "m04.html", "m05.html", "m06.html", "m07.html",
    "part3.html", "m08.html", "m09.html", "m10.html", "m11.html",
    "part4.html", "m12.html", "m13.html", "m14.html", "m15.html",
    "capstone.html",
    "apx-schedule.html", "apx-equations.html", "apx-toolchain.html",
    "apx-sources.html", "apx-glossary.html", "apx-exams.html",
    "apx-final.html", "apx-answers.html", "record.html", "finis.html",
]

# ---------------------------------------------------------------- html shell
def head(extra_css=""):
    fonts = (ASSETS / "fonts.css").read_text()
    katex = (ASSETS / "katex.css").read_text()
    book  = (ASSETS / "book.css").read_text()
    kjs   = (ASSETS / "katex.js").read_text()
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>The AI Engineer</title>
<style>{fonts}</style>
<style>{katex}</style>
<style>{book}</style>
<style>{extra_css}</style>
<script>{kjs}</script>
<script>
window.__MATH_ERRORS__ = [];
function typeset() {{
  var n = 0;
  document.querySelectorAll('.m, .md').forEach(function (el) {{
    var tex = el.textContent;
    try {{
      katex.render(tex, el, {{
        displayMode: el.classList.contains('md'),
        throwOnError: true, strict: false,
        macros: {{"\\\\argmin":"\\\\operatorname*{{arg\\\\,min}}",
                 "\\\\argmax":"\\\\operatorname*{{arg\\\\,max}}",
                 "\\\\E":"\\\\mathbb{{E}}", "\\\\R":"\\\\mathbb{{R}}",
                 "\\\\KL":"\\\\mathrm{{KL}}", "\\\\d":"\\\\mathrm{{d}}",
                 "\\\\softmax":"\\\\operatorname{{softmax}}",
                 "\\\\T":"^{{\\\\mathsf{{T}}}}"}}
      }});
      n++;
    }} catch (e) {{
      window.__MATH_ERRORS__.push(tex.slice(0, 70) + ' :: ' + e.message);
      el.textContent = tex;
    }}
  }});
  window.__MATH_COUNT__ = n;
  window.__BOOK_READY__ = true;
}}
if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', typeset);
else typeset();
</script>
</head><body>"""


TOC_RE = re.compile(r'(<[a-z0-9]+\b[^>]*\bdata-toc="[^"]*"[^>]*>)', re.I)

def attrs(tag):
    return dict(re.findall(r'([a-z\-]+)="([^"]*)"', tag))

def collect(files):
    """Concatenate partials, inject page anchors, and harvest TOC entries."""
    html, entries = [], []
    for f in files:
        src = (CONTENT / f).read_text()
        def inject(m):
            tag = m.group(1)
            a = attrs(tag)
            aid = a.get("id")
            if not aid:
                return tag
            entries.append(dict(kind=a["data-toc"], id=aid,
                                n=a.get("data-toc-n", ""),
                                title=a.get("data-toc-title", ""),
                                label=_html.unescape(a.get("data-toc-title", ""))))
            cls = "mark dark" if a["data-toc"] == "part" else "mark"
            return tag + f'<span class="{cls}">@@{aid}@@</span>'
        html.append(TOC_RE.sub(inject, src))
    return "\n".join(html), entries


def footer_template(font_face):
    return f"""<style>
{font_face}
*{{box-sizing:border-box}}
#f{{width:100%;font-family:'Fraunces',Georgia,serif;font-size:8pt;color:#6E7382;
   display:flex;align-items:center;justify-content:center;gap:4mm;
   padding:0 26mm;margin-top:9mm;-webkit-print-color-adjust:exact}}
.r{{flex:1;height:0;border-top:.4pt solid #D8D3C6;max-width:16mm}}
.n{{font-variant-numeric:lining-num;letter-spacing:.1em}}
</style>
<div id="f"><span class="r"></span><span class="n pageNumber"></span><span class="r"></span></div>"""


def render(html_path, pdf_path, margins, footer=None):
    opts = dict(paperWidth=PAPER_W, paperHeight=PAPER_H, **margins)
    if footer:
        opts.update(displayHeaderFooter=True, footerTemplate=footer,
                    headerTemplate='<span style="display:none"></span>')
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as t:
        json.dump(opts, t); optf = t.name
    subprocess.run(["node", str(ROOT / "tools" / "print.mjs"),
                    str(html_path), str(pdf_path), optf], check=True)
    os.unlink(optf)


def page_index(pdf_path):
    from pypdf import PdfReader
    idx = {}
    r = PdfReader(str(pdf_path))
    for i, page in enumerate(r.pages, start=1):
        for aid in re.findall(r"@@([A-Za-z0-9\-]+)@@", page.extract_text() or ""):
            idx.setdefault(aid, i)
    return idx, len(r.pages)


def build_toc(entries, folios):
    rows = ['<section class="fm"><h1>Contents</h1><div class="toc">']
    for e in entries:
        p = folios.get(e["id"], "")
        if e["kind"] == "part":
            rows.append(f'<div class="part-row">{e["title"]}</div>')
        elif e["kind"] == "module":
            rows.append(
                f'<div class="row"><span class="n">{e["n"]}</span>'
                f'<span class="t">{e["title"]}</span>'
                f'<span class="dots"></span><span class="p">{p}</span></div>')
        else:
            rows.append(
                f'<div class="row sub"><span class="n">·</span>'
                f'<span class="t">{e["title"]}</span>'
                f'<span class="dots"></span><span class="p">{p}</span></div>')
    rows.append("</div></section>")
    return "\n".join(rows)


PAPER_RGB = (0xFB / 255, 0xFA / 255, 0xF7 / 255)


def paint_paper(path):
    """Chromium does not paint the root background into the print margin box,
    so the sheet is laid onto its paper colour after the fact — underneath
    every page's existing content, which leaves dark plates untouched."""
    try:
        import pymupdf
    except ImportError:
        print("  note: pymupdf not installed — page margins will print white")
        return
    doc = pymupdf.open(str(path))
    for page in doc:
        page.draw_rect(page.rect, color=None, fill=PAPER_RGB,
                       overlay=False, width=0)
    doc.save(str(path), incremental=True, encryption=pymupdf.PDF_ENCRYPT_KEEP)
    doc.close()


def main():
    BUILD.mkdir(exist_ok=True); DIST.mkdir(exist_ok=True)

    # -- one Fraunces face for the folio template ---------------------------
    fonts = (ASSETS / "fonts.css").read_text()
    face = ""
    for blk in re.findall(r"@font-face\s*\{[^}]*\}", fonts):
        if "'Fraunces'" in blk and "font-style: normal" in blk and "font-weight: 400" in blk:
            face = blk; break
    footer = footer_template(face)

    # -- pass 1: body -------------------------------------------------------
    body_html, entries = collect(BODY_FILES)
    p1 = BUILD / "body.html"
    p1.write_text(head() + body_html + "</body></html>")
    render(p1, BUILD / "body.pdf", BODY_MARGINS, footer)
    folios, npages = page_index(BUILD / "body.pdf")
    missing = [e["id"] for e in entries if e["id"] not in folios]
    print(f"  body: {npages} pages, {len(folios)}/{len(entries)} anchors resolved")
    if missing:
        print("  !! unresolved:", ", ".join(missing))

    # -- pass 2: front matter (cover + prelims + resolved TOC) --------------
    cover = (CONTENT / "cover.html").read_text()
    pcov = BUILD / "cover.html"
    pcov.write_text(head("html,body{margin:0;background:#0E1626}") + cover + "</body></html>")
    render(pcov, BUILD / "cover.pdf", ZERO_MARGINS)

    front_html, _ = collect(FRONT_FILES)
    front_html += build_toc(entries, folios)
    pfr = BUILD / "front.html"
    pfr.write_text(head() + front_html + "</body></html>")
    render(pfr, BUILD / "front.pdf", FRONT_MARGINS)

    # -- merge --------------------------------------------------------------
    from pypdf import PdfWriter, PdfReader
    w = PdfWriter()
    counts = []
    for part in ("cover.pdf", "front.pdf", "body.pdf"):
        r = PdfReader(str(BUILD / part))
        counts.append(len(r.pages))
        for pg in r.pages:
            w.add_page(pg)
    offset = counts[0] + counts[1]

    top = None
    for e in entries:
        if e["id"] not in folios:
            continue
        pg = offset + folios[e["id"]] - 1
        text = e.get("label") or e["title"]
        label = text if e["kind"] == "part" else (
            f'{e["n"]} · {text}' if e["n"] else text)
        if e["kind"] == "part":
            top = w.add_outline_item(label, pg)
        else:
            w.add_outline_item(label, pg, parent=top)

    w.add_metadata({
        "/Title": "The AI Engineer — A Complete Course in Artificial Intelligence",
        "/Author": "Coach Colin AI Command Center",
        "/Subject": "A fifteen-module AI engineering curriculum synthesised from the "
                    "public course materials of Harvard, Stanford and NVIDIA.",
        "/Keywords": "artificial intelligence, machine learning, deep learning, "
                     "transformers, LLM, CUDA, RAG, MLOps, curriculum",
        "/Creator": "chromium + katex",
    })
    w.page_layout = "/SinglePage"
    w.page_mode = "/UseOutlines"
    with open(OUT, "wb") as fh:
        w.write(fh)

    paint_paper(OUT)

    total = sum(counts)
    size = OUT.stat().st_size / 1024 / 1024
    print(f"\n  {OUT}  —  {total} pages, {size:.1f} MB "
          f"(cover {counts[0]}, front {counts[1]}, body {counts[2]})")


if __name__ == "__main__":
    main()
