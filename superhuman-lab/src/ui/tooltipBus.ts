// The tooltip follows the cursor by writing straight to its DOM node, so
// pointer moves never cause a React render.

let node: HTMLElement | null = null;
let x = 0;
let y = 0;

export const tooltip = {
  bind(el: HTMLElement | null) {
    node = el;
    if (node) place();
  },
  move(cx: number, cy: number) {
    x = cx;
    y = cy;
    place();
  },
};

function place() {
  if (!node) return;
  const w = node.offsetWidth;
  const h = node.offsetHeight;
  let left = x + 16;
  let top = y + 18;
  if (left + w > window.innerWidth - 12) left = x - w - 16;
  if (top + h > window.innerHeight - 12) top = y - h - 14;
  node.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
}
