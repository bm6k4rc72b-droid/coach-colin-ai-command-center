/**
 * Agent swarm entry point.
 *
 * One call from `main.js` once the globe is up. Kept deliberately thin: it
 * creates the orchestrator, mounts the console, and joins them by piping every
 * orchestrator event into the console's handler.
 *
 * The swarm is created lazily-but-eagerly: the modules are small and the
 * orchestrator does no network work until a goal is submitted, so there is
 * nothing to defer, and having the launcher present from startup means the
 * keyboard shortcut works before the first run.
 */

import { createOrchestrator } from './orchestrator.js';
import { mountAgentConsole } from './agentConsole.js';

/**
 * Install the agent swarm into the running app.
 *
 * @param {object} options
 * @param {Function|null} options.runGevAction - The GEV action runner, so agents can drive the globe.
 * @param {HTMLElement} [options.mount] - Container; created and appended to body when absent.
 * @returns {{open: Function, close: Function, toggle: Function, orchestrator: object, destroy: Function}}
 */
export function installAgentSwarm({ runGevAction = null, mount = null } = {}) {
  const container = mount || (() => {
    const div = document.createElement('div');
    div.id = 'agent-swarm-mount';
    document.body.appendChild(div);
    return div;
  })();

  let console_ = null;
  const orchestrator = createOrchestrator({
    runGevAction,
    // The console is mounted immediately after this call, so by the time any
    // event can fire (a goal has to be submitted first) the binding is live.
    onEvent: (event) => console_?.handleEvent(event),
  });

  console_ = mountAgentConsole(container, orchestrator);

  const launcher = buildLauncher(() => console_.toggle());
  document.body.appendChild(launcher);

  const onKeydown = (event) => {
    // Ctrl/Cmd+Shift+A — deliberately not a bare key, since the app already
    // binds single letters to camera and layer verbs.
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      console_.toggle();
    }
  };
  document.addEventListener('keydown', onKeydown);

  return {
    orchestrator,
    open: () => console_.open(),
    close: () => console_.close(),
    toggle: () => console_.toggle(),
    destroy() {
      document.removeEventListener('keydown', onKeydown);
      launcher.remove();
      console_.destroy();
      if (!mount) container.remove();
    },
  };
}

function buildLauncher(onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'agent-swarm-launcher';
  button.title = 'Agent swarm (Ctrl/Cmd+Shift+A)';
  button.setAttribute('aria-label', 'Open the agent swarm console');
  button.innerHTML = '<span class="agent-launcher-core"></span><span class="agent-launcher-label">AGENTS</span>';
  button.addEventListener('click', onClick);
  return button;
}

export { createOrchestrator } from './orchestrator.js';
export { mountAgentConsole } from './agentConsole.js';
