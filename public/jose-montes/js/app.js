/**
 * The site, assembled.
 *
 * Everything else in this folder is a part that can be tested on its own —
 * the scroll maths, the geometry, the mortgage arithmetic, the concierge's
 * grammar, the gesture tracker. This module is the wiring: it builds the DOM
 * that depends on data, starts the renderer and the choreographer, and
 * routes what the concierge decides into what the page does.
 *
 * Nothing here is required for the page to be readable. If WebGL is missing
 * the hero falls back to a gradient; if speech is missing the typed field
 * carries the concierge; if the camera is refused everything else continues.
 *
 * @module jose-montes/app
 */

import { AGENT, LISTINGS, money, pricePerSqft, selectListings, specLine } from './listings.js';
import { affordablePrice, equityAfter, ownershipCost } from './finance.js';
import { parseRequest, respond } from './concierge.js';
import { Director } from './reveal.js';
import { Stage } from './stage.js';
import { Score } from './score.js';
import { Ears, Voice } from './voice.js';
import { AirScroll } from './airscroll.js';
import { clamp } from './mathkit.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const state = {
  filter: 'all',
  listing: LISTINGS[0],
  rate: 0.0625,
  entered: false,
};

const score = new Score();
const voice = new Voice();
const stage = new Stage($('#stage'));
let director = null;
let ears = null;
let air = null;

/* --- small helpers ----------------------------------------------------- */

/**
 * Flash a message at the top of the screen.
 *
 * @param {string} text What to say.
 * @param {number} [ms] How long to leave it up.
 */
function toast(text, ms = 3600) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('is-up');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('is-up'), ms);
}

/**
 * Add a line to the concierge transcript.
 *
 * @param {string} text The line.
 * @param {'you'|'her'} who Who said it.
 */
function say(text, who) {
  if (!text) return;
  const el = document.createElement('p');
  el.className = `line ${who}`;
  el.textContent = text;
  const transcript = $('#transcript');
  transcript.append(el);
  while (transcript.children.length > 6) transcript.firstElementChild.remove();
  transcript.scrollTop = transcript.scrollHeight;
  // Show it, then let it rest, so the console never sits on top of the page
  // the visitor is actually trying to read.
  transcript.classList.remove('is-resting');
  clearTimeout(say.timer);
  say.timer = setTimeout(() => transcript.classList.add('is-resting'), 11000);
}

/* --- the portfolio ----------------------------------------------------- */

/**
 * Render the listing grid for the current filter.
 */
function renderGrid() {
  const grid = $('#listing-grid');
  const rows = selectListings(LISTINGS, { status: state.filter, sort: 'newest' });
  grid.innerHTML = '';
  for (const listing of rows) {
    const cost = ownershipCost({ price: listing.price, downPct: 0.2, rate: state.rate });
    const card = document.createElement('article');
    card.className = 'card';
    card.id = `card-${listing.id}`;
    card.dataset.reveal = '';
    card.innerHTML = `
      <div class="card-media">
        <img src="./media/${listing.plate}.avif" alt="${listing.address}, ${listing.city}" loading="lazy">
        <span class="card-status ${listing.status}">${listing.tag}</span>
      </div>
      <div class="card-body">
        <span class="card-city">${listing.city}</span>
        <h3>${listing.address}</h3>
        <p class="card-price">${money(listing.price)}</p>
        <p class="card-spec">${specLine(listing)} · ${money(pricePerSqft(listing), true)}/sqft</p>
        <p class="card-blurb">${listing.blurb}</p>
        <div class="card-foot">
          <span class="card-monthly">≈ ${money(cost.total, true)}/mo</span>
          <button class="btn small" type="button" data-listing="${listing.id}">Details</button>
        </div>
      </div>`;
    grid.append(card);
  }
  director?.register();
}

/**
 * Focus one listing: scroll to its card, mark it, load it into the maths.
 *
 * @param {string} id Listing id.
 */
function focusListing(id) {
  const listing = LISTINGS.find((l) => l.id === id);
  if (!listing) return;
  state.listing = listing;
  if (state.filter !== 'all' && listing.status !== state.filter) {
    state.filter = 'all';
    $$('#filters .chip').forEach((chip) => chip.classList.toggle('is-on', chip.dataset.filter === 'all'));
    renderGrid();
  }
  $$('.card').forEach((card) => card.classList.remove('is-focus'));
  const card = $(`#card-${id}`);
  if (card) {
    card.classList.add('is-focus');
    card.scrollIntoView({ behavior: director?.reduced ? 'auto' : 'smooth', block: 'center' });
  }
  const select = $('#calc-listing');
  if (select) { select.value = id; loadListingIntoCalc(listing); }
}

/* --- the calculator ---------------------------------------------------- */

/**
 * Read the sliders.
 *
 * @returns {{ price: number, downPct: number, rate: number, years: number }} The scenario.
 */
function readCalc() {
  return {
    price: Number($('#calc-price').value),
    downPct: Number($('#calc-down').value) / 100,
    rate: Number($('#calc-rate').value) / 10000,
    years: Number($('#calc-term').value),
  };
}

/**
 * Recompute and redraw the payment panel.
 */
function renderCalc() {
  const input = readCalc();
  state.rate = input.rate;
  const cost = ownershipCost(input);
  const equity = equityAfter({ ...input, years: 7 });

  $('#calc-price-out').textContent = money(input.price);
  $('#calc-down-out').textContent = `${Math.round(input.downPct * 100)}% · ${money(cost.down)}`;
  $('#calc-rate-out').textContent = `${(input.rate * 100).toFixed(2)}%`;
  $('#calc-term-out').textContent = `${input.years} yr`;
  $('#calc-total').textContent = money(cost.total, true);

  const parts = [
    ['Loan (principal + interest)', cost.principalInterest, 'var(--gold)'],
    ['County property tax', cost.tax, 'var(--cyan)'],
    ['Insurance', cost.insurance, '#8f7bd8'],
    ['Mortgage insurance', cost.pmi, 'var(--magenta)'],
  ].filter(([, value]) => value > 0.5);

  $('#calc-breakdown').innerHTML = parts
    .map(([label, value]) => `<li><span>${label}</span><b>${money(value, true)}</b></li>`)
    .join('');
  $('#calc-bar').innerHTML = parts
    .map(([, value, color]) => `<i style="width:${(value / cost.total) * 100}%;background:${color}"></i>`)
    .join('');

  const afford = affordablePrice({ budget: cost.total, downPct: input.downPct, rate: input.rate, years: input.years });
  $('#calc-equity').textContent =
    `Held seven years at 4% appreciation, that position is worth about ${money(equity.equity)} — `
    + `${money(equity.gained)} of it appreciation, ${money(equity.paidDown)} of it loan paid down. `
    + `The same monthly figure supports about ${money(afford)} of purchase price.`;

  const signature = ownershipCost({ price: LISTINGS[0].price, downPct: 0.2, rate: state.rate });
  const line = $('#signature-payment');
  if (line) {
    line.textContent = `About ${money(signature.total, true)} a month all in at ${(state.rate * 100).toFixed(2)}% with 20% down — see the breakdown below.`;
  }
}

/**
 * Point the calculator at a listing.
 *
 * @param {object} listing The listing.
 */
function loadListingIntoCalc(listing) {
  const slider = $('#calc-price');
  slider.value = String(clamp(listing.price, Number(slider.min), Number(slider.max)));
  renderCalc();
}

/* --- the concierge ----------------------------------------------------- */

/**
 * Handle one request end to end: parse, answer, speak, act.
 *
 * @param {string} text What the visitor said or typed.
 */
function ask(text) {
  if (!text?.trim()) return;
  say(text, 'you');
  const request = parseRequest(text);
  const reply = respond(request, { listing: state.listing, rate: state.rate });

  if (reply.say) {
    say(reply.say, 'her');
    voice.speak(reply.say);
  }

  const action = reply.action;
  if (!action) return;
  switch (action.type) {
    case 'goto': director?.goto(action.value); break;
    case 'scroll': director?.nudge(action.value); break;
    case 'focus': focusListing(action.value); break;
    case 'stop': voice.cancel(); break;
    case 'audio':
      if (action.value === 'on') score.start(); else score.stop();
      $('#btn-sound').setAttribute('aria-pressed', String(score.running));
      break;
    case 'gesture': toggleCamera(true); break;
    default: break;
  }
}

/* --- the camera -------------------------------------------------------- */

/**
 * Turn hand scrolling on or off.
 *
 * @param {boolean} [force] Force a particular state.
 */
async function toggleCamera(force) {
  if (!air) {
    air = new AirScroll(
      { video: $('#camera-video'), overlay: $('#camera-overlay') },
      ({ active, present }) => {
        $('#camera').hidden = !active;
        $('#btn-gesture').setAttribute('aria-pressed', String(active));
        const badge = $('#camera-badge');
        badge.textContent = present ? 'tracking' : 'looking for a hand';
        badge.classList.toggle('is-tracking', present);
      },
    );
  }
  const wantOn = force ?? !air.active;
  if (!wantOn) { air.stop(); return; }
  const result = await air.start();
  if (!result.ok) toast(result.error, 6000);
  else toast('Hand scrolling on. Move a hand up or down.', 5000);
}

/* --- boot -------------------------------------------------------------- */

/**
 * Build the parts of the DOM that come from data.
 */
function buildDynamic() {
  renderGrid();

  const options = LISTINGS
    .map((l) => `<option value="${l.id}">${l.address} — ${l.city} (${money(l.price)})</option>`)
    .join('');
  $('#calc-listing').innerHTML = options;
  $('#contact-listing').innerHTML = `<option value="">No particular property yet</option>${options}`;

  const nav = $('#chapters');
  $$('[data-chapter]').forEach((section, i) => {
    const button = document.createElement('button');
    button.className = 'chapter-dot';
    button.type = 'button';
    button.textContent = section.dataset.chapter;
    button.dataset.index = String(i);
    button.addEventListener('click', () => director?.goto(section.id));
    nav.append(button);
  });
}

/**
 * Wire every control on the page.
 */
function bind() {
  $('#filters').addEventListener('click', (event) => {
    const chip = event.target.closest('.chip');
    if (!chip) return;
    state.filter = chip.dataset.filter;
    $$('#filters .chip').forEach((c) => c.classList.toggle('is-on', c === chip));
    renderGrid();
  });

  $('#listing-grid').addEventListener('click', (event) => {
    const button = event.target.closest('[data-listing]');
    if (!button) return;
    const listing = LISTINGS.find((l) => l.id === button.dataset.listing);
    focusListing(button.dataset.listing);
    director?.goto('numbers');
    const line = `${listing.address}. ${money(listing.price)}, ${specLine(listing)}. I have put it into the payment panel.`;
    say(line, 'her');
    voice.speak(line);
  });

  $$('#calc-price, #calc-down, #calc-rate, #calc-term').forEach((input) => {
    input.addEventListener('input', renderCalc);
  });
  $('#calc-listing').addEventListener('change', (event) => {
    const listing = LISTINGS.find((l) => l.id === event.target.value);
    if (listing) { state.listing = listing; loadListingIntoCalc(listing); }
  });

  $('#ask-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = $('#ask');
    ask(input.value);
    input.value = '';
  });

  $$('[data-ask]').forEach((button) => {
    button.addEventListener('click', () => ask(button.dataset.ask));
  });

  $('#btn-sound').addEventListener('click', () => {
    const on = score.toggle();
    $('#btn-sound').setAttribute('aria-pressed', String(on));
    toast(on ? 'Music on.' : 'Music off.', 1800);
  });

  $('#btn-gesture').addEventListener('click', () => toggleCamera());
  $('#camera-close').addEventListener('click', () => toggleCamera(false));

  $('#contact-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(event.target);
    if (!data.get('name') || !data.get('reach')) {
      $('#contact-status').textContent = 'A name and a way to reach you, and it is done.';
      return;
    }
    try {
      const saved = JSON.parse(localStorage.getItem('jm-requests') || '[]');
      saved.push({ ...Object.fromEntries(data), at: new Date().toISOString() });
      localStorage.setItem('jm-requests', JSON.stringify(saved.slice(-20)));
    } catch { /* private mode; the message below is still true */ }
    $('#contact-status').textContent = `Thank you, ${data.get('name')}. In the real thing this reaches ${AGENT.name} directly; here it stays on your device.`;
    const line = `Thank you. ${AGENT.name} will call you himself, usually the same day.`;
    say(line, 'her');
    voice.speak(line);
    score.chime(1174);
    event.target.reset();
  });

  // Pointer and tilt lean on the hologram.
  window.addEventListener('pointermove', (event) => {
    stage.setPointer((event.clientX / window.innerWidth) * 2 - 1, (event.clientY / window.innerHeight) * 2 - 1);
  }, { passive: true });
  window.addEventListener('deviceorientation', (event) => {
    if (event.gamma == null) return;
    stage.setTilt(clamp(event.gamma / 45, -1, 1), clamp(((event.beta || 45) - 45) / 45, -1, 1));
  }, { passive: true });

  window.addEventListener('resize', () => stage.resize());

  // The keyboard is the third way in, beside voice and touch.
  window.addEventListener('keydown', (event) => {
    if (event.target.matches('input, textarea, select')) return;
    if (event.key === 'm') $('#btn-sound').click();
    if (event.key === 'h') $('#btn-gesture').click();
    if (event.key === '/') { event.preventDefault(); $('#ask').focus(); }
  });
}

/**
 * Upgrade a plate to its full-resolution original when the network allows.
 *
 * The committed AVIF is small enough to paint instantly and good enough to
 * stand alone offline; the original is the movie-resolution render. It is
 * swapped in only after it has decoded, so a slow or blocked connection can
 * never leave a hole where a photograph should be.
 */
function upgradePlates() {
  const connection = navigator.connection;
  if (connection?.saveData) return;
  if (connection?.effectiveType && /2g/.test(connection.effectiveType)) return;
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const img = entry.target;
      observer.unobserve(img);
      const hi = img.dataset.hi;
      if (!hi) continue;
      const full = new Image();
      full.decoding = 'async';
      full.onload = () => { img.src = hi; img.classList.add('is-hi'); };
      full.src = hi;
    }
  }, { rootMargin: '400px' });
  $$('img[data-hi]').forEach((img) => observer.observe(img));
}

/**
 * Start the renderer and the choreographer.
 */
function startMotion() {
  director = new Director({
    onPin: (id, t) => {
      if (id === 'hero') {
        stage.setProgress(t);
        const build = $('#ro-build');
        if (build) build.textContent = `${Math.round(t * 100)}%`;
      }
      if (id === 'signature') {
        const orbit = $('#ro-orbit');
        if (orbit) orbit.textContent = `${Math.round(-35 + t * 70)}°`;
        const build = $('#ro-build');
        if (build) build.textContent = `${Math.round(60 + t * 40)}%`;
      }
    },
    onProgress: (progress, chapter) => {
      $$('.chapter-dot').forEach((dot, i) => dot.classList.toggle('is-on', i === chapter));
    },
  });
  director.register();
  director.start();

  if (stage.start()) {
    $('#stage').classList.add('is-live');
    let last = performance.now();
    const loop = (now) => {
      requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      stage.render(dt);
    };
    requestAnimationFrame(loop);
  }
}

/**
 * Open the gate and, if asked, bring up the sound.
 *
 * @param {boolean} withSound Whether to start the score.
 */
function enter(withSound) {
  if (state.entered) return;
  state.entered = true;
  document.body.classList.remove('is-gated');
  $('#gate').classList.add('is-gone');
  setTimeout(() => { $('#gate').hidden = true; }, 1000);

  if (withSound && Score.supported) {
    score.start();
    $('#btn-sound').setAttribute('aria-pressed', 'true');
  }

  // Speaking must follow the gesture too, or iOS silently drops the first line.
  const greeting = `Welcome. I am ${AGENT.name}'s concierge. Ask me about any property, what it would cost you a month, or say "book a tour".`;
  setTimeout(() => {
    say(greeting, 'her');
    if (withSound) voice.speak(greeting);
  }, 700);
}

/**
 * Boot.
 */
function main() {
  document.body.classList.add('is-gated');
  buildDynamic();
  bind();
  renderCalc();
  startMotion();
  upgradePlates();

  $('#enter').addEventListener('click', () => enter(true));
  $('#enter-quiet').addEventListener('click', () => enter(false));

  // The score ducks under the concierge so she is never talking over music.
  voice.onStart = () => score.duck(true);
  voice.onEnd = () => score.duck(false);

  ears = new Ears((text, final) => {
    const input = $('#ask');
    input.value = text;
    if (!final) return;
    input.value = '';
    ask(text);
  });
  ears.onState = (live) => $('#btn-mic').classList.toggle('is-live', live);
  $('#btn-mic').addEventListener('click', () => {
    if (!ears.supported) {
      toast('This browser has no speech recognition — type to the concierge instead. Safari and Chrome both listen.', 6000);
      $('#ask').focus();
      return;
    }
    ears.toggle();
  });

  // The end-to-end harness drives the real page rather than a mock, so it
  // needs a handle on the live objects. Read-only from the site's point of
  // view: nothing here is used by the page itself.
  window.__jm = { stage, director, ask, state, score, voice };

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* offline is a bonus, not a requirement */ });
  }
}

main();
