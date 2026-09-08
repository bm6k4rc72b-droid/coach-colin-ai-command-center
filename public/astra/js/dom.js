/**
 * Tiny DOM helpers.
 *
 * ASTRA builds its panels in JavaScript rather than shipping a framework, so
 * this is the whole rendering layer: an element factory that never inserts
 * markup it was given as text, a child replacer, and a few formatters the
 * decks share.
 *
 * @module astra/dom
 */

/**
 * Create an element.
 *
 * Children given as strings become text nodes, never markup, so nothing a
 * user pastes — a social-media claim, a study abstract — can inject HTML.
 *
 * @param {string} tag Tag name, optionally with `.class` suffixes (`div.card.wide`).
 * @param {object} [props] Attributes; `class`, `text`, `html`, `on*` handlers and `style` objects are understood.
 * @param {Array<Node|string>} [children] Child nodes or text.
 * @returns {HTMLElement} The element.
 */
export function el(tag, props = {}, children = []) {
  const [name, ...classes] = tag.split('.');
  const node = document.createElement(name || 'div');
  if (classes.length) node.className = classes.join(' ');
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = `${node.className} ${value}`.trim();
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'html') node.innerHTML = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/**
 * Replace an element's children.
 *
 * @param {HTMLElement} node Target.
 * @param {Array<Node|string>} children New children.
 * @returns {HTMLElement} The target.
 */
export function fill(node, children) {
  node.replaceChildren(...[].concat(children).filter((c) => c !== null && c !== undefined && c !== false)
    .map((c) => (c instanceof Node ? c : document.createTextNode(String(c)))));
  return node;
}

/**
 * Render text with `**bold**`, `` `code` `` and paragraph breaks, without ever
 * inserting raw HTML from the source string.
 *
 * @param {string} text Source text.
 * @returns {DocumentFragment} Rendered fragment.
 */
export function richText(text) {
  const fragment = document.createDocumentFragment();
  for (const paragraph of String(text).split(/\n{2,}/)) {
    const p = el('p');
    for (const part of paragraph.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)) {
      if (/^\*\*[^*]+\*\*$/.test(part)) p.append(el('strong', { text: part.slice(2, -2) }));
      else if (/^`[^`]+`$/.test(part)) p.append(el('code', { text: part.slice(1, -1) }));
      else if (part) {
        part.split('\n').forEach((line, i) => {
          if (i) p.append(el('br'));
          p.append(document.createTextNode(line));
        });
      }
    }
    fragment.append(p);
  }
  return fragment;
}

/**
 * Relative time, in words.
 *
 * @param {number} timestamp Epoch milliseconds.
 * @returns {string} e.g. "4 min ago".
 */
export function ago(timestamp) {
  if (!timestamp) return '—';
  const delta = Date.now() - timestamp;
  const future = delta < 0;
  const abs = Math.abs(delta);
  for (const [ms, label] of [[86400000, 'd'], [3600000, 'h'], [60000, 'min'], [1000, 's']]) {
    if (abs >= ms) {
      const n = Math.round(abs / ms);
      return future ? `in ${n} ${label}` : `${n} ${label} ago`;
    }
  }
  return 'now';
}

/**
 * Clamp a fraction into [0, 1] and render it as a percentage.
 *
 * @param {number} value Fraction.
 * @returns {string} e.g. "62%".
 */
export function pct(value) {
  return `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
}

/**
 * Copy text to the clipboard, falling back to a hidden textarea where the
 * async clipboard API is unavailable or blocked.
 *
 * @param {string} text What to copy.
 * @returns {Promise<boolean>} Whether the copy appeared to succeed.
 */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = el('textarea', { style: { position: 'fixed', opacity: '0' } });
      area.value = text;
      document.body.append(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * Offer a generated file as a download.
 *
 * @param {string} filename Suggested name.
 * @param {string} text File contents.
 * @param {string} [type] MIME type.
 */
export function download(filename, text, type = 'text/markdown') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = el('a', { href: url, download: filename });
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
