/**
 * RANCH COMMAND — tiny DOM helpers. Text is always set as text, never as
 * markup, so nothing a camera, a radio or a broker sends can inject HTML.
 *
 * @module ranch-command/dom
 */

/**
 * @param {string} tag `div.class.other`.
 * @param {object} [props] Attributes, `text`, `on*` handlers, `style` object (custom properties allowed).
 * @param {Array<Node|string|null|false>|Node|string} [children] Children.
 * @returns {HTMLElement} The element.
 */
export function el(tag, props = {}, children = []) {
  const [name, ...classes] = tag.split('.');
  const node = document.createElement(name || 'div');
  if (classes.length) node.className = classes.join(' ');
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'text') node.textContent = String(value);
    else if (key === 'class') node.className = `${node.className} ${value}`.trim();
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'style' && typeof value === 'object') {
      for (const [p, v] of Object.entries(value)) {
        if (p.startsWith('--')) node.style.setProperty(p, v);
        else node.style[p] = v;
      }
    } else if (key in node && typeof value !== 'string') node[key] = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/**
 * Replace a node's children.
 *
 * @param {Node} node Target.
 * @param {Array<Node|string|null|false>} children New children.
 * @returns {Node} The node.
 */
export function fill(node, children) {
  node.replaceChildren(...[].concat(children).filter((c) => c !== null && c !== undefined && c !== false).map((c) => (c instanceof Node ? c : document.createTextNode(String(c)))));
  return node;
}

/**
 * "3 min ago".
 *
 * @param {number} ms Epoch ms.
 * @returns {string} Relative time.
 */
export function ago(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
