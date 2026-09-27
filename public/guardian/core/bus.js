// Tiny event bus. Tools report what happened ("arachnoid:cut", "ooze:stopped",
// "clip:applied"…); the stage system, vitals and debrief listen.
const target = new EventTarget();
export const bus = {
  emit(type, detail = {}) { target.dispatchEvent(new CustomEvent(type, { detail })); target.dispatchEvent(new CustomEvent('*', { detail: { type, ...detail } })); },
  on(type, fn) { const h = (e) => fn(e.detail); target.addEventListener(type, h); return () => target.removeEventListener(type, h); },
};
