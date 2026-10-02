export const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el as T;
};

export const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Set text only when it changed (avoids layout churn). */
export function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export function setHTML(el: Element, html: string): void {
  if ((el as HTMLElement).dataset.html !== html) {
    (el as HTMLElement).dataset.html = html;
    el.innerHTML = html;
  }
}

/** Bind press-and-hold behaviour (mouse + touch) to a button. */
export function bindHold(btn: HTMLElement, onDown: () => void, onUp: () => void): void {
  const down = (e: PointerEvent) => {
    e.preventDefault();
    btn.setPointerCapture?.(e.pointerId);
    btn.classList.add('held');
    onDown();
  };
  const up = () => {
    if (!btn.classList.contains('held')) return;
    btn.classList.remove('held');
    onUp();
  };
  btn.addEventListener('pointerdown', down);
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointercancel', up);
  btn.addEventListener('lostpointercapture', up);
}
