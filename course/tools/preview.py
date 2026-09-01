import sys, pymupdf, pathlib
pdf = sys.argv[1]; pages = [int(x) for x in sys.argv[2].split(",")]
out = pathlib.Path(sys.argv[3] if len(sys.argv)>3 else ".build/preview"); out.mkdir(parents=True, exist_ok=True)
d = pymupdf.open(pdf)
print("pages:", d.page_count)
for p in pages:
    pg = d[p-1]
    pg.get_pixmap(dpi=110).save(out / f"p{p:03d}.png")
    print("wrote", out / f"p{p:03d}.png")
