export const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document): T => {
  const el = root.querySelector(sel);
  if (!el) throw new Error(`${sel} missing`);
  return el as T;
};

export const pct = (x: number) => `${Math.round(x * 100)}%`;
