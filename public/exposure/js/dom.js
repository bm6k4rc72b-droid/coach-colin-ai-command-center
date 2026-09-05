/**
 * DOM helpers.
 *
 * The desk ships no framework, so this is the rendering layer: an element
 * factory that never interprets a string as markup, a child-replacing helper,
 * and the handful of formatters a dense table needs.
 *
 * @module exposure/dom
 */

/**
 * Create an element.
 *
 * Strings become text nodes, always — nothing a provider or a user supplies
 * can become markup by accident.
 *
 * @param {string} tag Tag name with optional `.class` suffixes (`div.row.tight`).
 * @param {object} [props] Attributes; `class`, `text`, `on*` handlers and `style` objects are understood.
 * @param {Array<Node|string>|Node|string} [children] Children.
 * @returns {HTMLElement} The element.
 */
export function el(tag, props = {}, children = []) {
  const [name, ...classes] = String(tag).split('.');
  const node = document.createElement(name || 'div');
  if (classes.length) node.className = classes.join(' ');
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = `${node.className} ${value}`.trim();
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false || child === '') continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/**
 * Replace an element's children.
 *
 * @param {HTMLElement} node Target.
 * @param {Array<Node|string>|Node|string} children New children.
 * @returns {HTMLElement} The target.
 */
export function fill(node, children) {
  node.replaceChildren(...[].concat(children)
    .filter((c) => c !== null && c !== undefined && c !== false && c !== '')
    .map((c) => (c instanceof Node ? c : document.createTextNode(String(c)))));
  return node;
}

/**
 * Format a number to a fixed number of decimals, without a trailing `.0`.
 *
 * @param {number} value Value.
 * @param {number} [places] Decimal places.
 * @returns {string} Formatted number.
 */
export function num(value, places = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const rounded = Number(value).toFixed(places);
  return rounded.replace(/\.0+$/, '');
}

/**
 * Format a fraction as a percentage.
 *
 * @param {number} value Fraction in [0, 1].
 * @returns {string} e.g. `27%`.
 */
export function percent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${Math.round(value * 100)}%`;
}

/**
 * Format a signed number, keeping the plus sign a board would show.
 *
 * @param {number} value Value.
 * @param {number} [places] Decimal places.
 * @returns {string} e.g. `+3.5`, `-7`.
 */
export function signed(value, places = 1) {
  const text = num(Math.abs(value), places);
  return `${value >= 0 ? '+' : '-'}${text}`;
}
