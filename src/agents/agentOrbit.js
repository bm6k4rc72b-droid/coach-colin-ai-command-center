/**
 * Orbital view — the live picture of the swarm.
 *
 * A glowing core (the orchestrator) with the roster in orbit around it, and
 * labeled packets travelling the spokes as work moves: outbound when a task is
 * dispatched, inbound when it returns. It is a status display, not decoration —
 * node ring colour is task state, and the packet label is the actual task title
 * or tool name, so a glance answers "what is this thing doing right now".
 *
 * Rendered on a 2D canvas with a render loop that PARKS ITSELF when the swarm
 * is idle. This app already runs a Cesium globe; a decorative animation
 * spinning at 60fps behind it would tax the same frame budget the globe needs,
 * so the loop stops once nothing is moving and restarts on the next event.
 */

const TAU = Math.PI * 2;

/** Node ring colours by task state. */
const STATE_COLORS = {
  idle: 'rgba(150, 170, 190, 0.45)',
  running: '#7bffcf',
  done: '#8fd7ff',
  failed: '#ff5f6d',
  blocked: '#ffb454',
};

/**
 * Mount the orbital view on a canvas.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {object} [options]
 * @returns {{setRoster: Function, applyEvent: Function, reset: Function, destroy: Function}}
 */
export function createAgentOrbit(canvas, { reducedMotion = false } = {}) {
  const ctx = canvas.getContext('2d');
  let nodes = [];
  let packets = [];
  let coreEnergy = 0;
  let running = false;
  let frame = 0;
  let lastTime = 0;
  let destroyed = false;
  let dpr = 1;

  const prefersReduced = reducedMotion
    || (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false);

  function resize() {
    dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  /** Place the roster evenly around the core. */
  function setRoster(roster) {
    const count = Math.max(1, roster.length);
    nodes = roster.map((agent, i) => ({
      id: agent.id,
      label: agent.short || agent.label.slice(0, 5).toUpperCase(),
      accent: agent.accent || '#8fd7ff',
      angle: (i / count) * TAU - Math.PI / 2,
      // Alternating radii keep labels from colliding on a crowded roster.
      radius: i % 2 === 0 ? 0.78 : 0.98,
      state: 'idle',
      pulse: 0,
      activeTasks: 0,
      lastTool: '',
    }));
    kick();
  }

  function nodeFor(agentId) {
    return nodes.find((n) => n.id === agentId) || null;
  }

  function spawnPacket(agentId, { label, inbound = false, tone = null }) {
    const node = nodeFor(agentId);
    if (!node) return;
    packets.push({
      node,
      t: 0,
      inbound,
      label: String(label || '').slice(0, 28).toUpperCase(),
      tone: tone || node.accent,
      // Reduced motion still shows the packet, just briefly and without travel.
      speed: prefersReduced ? 2.4 : 0.55 + Math.random() * 0.25,
    });
    // Cap the queue: a long run can emit faster than packets retire, and an
    // unbounded array would leak for the lifetime of the session.
    if (packets.length > 40) packets.splice(0, packets.length - 40);
    kick();
  }

  /**
   * Fold one orchestrator event into the visual state.
   *
   * @param {object} event - As emitted by `createOrchestrator`.
   */
  function applyEvent(event) {
    switch (event?.type) {
      case 'roster':
        setRoster(event.roster || []);
        break;
      case 'run-start':
        coreEnergy = 1;
        for (const node of nodes) {
          node.state = 'idle';
          node.activeTasks = 0;
        }
        break;
      case 'task-start': {
        const node = nodeFor(event.task?.agentId);
        if (node) {
          node.state = 'running';
          node.activeTasks += 1;
          node.pulse = 1;
        }
        spawnPacket(event.task?.agentId, { label: event.task?.title || 'TASK' });
        coreEnergy = Math.min(1, coreEnergy + 0.35);
        break;
      }
      case 'tool':
        {
          const node = nodeFor(event.agentId);
          if (node) node.lastTool = event.tool || '';
        }
        break;
      case 'tool-result':
        spawnPacket(event.agentId, {
          label: event.tool || 'TOOL',
          inbound: true,
          tone: event.ok ? null : STATE_COLORS.failed,
        });
        break;
      case 'task-end': {
        const node = nodeFor(event.task?.agentId);
        if (node) {
          node.activeTasks = Math.max(0, node.activeTasks - 1);
          node.state = node.activeTasks > 0 ? 'running' : (event.task?.state || 'done');
          node.pulse = 1;
        }
        spawnPacket(event.task?.agentId, {
          label: event.task?.state === 'done' ? 'RESULT' : 'FAILED',
          inbound: true,
          tone: STATE_COLORS[event.task?.state] || null,
        });
        break;
      }
      case 'run-end':
        coreEnergy = 0.25;
        for (const node of nodes) {
          if (node.state === 'running') node.state = 'done';
          node.activeTasks = 0;
        }
        break;
      default:
        break;
    }
    kick();
  }

  function reset() {
    packets = [];
    coreEnergy = 0;
    for (const node of nodes) {
      node.state = 'idle';
      node.activeTasks = 0;
      node.pulse = 0;
      node.lastTool = '';
    }
    kick();
  }

  /** Whether anything still needs animating. */
  function isAnimating() {
    return packets.length > 0
      || coreEnergy > 0.02
      || nodes.some((n) => n.pulse > 0.01 || n.state === 'running');
  }

  function kick() {
    if (destroyed || running) return;
    running = true;
    lastTime = 0;
    frame = requestAnimationFrame(tick);
  }

  function tick(time) {
    if (destroyed) return;
    const dt = lastTime ? Math.min(0.05, (time - lastTime) / 1000) : 0.016;
    lastTime = time;

    // Advance
    for (const packet of packets) packet.t += packet.speed * dt;
    packets = packets.filter((p) => p.t < 1);
    for (const node of nodes) {
      node.pulse = Math.max(0, node.pulse - dt * 1.6);
      if (!prefersReduced) node.angle += dt * (node.state === 'running' ? 0.06 : 0.015);
    }
    if (!nodes.some((n) => n.state === 'running')) coreEnergy = Math.max(0, coreEnergy - dt * 0.4);

    draw();

    if (isAnimating()) {
      frame = requestAnimationFrame(tick);
    } else {
      // Park. The next applyEvent() restarts the loop.
      running = false;
      draw();
    }
  }

  function draw() {
    resize();
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const scale = Math.min(w, h) / 2;

    ctx.clearRect(0, 0, w, h);

    // Spokes first, so nodes and packets sit on top.
    for (const node of nodes) {
      const { x, y } = nodePos(node, cx, cy, scale);
      const active = node.state === 'running';
      ctx.strokeStyle = active ? hexAlpha(node.accent, 0.5) : 'rgba(130, 160, 185, 0.16)';
      ctx.lineWidth = (active ? 1.6 : 1) * dpr;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    drawCore(cx, cy, scale);

    for (const node of nodes) drawNode(node, cx, cy, scale);
    for (const packet of packets) drawPacket(packet, cx, cy, scale);
  }

  function nodePos(node, cx, cy, scale) {
    return {
      x: cx + Math.cos(node.angle) * scale * node.radius * 0.72,
      y: cy + Math.sin(node.angle) * scale * node.radius * 0.72,
    };
  }

  function drawCore(cx, cy, scale) {
    const base = scale * 0.15;
    const r = base * (1 + coreEnergy * 0.18);
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 3);
    glow.addColorStop(0, `rgba(190, 240, 255, ${0.5 + coreEnergy * 0.4})`);
    glow.addColorStop(0.35, `rgba(80, 190, 255, ${0.22 + coreEnergy * 0.28})`);
    glow.addColorStop(1, 'rgba(20, 60, 100, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 3, 0, TAU);
    ctx.fill();

    ctx.fillStyle = `rgba(235, 250, 255, ${0.82 + coreEnergy * 0.18})`;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.42, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = `rgba(140, 220, 255, ${0.3 + coreEnergy * 0.4})`;
    ctx.lineWidth = 1.2 * dpr;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.stroke();
  }

  function drawNode(node, cx, cy, scale) {
    const { x, y } = nodePos(node, cx, cy, scale);
    const r = scale * 0.055;
    const color = STATE_COLORS[node.state] || node.accent;

    if (node.pulse > 0) {
      ctx.strokeStyle = hexAlpha(color, node.pulse * 0.6);
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.arc(x, y, r * (1.4 + (1 - node.pulse) * 1.6), 0, TAU);
      ctx.stroke();
    }

    const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
    glow.addColorStop(0, hexAlpha(node.accent, 0.55));
    glow.addColorStop(1, hexAlpha(node.accent, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.2, 0, TAU);
    ctx.fill();

    ctx.fillStyle = 'rgba(8, 16, 24, 0.9)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5 * dpr;
    ctx.stroke();

    ctx.fillStyle = 'rgba(215, 235, 250, 0.92)';
    ctx.font = `${Math.round(9 * dpr)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.label, x, y);

    // Status line under the node: the tool in flight, or the state.
    const caption = node.state === 'running' && node.lastTool ? node.lastTool : node.state.toUpperCase();
    ctx.fillStyle = hexAlpha(color, 0.7);
    ctx.font = `${Math.round(7.5 * dpr)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.fillText(caption.slice(0, 18), x, y + r * 1.9);
  }

  function drawPacket(packet, cx, cy, scale) {
    const { x: nx, y: ny } = nodePos(packet.node, cx, cy, scale);
    // Outbound runs core → node; inbound runs node → core.
    const t = packet.inbound ? 1 - packet.t : packet.t;
    const x = cx + (nx - cx) * t;
    const y = cy + (ny - cy) * t;
    // Fade in and out so packets do not pop at the endpoints.
    const alpha = Math.sin(Math.min(1, packet.t) * Math.PI);

    ctx.fillStyle = hexAlpha(packet.tone, alpha * 0.9);
    ctx.beginPath();
    ctx.arc(x, y, 2.6 * dpr, 0, TAU);
    ctx.fill();

    if (packet.label && alpha > 0.35) {
      ctx.fillStyle = hexAlpha(packet.tone, alpha * 0.75);
      ctx.font = `${Math.round(7.5 * dpr)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(packet.label, x + 6 * dpr, y - 4 * dpr);
    }
  }

  const onResize = () => {
    resize();
    draw();
  };
  globalThis.addEventListener?.('resize', onResize);

  resize();
  draw();

  return {
    setRoster,
    applyEvent,
    reset,
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      globalThis.removeEventListener?.('resize', onResize);
    },
  };
}

/** Apply an alpha to a #rrggbb or rgba() colour. */
export function hexAlpha(color, alpha) {
  const a = Math.max(0, Math.min(1, alpha));
  const hex = String(color || '#8fd7ff').trim();
  const match = hex.match(/^#([0-9a-f]{6})$/i);
  if (!match) {
    // Already-functional colours (rgba(...)) pass through with their own alpha;
    // re-wrapping them would produce invalid CSS.
    return hex;
  }
  const int = Number.parseInt(match[1], 16);
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${a})`;
}
