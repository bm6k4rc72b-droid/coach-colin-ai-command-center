# The AI Engineer

A fifteen-module course in artificial intelligence, typeset as a
148-page book: **[`dist/The-AI-Engineer.pdf`](dist/The-AI-Engineer.pdf)**.

The curriculum is an independent synthesis of the public course materials of
Harvard, Stanford and NVIDIA. It is not published by, endorsed by, or
affiliated with any of them — see *A Note on Provenance* in the front matter.

## What is in it

| Part | Modules |
| --- | --- |
| I · Foundations | Mathematics · Search and logic · Reasoning under uncertainty |
| II · Learning | Supervised · Unsupervised · Deep learning · Vision and sequences |
| III · Frontier systems | Transformers · Training at scale · Alignment · Generative models |
| IV · The engineering discipline | Retrieval and agents · Inference and serving · Production · Governance |

Every module carries learning outcomes, theory with worked derivations, a
hands-on **Bench** lab with a machine-checkable acceptance criterion, a
four-row rubric, self-check questions and a reading list. The book closes with
a six-week capstone brief and five appendices — a twenty-six week plan, an
equation reference card, a toolchain, the source curricula, and a glossary.

## Building it

```
python3 build.py          # → dist/The-AI-Engineer.pdf
```

Requirements: Node 22+, Python 3.11+, `pypdf`, and Chromium at the path in
`tools/print.mjs`. `pymupdf` is optional but recommended — without it the
printed page margins fall back to white instead of the book's paper colour.
No network access is needed; the fonts and maths fonts are checked in.

### How the build works

1. `content/*.html` are plain HTML fragments. Elements carrying `data-toc`
   become table-of-contents entries and bookmarks.
2. `build.py` concatenates them, injects the stylesheet and KaTeX, and inserts
   an invisible anchor beside every `data-toc` element.
3. `tools/print.mjs` drives headless Chromium over the DevTools protocol and
   prints to a 170 × 240 mm page with a typeset folio in the footer.
4. The body PDF is re-read to find which page each anchor landed on; those are
   the real folios, so the contents page is generated and printed afterwards.
5. Cover, front matter and body are merged, bookmarked, given metadata, and
   laid onto the paper colour.

### Assets

`assets/fonts.css` and `assets/katex.css` are generated — every font file is
inlined as a base64 data URI so the build is offline and deterministic.
Regenerate them with `tools/fetch-assets.py` (this needs network access).

| File | Contents |
| --- | --- |
| `assets/book.css` | The page design: trim size, part plates, module openers, callouts, lab panels, rubric tables, figures |
| `assets/fonts.css` | Fraunces, Spectral, Inter, JetBrains Mono — Latin subsets, embedded |
| `assets/katex.css`, `assets/katex.js` | KaTeX with its fonts embedded |

### Editing

Add or reorder modules by editing `BODY_FILES` in `build.py`. Mathematics is
written as `<span class="m">…</span>` inline and `<span class="md">…</span>`
for display; both are rendered by KaTeX at build time, and the build reports
any expression that failed to parse.
