/**
 * Agent console — the operator surface for the swarm.
 *
 * Builds its own DOM (no markup in `index.html` beyond an empty mount point),
 * subscribes to orchestrator events, and drives the orbital view. Three panes:
 * the orbit, the live task list, and the output (summary + artifacts).
 *
 * The console never talks to the model or the globe directly — it only calls
 * `orchestrator.start/stop` and renders what comes back on the event stream.
 * That separation is what lets `orchestrator.test.mjs` cover the whole engine
 * with no DOM at all.
 */

import { createAgentOrbit } from './agentOrbit.js';
import { validateCustomAgent } from './agentRoster.js';
import { ALL_TOOL_NAMES } from './toolBus.js';

const CUSTOM_AGENTS_KEY = 'gev:agent-swarm:custom-agents:v1';
const HISTORY_KEY = 'gev:agent-swarm:history:v1';
const MAX_LOG_ROWS = 200;

const STATE_GLYPH = {
  queued: '○',
  running: '◐',
  done: '●',
  failed: '✕',
  blocked: '⊘',
  cancelled: '–',
};

/**
 * Mount the console.
 *
 * @param {HTMLElement} mount - Container element.
 * @param {object} orchestrator - From `createOrchestrator`.
 * @param {object} [options]
 * @returns {{open: Function, close: Function, toggle: Function, destroy: Function, handleEvent: Function}}
 */
export function mountAgentConsole(mount, orchestrator, { storage = globalThis.localStorage } = {}) {
  mount.innerHTML = '';
  mount.classList.add('agent-console');

  const el = buildDom();
  mount.appendChild(el.root);

  const orbit = createAgentOrbit(el.canvas);
  orbit.setRoster(orchestrator.roster);

  let customAgents = readJson(storage, CUSTOM_AGENTS_KEY, []);
  if (customAgents.length) orchestrator.setCustomAgents(customAgents);
  renderRoster();

  // ---- events -------------------------------------------------------------

  function handleEvent(event) {
    orbit.applyEvent(event);
    switch (event.type) {
      case 'phase':
        setStatus(event.phase === 'planning' ? 'PLANNING' : event.phase === 'reporting' ? 'SUMMARIZING' : 'RUNNING');
        if (event.phase === 'planning') log('core', 'Decomposing goal…');
        break;
      case 'run-start':
        renderTasks(event.run);
        log('core', `${event.run.tasks.length} task${event.run.tasks.length === 1 ? '' : 's'} planned`);
        break;
      case 'task-start':
        updateTaskRow(event.task);
        log(event.task.agentId, `▸ ${event.task.title}`);
        break;
      case 'tool':
        log(event.agentId, `  ⚙ ${event.tool}`);
        break;
      case 'tool-result':
        if (!event.ok) log(event.agentId, `  ⚠ ${event.tool} failed`, 'warn');
        break;
      case 'task-end':
        updateTaskRow(event.task);
        if (event.progress) setProgress(event.progress);
        log(
          event.task.agentId,
          event.task.state === 'done' ? `✓ ${event.task.title}` : `✕ ${event.task.title} — ${event.task.error || ''}`,
          event.task.state === 'done' ? 'ok' : 'error',
        );
        break;
      case 'finding':
        log(event.finding.agentId, `  ◆ ${event.finding.text.slice(0, 120)}`);
        break;
      case 'artifact':
        renderArtifact(event.artifact);
        log(event.artifact.agentId, `  ⬇ artifact: ${event.artifact.title}`, 'ok');
        break;
      case 'warning':
        log('core', event.message, 'warn');
        break;
      case 'error':
        log('core', event.message, 'error');
        break;
      case 'run-end':
        setRunning(false);
        setStatus(event.cancelled ? 'STOPPED' : event.run.state.toUpperCase());
        if (event.summary) renderSummary(event.summary);
        if (event.run) {
          renderTasks(event.run);
          setProgress(event.run.progress);
          saveHistory(event.run, event.summary);
        }
        log('core', event.cancelled ? 'Run stopped by operator' : 'Run complete', event.cancelled ? 'warn' : 'ok');
        break;
      case 'roster':
        orbit.setRoster(event.roster);
        renderRoster();
        break;
      default:
        break;
    }
  }

  // ---- actions ------------------------------------------------------------

  async function start() {
    const goal = el.input.value.trim();
    if (!goal) {
      el.input.focus();
      return;
    }
    el.log.innerHTML = '';
    el.tasks.innerHTML = '';
    el.artifacts.innerHTML = '';
    el.summary.hidden = true;
    el.summary.textContent = '';
    orbit.reset();
    setRunning(true);
    setStatus('PLANNING');
    log('core', `GOAL — ${goal}`);

    try {
      await orchestrator.start(goal);
    } catch (error) {
      setRunning(false);
      setStatus('FAILED');
      log('core', String(error?.message || error), 'error');
    }
  }

  function stop() {
    orchestrator.stop();
    setRunning(false);
    setStatus('STOPPED');
  }

  // ---- rendering ----------------------------------------------------------

  function setRunning(active) {
    el.root.classList.toggle('is-running', active);
    el.runBtn.disabled = active;
    el.stopBtn.disabled = !active;
    el.input.disabled = active;
  }

  function setStatus(text) {
    el.status.textContent = text;
    el.status.dataset.state = text.toLowerCase();
  }

  function setProgress(progress) {
    if (!progress) return;
    el.progressBar.style.width = `${progress.pct}%`;
    el.progressText.textContent = `${progress.settled}/${progress.total}`;
  }

  function renderTasks(run) {
    el.tasks.innerHTML = '';
    for (const task of run.tasks) el.tasks.appendChild(taskRow(task));
    setProgress(run.progress);
  }

  function taskRow(task) {
    const row = document.createElement('li');
    row.className = 'agent-task';
    row.dataset.taskId = task.id;
    row.dataset.state = task.state;
    row.innerHTML = `
      <span class="agent-task-glyph">${STATE_GLYPH[task.state] || '○'}</span>
      <span class="agent-task-body">
        <span class="agent-task-title"></span>
        <span class="agent-task-meta"></span>
      </span>`;
    row.querySelector('.agent-task-title').textContent = task.title;
    row.querySelector('.agent-task-meta').textContent = task.agentId
      + (task.dependsOn.length ? ` ← ${task.dependsOn.join(', ')}` : '');
    if (task.error) row.title = task.error;
    return row;
  }

  function updateTaskRow(task) {
    if (!task) return;
    const existing = el.tasks.querySelector(`[data-task-id="${cssEscape(task.id)}"]`);
    if (!existing) {
      el.tasks.appendChild(taskRow(task));
      return;
    }
    existing.dataset.state = task.state;
    existing.querySelector('.agent-task-glyph').textContent = STATE_GLYPH[task.state] || '○';
    if (task.error) existing.title = task.error;
  }

  function log(source, message, tone = '') {
    const row = document.createElement('div');
    row.className = `agent-log-row${tone ? ` is-${tone}` : ''}`;
    const src = document.createElement('span');
    src.className = 'agent-log-src';
    src.textContent = source;
    const txt = document.createElement('span');
    txt.className = 'agent-log-msg';
    txt.textContent = message;
    row.append(src, txt);
    el.log.appendChild(row);
    // Trim from the top so a long run cannot grow the DOM without bound.
    while (el.log.childElementCount > MAX_LOG_ROWS) el.log.removeChild(el.log.firstChild);
    el.log.scrollTop = el.log.scrollHeight;
  }

  function renderSummary(text) {
    el.summary.hidden = false;
    el.summary.textContent = text;
    el.summary.scrollTop = 0;
  }

  function renderArtifact(artifact) {
    const card = document.createElement('div');
    card.className = 'agent-artifact';
    const head = document.createElement('div');
    head.className = 'agent-artifact-head';
    const title = document.createElement('span');
    title.textContent = artifact.title;
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'agent-artifact-copy';
    copy.textContent = 'COPY';
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(artifact.content);
        copy.textContent = 'COPIED';
        setTimeout(() => { copy.textContent = 'COPY'; }, 1400);
      } catch {
        copy.textContent = 'FAILED';
        setTimeout(() => { copy.textContent = 'COPY'; }, 1400);
      }
    });
    head.append(title, copy);
    const body = document.createElement('pre');
    body.className = 'agent-artifact-body';
    body.textContent = artifact.content;
    card.append(head, body);
    el.artifacts.appendChild(card);
  }

  function renderRoster() {
    el.roster.innerHTML = '';
    for (const agent of orchestrator.roster) {
      const chip = document.createElement('span');
      chip.className = 'agent-chip';
      chip.style.setProperty('--agent-accent', agent.accent);
      chip.textContent = agent.label;
      chip.title = `${agent.description}\nTools: ${(agent.tools || []).join(', ') || 'none'}`;
      if (agent.custom) chip.classList.add('is-custom');
      el.roster.appendChild(chip);
    }
  }

  function saveHistory(run, summary) {
    const history = readJson(storage, HISTORY_KEY, []);
    history.unshift({
      id: run.id,
      goal: run.goal,
      state: run.state,
      at: Date.now(),
      summary: String(summary || '').slice(0, 4000),
    });
    writeJson(storage, HISTORY_KEY, history.slice(0, 20));
  }

  // ---- custom agents ------------------------------------------------------

  function addCustomAgent() {
    const result = validateCustomAgent(
      {
        id: el.newAgentId.value,
        label: el.newAgentLabel.value,
        description: el.newAgentLabel.value,
        system: el.newAgentPrompt.value,
        tools: el.newAgentTools.value.split(',').map((t) => t.trim()).filter(Boolean),
        accent: '#c9a4ff',
      },
      { knownTools: ALL_TOOL_NAMES },
    );
    if (!result.ok) {
      log('core', result.errors.join('; '), 'error');
      return;
    }
    customAgents = [...customAgents.filter((a) => a.id !== result.agent.id), result.agent];
    writeJson(storage, CUSTOM_AGENTS_KEY, customAgents);
    orchestrator.setCustomAgents(customAgents);
    el.newAgentId.value = '';
    el.newAgentLabel.value = '';
    el.newAgentPrompt.value = '';
    el.newAgentTools.value = '';
    log('core', `Agent "${result.agent.id}" added to the roster`, 'ok');
  }

  // ---- wiring -------------------------------------------------------------

  el.runBtn.addEventListener('click', start);
  el.stopBtn.addEventListener('click', stop);
  el.closeBtn.addEventListener('click', () => close());
  el.addAgentBtn.addEventListener('click', addCustomAgent);
  el.builderToggle.addEventListener('click', () => {
    el.builder.hidden = !el.builder.hidden;
    el.builderToggle.setAttribute('aria-expanded', String(!el.builder.hidden));
  });
  el.input.addEventListener('keydown', (event) => {
    // Enter runs; Shift+Enter is a newline, since goals are often multi-line.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!orchestrator.isBusy()) start();
    }
  });

  const onKeydown = (event) => {
    if (event.key === 'Escape' && !el.root.hidden) {
      // Never swallow ESC while a run is live — the operator needs it to reach
      // whatever else is on screen, and Stop is a visible button.
      if (!orchestrator.isBusy()) close();
    }
  };
  document.addEventListener('keydown', onKeydown);

  function open() {
    el.root.hidden = false;
    document.body.classList.add('agent-console-open');
    el.input.focus();
  }
  function close() {
    el.root.hidden = true;
    document.body.classList.remove('agent-console-open');
  }
  function toggle() {
    if (el.root.hidden) open();
    else close();
  }

  setStatus('IDLE');
  setRunning(false);
  close();

  return {
    open,
    close,
    toggle,
    handleEvent,
    get isOpen() {
      return !el.root.hidden;
    },
    destroy() {
      document.removeEventListener('keydown', onKeydown);
      orbit.destroy();
      mount.innerHTML = '';
    },
  };
}

/** Build the console's DOM once, returning the elements the module updates. */
function buildDom() {
  const root = document.createElement('div');
  root.className = 'agent-console-root';
  root.hidden = true;
  root.innerHTML = `
    <header class="agent-console-head">
      <div class="agent-console-title">
        <span class="agent-console-dot"></span>
        <span>AGENT SWARM</span>
        <span class="agent-console-status" data-state="idle">IDLE</span>
      </div>
      <div class="agent-console-progress">
        <div class="agent-console-progress-bar"></div>
      </div>
      <span class="agent-console-progress-text">0/0</span>
      <button type="button" class="agent-console-close" aria-label="Close agent console">✕</button>
    </header>

    <div class="agent-console-grid">
      <section class="agent-pane agent-pane-orbit">
        <canvas class="agent-orbit-canvas"></canvas>
        <div class="agent-roster"></div>
      </section>

      <section class="agent-pane agent-pane-tasks">
        <h3 class="agent-pane-title">TASK GRAPH</h3>
        <ol class="agent-task-list"></ol>
        <h3 class="agent-pane-title">ACTIVITY</h3>
        <div class="agent-log"></div>
      </section>

      <section class="agent-pane agent-pane-output">
        <h3 class="agent-pane-title">OUTPUT</h3>
        <div class="agent-summary" hidden></div>
        <div class="agent-artifacts"></div>
      </section>
    </div>

    <div class="agent-builder" hidden>
      <input class="agent-builder-id" placeholder="agent-id" maxlength="40" />
      <input class="agent-builder-label" placeholder="Label" maxlength="40" />
      <input class="agent-builder-tools" placeholder="tools, comma separated" />
      <textarea class="agent-builder-prompt" placeholder="System prompt — what this agent is and how it works" rows="3"></textarea>
      <button type="button" class="agent-builder-add">ADD AGENT</button>
    </div>

    <footer class="agent-console-foot">
      <textarea class="agent-console-input" rows="2"
        placeholder="Give the swarm a goal — e.g. &quot;Find every active wildfire in California, put the biggest on screen, and write me a one-page brief&quot;"></textarea>
      <div class="agent-console-actions">
        <button type="button" class="agent-console-builder-toggle" aria-expanded="false">+ AGENT</button>
        <button type="button" class="agent-console-stop">STOP</button>
        <button type="button" class="agent-console-run">RUN</button>
      </div>
    </footer>`;

  return {
    root,
    canvas: root.querySelector('.agent-orbit-canvas'),
    roster: root.querySelector('.agent-roster'),
    tasks: root.querySelector('.agent-task-list'),
    log: root.querySelector('.agent-log'),
    summary: root.querySelector('.agent-summary'),
    artifacts: root.querySelector('.agent-artifacts'),
    input: root.querySelector('.agent-console-input'),
    runBtn: root.querySelector('.agent-console-run'),
    stopBtn: root.querySelector('.agent-console-stop'),
    closeBtn: root.querySelector('.agent-console-close'),
    status: root.querySelector('.agent-console-status'),
    progressBar: root.querySelector('.agent-console-progress-bar'),
    progressText: root.querySelector('.agent-console-progress-text'),
    builder: root.querySelector('.agent-builder'),
    builderToggle: root.querySelector('.agent-console-builder-toggle'),
    addAgentBtn: root.querySelector('.agent-builder-add'),
    newAgentId: root.querySelector('.agent-builder-id'),
    newAgentLabel: root.querySelector('.agent-builder-label'),
    newAgentTools: root.querySelector('.agent-builder-tools'),
    newAgentPrompt: root.querySelector('.agent-builder-prompt'),
  };
}

function cssEscape(value) {
  return globalThis.CSS?.escape ? CSS.escape(value) : String(value).replace(/["\\]/g, '\\$&');
}

function readJson(storage, key, fallback) {
  try {
    const raw = storage?.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) || (parsed && typeof parsed === 'object') ? parsed : fallback;
  } catch {
    // A corrupt or blocked store must not stop the console from opening.
    return fallback;
  }
}

function writeJson(storage, key, value) {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or private-mode failure: the roster still works for this session.
  }
}
