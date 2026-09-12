/**
 * The page, assembled.
 *
 * Everything else in this folder is a part that stands on its own — the
 * director, the renderer, the score, the agent planner, the security
 * estimator. This module is the wiring: it lays the document out from the act
 * table, starts one animation loop, and routes the scene state into the
 * canvas, the HUD, the reveals and the rack.
 *
 * There is exactly one loop. A page like this fails when four subsystems each
 * install their own scroll listener and then disagree about what frame it is;
 * here, scroll only ever records a number, and a single `requestAnimationFrame`
 * reads it and drives everything from the same value.
 *
 * The page also has to work with nothing running. If the canvas is refused,
 * the sections are still readable. If audio is refused, the film is silent. If
 * the reader prefers reduced motion, the camera stops shaking, the grain and
 * rain come off, and the acts change without the screen moving under them.
 *
 * @module vice/app
 */

import { ACTS, sceneState } from './sequence.js';
import { Director, actScrollMap, progressFromMap, rackPosition } from './scroll.js';
import { Stage } from './stage.js';
import { Hud, buildHud } from './hud.js';
import { Score } from './score.js';
import { Showcase } from './showcase.js';
import { ranked } from './apps.js';
import { AGENTS, CHANNELS, byKind, deploymentPlan, safeThrottle } from './agents.js';
import { LICENSING, SERVICES, money, quote, summarise } from './security.js';
import { clamp } from './mathkit.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

/**
 * The shortest document, in viewport heights, that the film is allowed to run
 * across. Long enough that no act goes by in a flick of the wheel; the real
 * height is whatever the content needs above this.
 */
const MIN_TRAVEL_VH = 18;

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const state = {
  entered: false,
  progress: 0,
  map: [],
  travel: 1,
  selected: new Set(['prospector', 'opener', 'closer', 'concierge', 'poster']),
  throttle: 1,
  reviewHours: 5,
};

const score = new Score();
const stage = new Stage($('#film'), { reduced });
const director = new Director(document);
let hud = null;
let showcase = null;

/* --- layout ------------------------------------------------------------ */

/**
 * Give every section exactly the share of the scroll its act is worth.
 *
 * The brief asked for three things to happen at three specific scroll
 * positions — police at 25%, gunships at 50%, the detonation at 75% — and a
 * page whose sections are simply "tall" cannot promise that. A paragraph wraps
 * differently on a phone, one section grows by 300px, and every mark after it
 * is late.
 *
 * So the heights are solved rather than chosen. Each section is measured at
 * its natural height, then the total scroll distance is set to the smallest
 * value at which *every* section fits inside its act's share of it:
 *
 *     travel = max over sections of (natural height ÷ share of the timeline)
 *
 * and each section is then padded out to exactly that share. Nothing is ever
 * squeezed — the tallest section is the one that sets the scale — and the act
 * boundaries land on the same fractions at every width, which is what makes
 * the 25/50/75 marks a guarantee instead of a hope.
 */
function layout() {
  const sections = $$('main .act');
  if (!sections.length) return;

  // Share of the whole timeline owned by each section.
  const shareTotals = new Map();
  for (const section of sections) {
    const id = section.dataset.act.replace(/-.*$/, '');
    shareTotals.set(id, (shareTotals.get(id) || 0) + Number(section.dataset.share || 1));
  }
  const plan = [];
  for (const section of sections) {
    const id = section.dataset.act.replace(/-.*$/, '');
    const act = ACTS.find((entry) => entry.id === id);
    if (!act) continue;
    const share = Number(section.dataset.share || 1) / (shareTotals.get(id) || 1);
    plan.push({ section, fraction: (act.to - act.from) * share });
  }

  // Measure natural heights with the previous solution removed.
  for (const entry of plan) entry.section.style.minHeight = '0px';
  for (const entry of plan) entry.natural = entry.section.offsetHeight;

  const viewport = window.innerHeight;
  let travel = MIN_TRAVEL_VH * viewport;
  for (const entry of plan) {
    if (entry.fraction > 0) travel = Math.max(travel, entry.natural / entry.fraction);
  }

  for (const entry of plan) {
    entry.section.style.minHeight = `${Math.round(entry.fraction * travel)}px`;
  }
  // The last act has to be reachable, so it carries the final screenful.
  const last = plan[plan.length - 1];
  if (last) {
    last.section.style.minHeight = `${Math.round(last.fraction * travel + viewport)}px`;
  }
}

/* --- the swarm console ------------------------------------------------- */

/** Render one agent as a selectable card. */
function agentCard(agent) {
  const channels = agent.channels.map((id) => {
    const channel = CHANNELS.find((entry) => entry.id === id);
    return `<span class="chip">${channel ? channel.label : id}</span>`;
  }).join('');
  return `
    <label class="agent" data-agent="${agent.id}">
      <input type="checkbox" value="${agent.id}"${state.selected.has(agent.id) ? ' checked' : ''}>
      <span class="agent-body">
        <span class="agent-head">
          <b>${agent.name}</b>
          <i>${agent.codename}</i>
          <em class="agent-autonomy" data-autonomy="${agent.autonomy}">${
            agent.autonomy === 'acts' ? 'acts alone' : agent.autonomy === 'reports' ? 'reports' : 'you approve'
          }</em>
        </span>
        <span class="agent-role">${agent.role}</span>
        <span class="agent-channels">${channels}</span>
        <span class="agent-guard">${agent.guardrail}</span>
      </span>
    </label>`;
}

/** Build both rosters and wire the selection. */
function buildConsole() {
  const outreach = $('#roster-outreach');
  const automation = $('#roster-automation');
  if (!outreach || !automation) return;
  outreach.innerHTML = byKind('outreach').map(agentCard).join('');
  automation.innerHTML = byKind('automation').map(agentCard).join('');

  for (const input of $$('.agent input')) {
    input.addEventListener('change', () => {
      if (input.checked) state.selected.add(input.value);
      else state.selected.delete(input.value);
      renderPlan();
    });
  }
  for (const button of $$('[data-select]')) {
    button.addEventListener('click', () => {
      const kind = button.dataset.select;
      const ids = byKind(kind).map((agent) => agent.id);
      const allOn = ids.every((id) => state.selected.has(id));
      for (const id of ids) {
        if (allOn) state.selected.delete(id);
        else state.selected.add(id);
      }
      for (const input of $$('.agent input')) input.checked = state.selected.has(input.value);
      renderPlan();
    });
  }

  const throttle = $('#throttle');
  throttle.addEventListener('input', () => {
    state.throttle = Number(throttle.value) / 100;
    $('#throttle-out').textContent = `${throttle.value}%`;
    renderPlan();
  });
  const review = $('#review');
  review.addEventListener('input', () => {
    state.reviewHours = Number(review.value);
    $('#review-out').textContent = `${review.value} h/week`;
    renderPlan();
  });

  $('#auto-throttle').addEventListener('click', () => {
    const safe = safeThrottle([...state.selected], { reviewHoursPerWeek: state.reviewHours });
    if (safe <= 0) {
      $('#deploy-note').textContent =
        'No throttle makes this selection safe — the approval time alone is over budget. Drop an agent, or give the swarm more of your week.';
      return;
    }
    state.throttle = safe;
    throttle.value = String(Math.round(safe * 100));
    $('#throttle-out').textContent = `${throttle.value}%`;
    renderPlan();
    $('#deploy-note').textContent = `Throttled to ${throttle.value}% — the highest setting that clears every line.`;
  });

  $('#deploy').addEventListener('click', () => {
    const plan = deploymentPlan([...state.selected], {
      throttle: state.throttle, reviewHoursPerWeek: state.reviewHours,
    });
    const note = $('#deploy-note');
    if (!plan.agents.length) {
      note.textContent = 'Nothing selected. Pick at least one agent.';
      return;
    }
    const subject = encodeURIComponent('Deploy the swarm');
    const body = encodeURIComponent(
      `Agents: ${plan.agents.map((agent) => agent.name).join(', ')}\n` +
      `Throttle: ${Math.round(state.throttle * 100)}%\n` +
      `Volume: ${plan.weeklyTouches.toLocaleString('en-US')} touches a week\n` +
      `Approval time: ${plan.reviewHours} hours a week\n` +
      `Channels: ${plan.perChannel.map((c) => `${c.label} ${c.daily}/day`).join(', ')}\n` +
      (plan.warnings.length ? `\nOpen questions:\n- ${plan.warnings.join('\n- ')}\n` : '\nNo warnings on this plan.\n'),
    );
    window.location.href = `mailto:coachcolinc@icloud.com?subject=${subject}&body=${body}`;
    note.textContent = plan.clean
      ? 'Plan sent to the desk. Nothing in it is over a line.'
      : 'Plan sent to the desk, warnings and all — they are in the email so nobody is surprised later.';
    score.sfx('star', { gain: 0.8 });
  });

  renderPlan();
}

/** Recompute and print the plan. */
function renderPlan() {
  const plan = deploymentPlan([...state.selected], {
    throttle: state.throttle, reviewHoursPerWeek: state.reviewHours,
  });
  $('#fig-weekly').textContent = plan.weeklyTouches.toLocaleString('en-US');
  $('#fig-review').textContent = plan.reviewHours.toFixed(1);

  $('#channel-load').innerHTML = plan.perChannel.length
    ? plan.perChannel.map((channel) => `
        <div class="channel${channel.over ? ' is-over' : ''}">
          <span class="channel-name">${channel.label}</span>
          <span class="channel-bar"><i style="width:${Math.min(channel.pressure, 1.4) / 1.4 * 100}%"></i>
            <em style="left:${(1 / 1.4) * 100}%"></em></span>
          <span class="channel-num">${channel.daily}<small>/${channel.safeDaily}</small></span>
        </div>`).join('')
    : '<p class="fine">No channels loaded.</p>';

  $('#plan-warnings').innerHTML = plan.warnings.length
    ? plan.warnings.map((warning) => `<p class="warn">${warning}</p>`).join('')
    : '<p class="ok">Every channel is under its caution line and the approval time fits the week.</p>';
}

/* --- the security desk ------------------------------------------------- */

/** Render the service cards and the estimator. */
function buildSecurity() {
  const grid = $('#services');
  if (grid) {
    grid.innerHTML = SERVICES.map((service) => `
      <article class="service" data-reveal style="--accent:${service.accent}">
        <h3>${service.name}</h3>
        <p class="service-tagline">${service.tagline}</p>
        <p>${service.blurb}</p>
        <ul class="ticks">${service.includes.map((item) => `<li>${item}</li>`).join('')}</ul>
        <footer>
          <span>${service.audience}</span>
          <button class="btn tiny" type="button" data-service="${service.id}">Estimate this</button>
        </footer>
      </article>`).join('');
    for (const button of $$('[data-service]')) {
      button.addEventListener('click', () => {
        loadService(button.dataset.service);
        $('#quote').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
      });
    }
  }

  const select = $('#q-service');
  select.innerHTML = SERVICES.map((service) => `<option value="${service.id}">${service.name}</option>`).join('');
  select.addEventListener('change', () => loadService(select.value));

  for (const input of ['#q-officers', '#q-hours', '#q-days', '#q-tier', '#q-vehicle']) {
    $(input).addEventListener('input', renderQuote);
    $(input).addEventListener('change', renderQuote);
  }
  for (const input of $$('[data-uplift]')) input.addEventListener('change', renderQuote);

  $('#licensing').textContent = LICENSING.note;
  loadService(SERVICES[0].id);
}

/** Fill the form with a service's own defaults. */
function loadService(id) {
  const service = SERVICES.find((entry) => entry.id === id);
  if (!service) return;
  $('#q-service').value = id;
  $('#q-officers').value = String(service.defaults.officers);
  $('#q-hours').value = String(service.defaults.hours);
  $('#q-tier').value = service.defaults.tier;
  $('#q-vehicle').checked = Boolean(service.defaults.vehicle);
  renderQuote();
}

/** Recompute and print the estimate. */
function renderQuote() {
  const estimate = quote({
    service: $('#q-service').value,
    officers: Number($('#q-officers').value),
    hours: Number($('#q-hours').value),
    days: Number($('#q-days').value),
    tier: $('#q-tier').value,
    vehicle: $('#q-vehicle').checked,
    uplifts: $$('[data-uplift]').filter((input) => input.checked).map((input) => input.dataset.uplift),
  });
  $('#q-total').textContent = money(estimate.total);
  $('#q-assumptions').innerHTML = estimate.assumptions.map((line) => `<li>${line}</li>`).join('');
  $('#q-disclaimer').textContent = estimate.disclaimer;
  $('#q-mail').href =
    `mailto:coachcolinc@icloud.com?subject=${encodeURIComponent('Security enquiry — ' + estimate.service)}` +
    `&body=${encodeURIComponent(`${summarise(estimate)}\n\nAssumptions:\n- ${estimate.assumptions.join('\n- ')}\n\n${estimate.disclaimer}\n\nDate needed:\nProperty / venue:\n`)}`;
}

/* --- the loop ---------------------------------------------------------- */

/**
 * Measure where each act's section actually starts.
 *
 * Run after layout and on every resize. Everything downstream reads the map
 * rather than the raw scroll ratio, so an act begins when its section does
 * however the copy happened to wrap.
 */
function measure() {
  const tops = new Map();
  for (const section of $$('main .act')) {
    const id = section.dataset.act.replace(/-.*$/, '');
    if (!tops.has(id)) tops.set(id, section.offsetTop);
  }
  const travel = document.documentElement.scrollHeight - window.innerHeight;
  state.travel = Math.max(travel, 1);
  state.map = actScrollMap(ACTS, tops, state.travel);
}

/** Read the scroll position. Nothing else happens in the listener. */
function readScroll() {
  const y = window.scrollY || window.pageYOffset || 0;
  state.progress = progressFromMap(y, state.map, state.travel || 1);
}

/** Drive the rack from its own section's position on screen. */
function driveRack() {
  const section = $('#fleet');
  if (!section || !showcase) return;
  const rect = section.getBoundingClientRect();
  const travel = rect.height - window.innerHeight;
  const t = travel > 0 ? clamp(-rect.top / travel, 0, 1) : 0;
  const { offset } = rackPosition({ t, count: showcase.apps.length, visible: 1 });
  showcase.setTimeline(showcase.max ? offset / showcase.max : 0);
}

let lastFrame = performance.now();

/** One frame of everything the DOM owns. */
function frame(now) {
  const dt = clamp((now - lastFrame) / 1000, 0, 0.05);
  lastFrame = now;
  readScroll();
  stage.setProgress(state.progress);
  const scene = sceneState(state.progress);
  director.update();
  driveRack();
  if (showcase) {
    showcase.update(dt);
    const focused = showcase.apps[Math.round(showcase.position)];
    if (focused) {
      $('#rack-label').textContent = showcase.label();
      $('#rack-name').textContent = focused.name;
    }
  }
  if (hud) hud.update(scene, dt);
  requestAnimationFrame(frame);
}

/* --- boot -------------------------------------------------------------- */

/** Sound the act change: a new cue, and whatever effect belongs to it. */
function onAct(scene, previous) {
  score.setCue(scene.cue);
  switch (scene.act) {
    case 'chase': score.sfx('siren'); score.sfx('skid', { gain: 0.7 }); break;
    case 'cavalry': score.sfx('rotor'); break;
    case 'detonation': score.duck(0.5, 1.2); break;
    case 'aftermath': score.sfx('shield'); break;
    default: break;
  }
  if (previous === 'detonation') score.sfx('shield', { gain: 0.8 });
  document.body.dataset.act = scene.act;
}

/** Fire the detonation's own effects once, when the front actually arrives. */
let boomed = false;
function watchBlast() {
  const scene = sceneState(state.progress);
  if (!boomed && scene.blast > 0.02) {
    boomed = true;
    score.sfx('boom');
  } else if (boomed && scene.blast <= 0.001) {
    // Scrubbed back above the blast: arm it again, so it can be replayed.
    boomed = false;
  }
  setTimeout(watchBlast, 120);
}

/** Start everything that needs a gesture behind it. */
function enter(withSound) {
  if (state.entered) return;
  state.entered = true;
  document.body.classList.add('is-playing');
  $('#gate').classList.add('is-gone');
  setTimeout(() => $('#gate').setAttribute('hidden', ''), 700);
  if (withSound && Score.supported) {
    score.start();
    score.setCue(sceneState(state.progress).cue);
    $('#btn-sound').setAttribute('aria-pressed', 'true');
  }
  stage.start();
}

function boot() {
  buildHud({ stars: $('#stars'), rail: $('#rail') });
  hud = new Hud({
    stars: $('#stars'),
    rail: $('#rail'),
    radar: $('#radar'),
    mission: $('#mission'),
    chapter: $('#chapter'),
    speed: $('#speed'),
    announce: $('#announce'),
  }, { onAct });

  showcase = new Showcase($('#rack'), ranked(), {});
  showcase.build();
  buildConsole();
  buildSecurity();

  // Layout is solved against the finished DOM, so the console and the service
  // grid are measured at the size they will actually be.
  layout();
  director.collect();

  stage.resize();
  measure();
  readScroll();
  stage.setProgress(state.progress);

  window.addEventListener('scroll', readScroll, { passive: true });
  window.addEventListener('resize', () => {
    stage.resize();
    layout();
    measure();
    director.collect();
  }, { passive: true });
  // Images arriving late change the document height, and therefore where every
  // act begins. Re-measure when they land rather than once at boot.
  // Anything that can change the document's height has to re-solve the
  // layout, but several of them fire at once, so they are coalesced into one
  // pass on the next frame rather than thrashing layout per image.
  let relayoutQueued = false;
  const relayout = () => {
    if (relayoutQueued) return;
    relayoutQueued = true;
    requestAnimationFrame(() => {
      relayoutQueued = false;
      layout();
      measure();
    });
  };
  window.addEventListener('load', relayout);
  for (const image of $$('img')) {
    if (!image.complete) image.addEventListener('load', relayout, { once: true });
  }
  if ('fonts' in document) document.fonts.ready.then(relayout).catch(() => {});
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stage.stop();
    else if (state.entered) stage.start();
  });

  $('#enter').addEventListener('click', () => enter(true));
  $('#enter-quiet').addEventListener('click', () => enter(false));
  $('#btn-sound').addEventListener('click', () => {
    const on = score.toggle();
    if (on) score.setCue(sceneState(state.progress).cue);
    $('#btn-sound').setAttribute('aria-pressed', String(on));
  });

  requestAnimationFrame(frame);
  watchBlast();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }

  // The page must be readable with the film off, so the sections are visible
  // from the start and the canvas only ever adds to them.
  document.body.dataset.reduced = String(reduced);
  document.body.dataset.agents = String(AGENTS.length);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
