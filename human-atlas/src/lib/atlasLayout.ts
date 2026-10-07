// Specimen-sheet layout, shared by scripts/build-anatomy.ts (full atlas) and the
// app (per-region sheets). Pure maths, no three.js, so it runs in Node too.
//
// Pieces are shelf-packed into catalogued rows facing the viewer: the largest
// structures sit in the top rows with generous gutters; as size falls the rows
// get shorter and the gutters tighter, so small parts end up densely packed
// toward the bottom of the sheet.

export interface LayoutItem {
  id: string;
  /** Width (x) and height (y) of the piece as seen from the front. */
  w: number;
  h: number;
  /** Secondary sort key inside a row (keeps a catalogue order, e.g. system). */
  group: number;
  name: string;
}

export interface LayoutResult {
  positions: Map<string, [number, number]>;
  width: number;
  height: number;
}

export interface LayoutOptions {
  /** Target width / height ratio of the finished sheet. */
  aspect?: number;
  /** Gutter as a fraction of a piece's largest dimension. */
  gutter?: number;
  /** Minimum gutter in metres. */
  minGutter?: number;
}

export function layoutSheet(items: LayoutItem[], opts: LayoutOptions = {}): LayoutResult {
  const aspect = opts.aspect ?? 2.2;
  const gutterK = opts.gutter ?? 0.22;
  const minGutter = opts.minGutter ?? 0.012;
  const positions = new Map<string, [number, number]>();
  if (items.length === 0) return { positions, width: 0, height: 0 };

  const pad = (it: LayoutItem) => Math.max(minGutter, gutterK * Math.max(it.w, it.h));
  const sorted = [...items].sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h));

  let area = 0;
  for (const it of sorted) area += (it.w + pad(it)) * (it.h + pad(it));
  const sheetW = Math.max(Math.sqrt(area * aspect), Math.max(...sorted.map((i) => i.w + pad(i))));

  // Fill rows greedily, biggest first.
  const rows: LayoutItem[][] = [];
  let row: LayoutItem[] = [];
  let rowW = 0;
  for (const it of sorted) {
    const cw = it.w + pad(it);
    if (row.length && rowW + cw > sheetW) {
      rows.push(row);
      row = [];
      rowW = 0;
    }
    row.push(it);
    rowW += cw;
  }
  if (row.length) rows.push(row);

  // Place rows top-down; each row centred and catalogued by group then name.
  let y = 0;
  let maxW = 0;
  for (const r of rows) {
    r.sort((a, b) => a.group - b.group || a.name.localeCompare(b.name));
    const rowH = Math.max(...r.map((i) => i.h + pad(i)));
    const total = r.reduce((s, i) => s + i.w + pad(i), 0);
    maxW = Math.max(maxW, total);
    let x = -total / 2;
    for (const it of r) {
      const cw = it.w + pad(it);
      positions.set(it.id, [x + cw / 2, y - rowH / 2]);
      x += cw;
    }
    y -= rowH;
  }
  const height = -y;
  // Re-centre vertically so the sheet's middle sits at 0.
  for (const p of positions.values()) p[1] += height / 2;
  return { positions, width: maxW, height };
}
