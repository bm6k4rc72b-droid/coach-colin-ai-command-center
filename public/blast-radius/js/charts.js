/**
 * SVG drawing primitives.
 *
 * Hand-built rather than pulled from a charting library, for the same reason
 * the rest of the app has no dependencies: the whole thing has to run from a
 * static directory with no build step and no network. Each function returns a
 * detached element, so a view composes them and appends once.
 *
 * The drawing conventions follow the rest of the Command Center: cyan for
 * live state, amber for attention, one hairline weight, numerals in a
 * monospaced face so they can be compared down a column.
 *
 * @module blast-radius/charts
 */

const NS = 'http://www.w3.org/2000/svg';

/**
 * Create an SVG element with attributes and children.
 *
 * @param {string} tag Element name.
 * @param {Record<string, string|number>} [attrs] Attributes to set.
 * @param {Array<Node|string>} [children] Children to append; strings become text.
 * @returns {SVGElement} The element.
 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null) continue;
    node.setAttribute(key, String(value));
  }
  for (const child of children) {
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

/**
 * Create a root `<svg>` sized by viewBox, scaling to its container.
 *
 * @param {number} width ViewBox width.
 * @param {number} height ViewBox height.
 * @param {string} [className] Class attribute.
 * @returns {SVGElement} The root element.
 */
export function root(width, height, className = 'chart') {
  return el('svg', {
    viewBox: `0 0 ${width} ${height}`,
    class: className,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'img',
  });
}

/**
 * Draw a loss exceedance curve.
 *
 * The y axis is the probability of exceeding the loss on the x axis in a given
 * year. A control is worth its money when it pulls the curve left, and drawing
 * the residual curve over the baseline makes that visible without arithmetic.
 *
 * @param {Array<{loss: number, probability: number}>} baseline Curve before controls.
 * @param {Array<{loss: number, probability: number}>} [residual] Curve after controls.
 * @param {{formatMoney: (value: number) => string, width?: number, height?: number}} options
 *   Formatter and optional dimensions.
 * @returns {SVGElement} The chart.
 */
export function exceedanceChart(baseline, residual, options) {
  const width = options.width ?? 640;
  const height = options.height ?? 260;
  const pad = { left: 54, right: 16, top: 14, bottom: 34 };
  const maxLoss = Math.max(
    baseline[baseline.length - 1]?.loss ?? 1,
    residual?.[residual.length - 1]?.loss ?? 0,
  ) || 1;

  const x = (loss) => pad.left + ((loss / maxLoss) * (width - pad.left - pad.right));
  const y = (probability) => pad.top + ((1 - probability) * (height - pad.top - pad.bottom));
  const svg = root(width, height, 'chart chart--curve');

  for (let step = 0; step <= 4; step += 1) {
    const probability = step / 4;
    svg.append(el('line', {
      x1: pad.left, x2: width - pad.right, y1: y(probability), y2: y(probability), class: 'grid',
    }));
    svg.append(el('text', {
      x: pad.left - 8, y: y(probability) + 4, class: 'axis', 'text-anchor': 'end',
    }, [`${Math.round(probability * 100)}%`]));
  }
  for (let step = 0; step <= 4; step += 1) {
    const loss = (maxLoss * step) / 4;
    svg.append(el('text', {
      x: x(loss), y: height - 12, class: 'axis', 'text-anchor': step === 0 ? 'start' : 'middle',
    }, [options.formatMoney(loss)]));
  }

  const path = (curve) => curve.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.loss).toFixed(1)},${y(point.probability).toFixed(1)}`).join(' ');
  if (residual) {
    svg.append(el('path', { d: path(residual), class: 'curve curve--residual' }));
  }
  svg.append(el('path', { d: path(baseline), class: 'curve curve--baseline' }));
  return svg;
}

/**
 * Draw the detector's operating curve: precision and recall against threshold.
 *
 * @param {Array<{threshold: number, precision: number, recall: number}>} points Sweep output.
 * @param {number} current Currently selected threshold.
 * @returns {SVGElement} The chart.
 */
export function operatingCurve(points, current) {
  const width = 560;
  const height = 220;
  const pad = { left: 44, right: 12, top: 12, bottom: 30 };
  const x = (threshold) => pad.left + (((threshold - 10) / 80) * (width - pad.left - pad.right));
  const y = (value) => pad.top + ((1 - value) * (height - pad.top - pad.bottom));
  const svg = root(width, height, 'chart chart--curve');

  for (let step = 0; step <= 4; step += 1) {
    svg.append(el('line', { x1: pad.left, x2: width - pad.right, y1: y(step / 4), y2: y(step / 4), class: 'grid' }));
    svg.append(el('text', { x: pad.left - 8, y: y(step / 4) + 4, class: 'axis', 'text-anchor': 'end' }, [`${step * 25}%`]));
  }
  for (const threshold of [10, 30, 50, 70, 90]) {
    svg.append(el('text', { x: x(threshold), y: height - 10, class: 'axis', 'text-anchor': 'middle' }, [String(threshold)]));
  }

  const line = (key, className) => el('path', {
    d: points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.threshold).toFixed(1)},${y(point[key]).toFixed(1)}`).join(' '),
    class: className,
  });
  svg.append(line('precision', 'curve curve--precision'));
  svg.append(line('recall', 'curve curve--recall'));
  svg.append(el('line', { x1: x(current), x2: x(current), y1: pad.top, y2: height - pad.bottom, class: 'marker' }));
  return svg;
}

/**
 * Lay out and draw the identity graph.
 *
 * The diagram answers one question — what does this principal reach — so it
 * draws only the edges that participate in that answer. Showing every edge in
 * the estate produces a hairball that looks impressive and communicates
 * nothing; the principals outside the blast radius are still drawn, dimmed and
 * set apart, because "these are the identities it cannot become" is part of the
 * finding.
 *
 * Reachable nodes are placed in columns by hop distance, so the attack reads
 * left to right, and the highlighted route is the cheapest one to crown-jewel
 * data — the one an attacker would actually walk.
 *
 * @param {object} options Drawing inputs.
 * @param {Array<{id: string, name: string, kind: string}>} options.nodes Principals.
 * @param {Array<{from: string, to: string, label: string}>} options.edges Escalation edges.
 * @param {string} options.source Compromised principal id.
 * @param {Set<string>} options.reachable Ids reachable from the source.
 * @param {Array<{from: string, to: string}>} options.path Highlighted path.
 * @returns {SVGElement} The diagram.
 */
export function identityGraph({ nodes, edges, source, reachable, path }) {
  const inRadius = new Set([source, ...reachable]);
  const relevant = edges.filter((edge) => inRadius.has(edge.from) && inRadius.has(edge.to));

  const depth = new Map([[source, 0]]);
  const queue = [source];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const edge of relevant.filter((candidate) => candidate.from === current)) {
      if (depth.has(edge.to)) continue;
      depth.set(edge.to, depth.get(current) + 1);
      queue.push(edge.to);
    }
  }

  const columns = new Map();
  for (const node of nodes) {
    if (!depth.has(node.id)) continue;
    const column = depth.get(node.id);
    if (!columns.has(column)) columns.set(column, []);
    columns.get(column).push(node);
  }
  const outside = nodes.filter((node) => !depth.has(node.id));

  const columnGap = 215;
  const rowHeight = 58;
  const reachedColumns = columns.size;
  const outsideRows = 6;
  const outsideColumns = Math.ceil(outside.length / outsideRows) || 0;
  const tallest = Math.max(1, ...[...columns.values()].map((list) => list.length), Math.min(outside.length, outsideRows));
  const width = 100 + (reachedColumns * columnGap) + (outside.length > 0 ? 80 + (outsideColumns * 165) : 0);
  const height = Math.max(230, (tallest * rowHeight) + 70);
  const svg = root(width, height, 'chart chart--graph');

  svg.append(el('defs', {}, [
    el('marker', {
      id: 'arrow', viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 7, markerHeight: 7, orient: 'auto',
    }, [el('path', { d: 'M0,0 L8,4 L0,8 z', class: 'arrowhead' })]),
    el('marker', {
      id: 'arrow-hot', viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 8, markerHeight: 8, orient: 'auto',
    }, [el('path', { d: 'M0,0 L8,4 L0,8 z', class: 'arrowhead arrowhead--hot' })]),
  ]));

  const middle = 40 + (((tallest - 1) * rowHeight) / 2);
  const position = new Map();
  for (const [column, list] of columns) {
    list.forEach((node, index) => {
      position.set(node.id, {
        x: 100 + (column * columnGap),
        y: middle + ((index - ((list.length - 1) / 2)) * rowHeight),
      });
    });
  }

  const outsideLeft = 100 + (reachedColumns * columnGap) + 40;
  outside.forEach((node, index) => {
    position.set(node.id, {
      x: outsideLeft + (Math.floor(index / outsideRows) * 165) + 68,
      y: 48 + ((index % outsideRows) * rowHeight),
    });
  });

  if (outside.length > 0) {
    svg.append(el('line', {
      x1: outsideLeft - 18, x2: outsideLeft - 18, y1: 24, y2: height - 24, class: 'divider',
    }));
    svg.append(el('text', {
      x: outsideLeft - 8, y: 20, class: 'axis',
    }, ['not reachable']));
  }

  const pathKeys = new Set(path.map((edge) => `${edge.from}→${edge.to}`));
  for (const edge of relevant) {
    const from = position.get(edge.from);
    const to = position.get(edge.to);
    if (!from || !to) continue;
    const hot = pathKeys.has(`${edge.from}→${edge.to}`);
    const curve = `M${from.x + 64},${from.y} C${from.x + 124},${from.y} ${to.x - 124},${to.y} ${to.x - 64},${to.y}`;
    const line = el('path', {
      d: curve,
      class: `edge${hot ? ' edge--hot' : ''}`,
      'marker-end': hot ? 'url(#arrow-hot)' : 'url(#arrow)',
    });
    line.append(el('title', {}, [`${edge.from} → ${edge.to}: ${edge.label}`]));
    svg.append(line);
  }

  for (const node of nodes) {
    const spot = position.get(node.id);
    if (!spot) continue;
    const state = node.id === source ? 'source' : depth.has(node.id) ? 'reached' : 'outside';
    const group = el('g', { class: `node node--${state} node--${node.kind}`, transform: `translate(${spot.x},${spot.y})` });
    group.append(el('rect', { x: -64, y: -15, width: 128, height: 30, rx: 3, class: 'node-box' }));
    group.append(el('text', { x: 0, y: 4, class: 'node-label', 'text-anchor': 'middle' }, [truncate(node.name, 19)]));
    group.append(el('title', {}, [`${node.name} (${node.kind})`]));
    svg.append(group);
  }
  return svg;
}

/**
 * Draw the alert timeline for the telemetry window.
 *
 * @param {Array<{ts: number, severity: string, rule: string, name: string, events: object[]}>} alerts Alerts.
 * @param {number} start Window start.
 * @param {number} end Window end.
 * @returns {SVGElement} The timeline.
 */
export function alertTimeline(alerts, start, end) {
  const width = 680;
  const height = 92;
  const pad = 24;
  const x = (ts) => pad + (((ts - start) / (end - start)) * (width - (pad * 2)));
  const svg = root(width, height, 'chart chart--timeline');

  svg.append(el('line', { x1: pad, x2: width - pad, y1: 52, y2: 52, class: 'grid' }));
  for (let day = 0; day <= 14; day += 2) {
    const ts = start + (day * 86_400_000);
    svg.append(el('line', { x1: x(ts), x2: x(ts), y1: 48, y2: 56, class: 'grid' }));
    svg.append(el('text', { x: x(ts), y: 74, class: 'axis', 'text-anchor': 'middle' }, [`day ${day}`]));
  }

  for (const alert of alerts) {
    const truePositive = alert.events.some((event) => event.attack);
    const group = el('g', { class: `pip pip--${alert.severity} ${truePositive ? 'pip--attack' : 'pip--noise'}` });
    group.append(el('line', { x1: x(alert.ts), x2: x(alert.ts), y1: truePositive ? 18 : 40, y2: 52, class: 'pip-stem' }));
    group.append(el('circle', { cx: x(alert.ts), cy: truePositive ? 18 : 40, r: truePositive ? 5 : 3.5, class: 'pip-dot' }));
    group.append(el('title', {}, [`${new Date(alert.ts).toISOString().slice(0, 16).replace('T', ' ')} — ${alert.name} (${truePositive ? 'true positive' : 'false positive'})`]));
    svg.append(group);
  }
  return svg;
}

/**
 * Truncate a label to fit inside a node box.
 *
 * @param {string} text Label.
 * @param {number} limit Maximum characters.
 * @returns {string} Possibly shortened label.
 */
function truncate(text, limit) {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

/**
 * Draw a horizontal meter for a 0–100 score.
 *
 * @param {number} value Score.
 * @param {string} [tone] Visual tone: `hot`, `warm` or `cool`.
 * @returns {SVGElement} The meter.
 */
export function meter(value, tone = 'hot') {
  const svg = root(200, 8, 'chart chart--meter');
  svg.append(el('rect', { x: 0, y: 2, width: 200, height: 4, rx: 2, class: 'meter-track' }));
  svg.append(el('rect', {
    x: 0, y: 1, width: Math.max(2, (value / 100) * 200), height: 6, rx: 2, class: `meter-fill meter-fill--${tone}`,
  }));
  return svg;
}
