/**
 * The seven decks.
 *
 * Each renderer fills the side panel for one deck and takes the same console
 * context: the hall, the receptionist, the feeds, the learner's record and a
 * few helpers. Keeping them in one module means the navigation, the voice
 * grammar and the lesson links all address the same surfaces.
 *
 * @module nexus/decks
 */

import { TRACKS, allLessons, findLesson } from './curriculum.js';
import { ACHIEVEMENTS, RANKS } from './progress.js';
import { LABS, findLab } from './labs/index.js';
import { Lens } from './camera.js';
import { SOURCES } from './feeds.js';
import { AGENTS, run as runSwarm } from './swarm.js';
import { ago, el, fill, pct } from './dom.js';
import { readSettings, writeSettings } from './mentor.js';

/**
 * Atrium — where a visitor lands: who Aether is, what state everything is in,
 * and one tap into each part of the console.
 *
 * @param {HTMLElement} body Panel body.
 * @param {object} ctx Console context.
 */
export function renderAtrium(body, ctx) {
  const snap = ctx.progress.snapshot();
  const health = ctx.feeds.health();

  fill(body, [
    el('div.card', {}, [
      el('h3', { text: 'Aether — resident instructor' }),
      el('p.dim', { text: 'Ask me anything in the syllabus, or tell me where to go: “open the phishing range”, “show me the globe”, “teach me about prompt injection”. Hold the microphone to speak.' }),
    ]),
    el('div.tiles', {}, [
      el('div.tile', {}, [el('b', { text: snap.rank.clearance }), el('span', { text: `${snap.rank.name} · ${snap.xp} XP` }),
        el('div.bar', {}, [el('i', { style: { width: pct(snap.rank.progress) } })])]),
      el('div.tile', {}, [el('b', { text: `${snap.lessonsDone}/${snap.lessonsTotal}` }), el('span', { text: 'lessons' }),
        el('div.bar', {}, [el('i', { style: { width: pct(snap.completion) } })])]),
      el('div.tile', {}, [el('b', { text: String(snap.streak) }), el('span', { text: 'day streak' })]),
      el('div.tile', {}, [el('b', { text: `${health.live}/${health.total}` }), el('span', { text: 'feeds live' })]),
    ]),
    el('p.label', { text: 'Where to start' }),
    ...TRACKS.map((track) => el('div.card.click.track-card', {
      style: { '--accent': track.accent },
      onclick: () => ctx.go('academy', { track: track.id }),
    }, [
      el('h3', { text: track.title }),
      el('p.dim', { text: track.tagline }),
      el('span.meta', { text: `${track.modules.length} modules · ${track.modules.reduce((n, m) => n + m.lessons.length, 0)} lessons` }),
    ])),
    el('p.label', { text: 'Fast routes' }),
    el('div.row', {}, [
      el('button.btn', { type: 'button', onclick: () => ctx.go('labs', { lab: 'phishing' }) }, ['Phishing drill']),
      el('button.btn', { type: 'button', onclick: () => ctx.go('labs', { lab: 'scanner' }) }, ['Scan a QR code']),
      el('button.btn', { type: 'button', onclick: () => ctx.go('ops') }, ['Live picture']),
      el('button.btn', { type: 'button', onclick: () => ctx.go('swarm') }, ['Run the swarm']),
    ]),
    el('p.label', { text: 'Citations' }),
    el('div.chips', {}, ACHIEVEMENTS.map((a) => el('span.chip', {
      class: snap.achievements.includes(a.id) ? 'on' : '',
      title: a.note,
    }, [a.name]))),
  ]);
}

/**
 * Academy — track list, module list, lesson reader, module check.
 *
 * @param {HTMLElement} body Panel body.
 * @param {object} ctx Console context.
 * @param {{ track?: string, module?: string, lesson?: string, quiz?: string }} [state] Where to open.
 */
export function renderAcademy(body, ctx, state = {}) {
  if (state.lesson) return renderLesson(body, ctx, state.lesson);
  if (state.quiz) return renderQuiz(body, ctx, state.quiz);

  const snap = ctx.progress.snapshot();
  if (!state.track) {
    return fill(body, [
      el('p.dim', { text: 'Three tracks. Every lesson ends with a check, and the ranges are where the reading gets tested against something that pushes back.' }),
      ...TRACKS.map((track) => {
        const lessons = track.modules.flatMap((m) => m.lessons.map((l) => `${track.id}/${m.id}/${l.id}`));
        const done = lessons.filter((k) => snap.lessons[k]).length;
        return el('div.card.click.track-card', {
          style: { '--accent': track.accent },
          onclick: () => ctx.go('academy', { track: track.id }),
        }, [
          el('h3', { text: track.title }),
          el('p.dim', { text: track.tagline }),
          el('span.meta', { text: `${done} of ${lessons.length} complete` }),
          el('div.bar', {}, [el('i', { style: { width: pct(done / lessons.length) } })]),
        ]);
      }),
    ]);
  }

  const track = TRACKS.find((t) => t.id === state.track);
  if (!track) return renderAcademy(body, ctx, {});

  return fill(body, [
    el('button.btn', { type: 'button', onclick: () => ctx.go('academy') }, ['← All tracks']),
    el('h3', { text: track.title, style: { marginTop: '14px' } }),
    el('p.dim', { text: track.tagline }),
    ...track.modules.map((mod) => {
      const quizBest = snap.quizzes[mod.id];
      return el('div.card', {}, [
        el('h3', { text: mod.title }),
        el('span.meta', { text: `${mod.minutes} min · ${mod.lessons.length} lessons${quizBest ? ` · check ${quizBest.correct}/${quizBest.total}` : ''}` }),
        ...mod.lessons.map((lesson) => {
          const key = `${track.id}/${mod.id}/${lesson.id}`;
          const done = Boolean(snap.lessons[key]);
          return el('button.quiz-opt', {
            type: 'button',
            onclick: () => ctx.go('academy', { lesson: key }),
          }, [`${done ? '✓ ' : '· '}${lesson.title}`]);
        }),
        el('button.btn.primary', {
          type: 'button',
          style: { marginTop: '8px' },
          onclick: () => ctx.go('academy', { quiz: `${track.id}/${mod.id}` }),
        }, ['Take the check']),
      ]);
    }),
  ]);
}

/**
 * Render one lesson.
 *
 * @param {HTMLElement} body Panel body.
 * @param {object} ctx Console context.
 * @param {string} key Lesson key.
 */
function renderLesson(body, ctx, key) {
  const entry = findLesson(key);
  if (!entry) return renderAcademy(body, ctx, {});
  const lessons = allLessons();
  const position = lessons.findIndex((l) => l.key === key);
  const next = lessons[position + 1];

  const nodes = [
    el('button.btn', { type: 'button', onclick: () => ctx.go('academy', { track: entry.track.id }) }, ['← ' + entry.track.title]),
    el('h3', { text: entry.lesson.title, style: { marginTop: '14px' } }),
    el('span.meta', { text: `${entry.track.title} · ${entry.module.title}` }),
    el('div.lesson-body', {}, entry.lesson.body.map((p) => el('p', { text: p }))),
  ];
  if (entry.lesson.code) {
    nodes.push(el('p.label', { text: entry.lesson.code.lang }));
    nodes.push(el('pre.code', {}, [el('code', { text: entry.lesson.code.text })]));
  }
  nodes.push(el('p.label', { text: 'Key points' }));
  nodes.push(el('ul.keypoints', {}, entry.lesson.keyPoints.map((p) => el('li', { text: p }))));

  const actions = [
    el('button.btn.primary', {
      type: 'button',
      onclick: () => {
        const first = ctx.progress.completeLesson(key);
        ctx.toast(first ? 'Lesson logged. +30 XP' : 'Already logged.');
        if (next) ctx.go('academy', { lesson: next.key });
        else ctx.go('academy', { quiz: `${entry.track.id}/${entry.module.id}` });
      },
    }, [next ? 'Mark done, next lesson' : 'Mark done']),
    el('button.btn', {
      type: 'button',
      onclick: () => ctx.speakLesson(entry),
    }, ['Read it to me']),
  ];
  if (entry.lesson.lab) {
    actions.push(el('button.btn', {
      type: 'button',
      onclick: () => ctx.go('labs', { lab: entry.lesson.lab }),
    }, [`Open the ${findLab(entry.lesson.lab)?.name || 'range'}`]));
  }
  nodes.push(el('div.row', {}, actions));
  fill(body, nodes);
}

/**
 * Render a module check.
 *
 * @param {HTMLElement} body Panel body.
 * @param {object} ctx Console context.
 * @param {string} key `track/module`.
 */
function renderQuiz(body, ctx, key) {
  const [trackId, moduleId] = key.split('/');
  const track = TRACKS.find((t) => t.id === trackId);
  const mod = track?.modules.find((m) => m.id === moduleId);
  if (!mod) return renderAcademy(body, ctx, {});

  const answers = new Map();
  const nodes = [
    el('button.btn', { type: 'button', onclick: () => ctx.go('academy', { track: trackId }) }, ['← ' + track.title]),
    el('h3', { text: `Check — ${mod.title}`, style: { marginTop: '14px' } }),
    el('p.dim', { text: 'One attempt per question. The explanation appears either way, because a right answer for the wrong reason is worth catching too.' }),
  ];

  for (const [i, question] of mod.quiz.entries()) {
    const box = el('div.quiz-q');
    const why = el('p.why', { text: question.why, style: { display: 'none' } });
    const buttons = question.options.map((option, index) => el('button.quiz-opt', {
      type: 'button',
      onclick: () => {
        if (answers.has(i)) return;
        answers.set(i, index);
        buttons.forEach((btn, bi) => {
          if (bi === question.answer) btn.classList.add('right');
          else if (bi === index) btn.classList.add('wrong');
        });
        why.style.display = '';
        ctx.tone(index === question.answer ? 'confirm' : 'deny');
        if (answers.size === mod.quiz.length) finish();
      },
    }, [option]));
    fill(box, [el('h4', { text: `${i + 1}. ${question.q}` }), ...buttons, why]);
    nodes.push(box);
  }

  const result = el('div.card', { style: { display: 'none' } });
  nodes.push(result);
  fill(body, nodes);

  /** Score the check once every question has been answered. */
  function finish() {
    let correct = 0;
    for (const [i, given] of answers) if (given === mod.quiz[i].answer) correct += 1;
    ctx.progress.recordQuiz(mod.id, correct, mod.quiz.length);
    result.style.display = '';
    fill(result, [
      el('h3', { text: `${correct} of ${mod.quiz.length}` }),
      el('p', {
        text: correct === mod.quiz.length
          ? 'Full marks. Take it to a range — the ranges are where this stops being reading.'
          : correct / mod.quiz.length >= 0.6
            ? 'Passed. Re-read the explanations you got wrong; they are the ones that will cost you later.'
            : 'Worth another pass through the module. Nothing is lost by re-reading it.',
      }),
      el('button.btn.primary', { type: 'button', onclick: () => ctx.go('academy', { track: trackId }) }, ['Back to the track']),
    ]);
    ctx.speak(`${correct} of ${mod.quiz.length}.`);
  }
}

/**
 * Ranges — the six interactive labs.
 *
 * @param {HTMLElement} body Panel body.
 * @param {object} ctx Console context.
 * @param {{ lab?: string }} [state] Which lab to mount.
 */
export function renderLabs(body, ctx, state = {}) {
  if (ctx.activeLab) {
    ctx.activeLab.destroy?.();
    ctx.activeLab = null;
  }
  if (state.lab) {
    const lab = findLab(state.lab);
    if (lab) {
      const host = el('div');
      fill(body, [
        el('button.btn', { type: 'button', onclick: () => ctx.go('labs') }, ['← All ranges']),
        host,
      ]);
      ctx.activeLab = lab.mount(host, ctx);
      return;
    }
  }
  const snap = ctx.progress.snapshot();
  fill(body, [
    el('p.dim', { text: 'Six ranges. Each one is the graded half of a lesson — real analysis, real crypto, real camera, nothing scripted.' }),
    ...LABS.map((lab) => {
      const best = snap.labs[lab.id];
      return el('div.card.click', { onclick: () => ctx.go('labs', { lab: lab.id }) }, [
        el('h3', { text: lab.name }),
        el('p.dim', { text: lab.blurb }),
        el('span.meta', { text: best ? `best ${Math.round(best.score)} · ${ago(best.at)}` : 'not yet attempted' }),
      ]);
    }),
  ]);
}

/**
 * Ops — the live picture.
 *
 * @param {HTMLElement} body Panel body.
 * @param {object} ctx Console context.
 */
export function renderOps(body, ctx) {
  const health = ctx.feeds.health();
  const nodes = [
    el('div.row', {}, [
      el('button.btn.primary', { type: 'button', onclick: () => ctx.setView(ctx.hall?.state.mode === 'globe' ? 'avatar' : 'globe') }, ['Toggle globe']),
      el('button.btn', { type: 'button', onclick: async () => { ctx.toast('Refreshing every source…'); await ctx.feeds.refreshAll(); ctx.render(); } }, ['Refresh all']),
      el('button.btn', {
        type: 'button',
        onclick: async () => {
          const where = await ctx.feeds.useDeviceLocation();
          ctx.toast(`Air traffic centred on ${where.label}`);
          ctx.render();
        },
      }, ['Use my location']),
    ]),
    el('p.dim.small', {
      text: `Air traffic is centred on ${ctx.feeds.context.label}. Sources marked SIM are synthetic — the console says so rather than showing you a plausible fiction.`,
    }),
    el('div.tiles', {}, [
      el('div.tile', {}, [el('b', { text: String(health.live) }), el('span', { text: 'live' })]),
      el('div.tile', {}, [el('b', { text: String(health.cached) }), el('span', { text: 'cached' })]),
      el('div.tile', {}, [el('b', { text: String(health.sim) }), el('span', { text: 'simulated' })]),
    ]),
  ];

  for (const source of SOURCES) {
    const entry = ctx.feeds.state.get(source.id);
    nodes.push(el('div.source-head', {}, [
      el('h3', { text: source.label }),
      el('span.chip-status', { class: entry?.status || 'idle', text: (entry?.status || 'idle').toUpperCase() }),
      el('button.mini', { type: 'button', onclick: async () => { await ctx.feeds.refresh(source.id); ctx.render(); } }, ['↻']),
    ]));
    const items = (entry?.items || []).slice(0, 6);
    if (!items.length) {
      nodes.push(el('p.dim.small', { text: 'No data yet.' }));
    } else {
      for (const item of items) {
        nodes.push(el('div.feed-item', {}, [
          el('span.feed-dot', { class: item.category || source.category }),
          el('div', {}, [
            el('b', { text: item.title }),
            el('span.sub', { text: item.detail || '' }),
          ]),
          el('span.when', { text: ago(item.at) }),
        ]));
      }
    }
    nodes.push(el('p.dim.small', { text: `Source: ${source.attribution}` }));
  }

  nodes.push(el('p.dim.small', {
    style: { marginTop: '18px' },
    text: 'Situational awareness for a training console, not an operational picture. Public feeds lag, drop and disagree; nothing here should be used to make a decision that matters.',
  }));
  fill(body, nodes);
}

/**
 * Lens — the device camera, with a heads-up overlay.
 *
 * @param {HTMLElement} body Panel body.
 * @param {object} ctx Console context.
 */
export function renderLens(body, ctx) {
  const video = el('video.lens-video', { playsinline: '', muted: '', autoplay: '' });
  const hud = el('canvas');
  const status = el('p.dim', { text: Lens.supported ? 'Camera idle. Nothing is recorded, and no frame leaves this device.' : 'This browser exposes no camera API.' });
  const readout = el('div.lens-readout');
  const lens = ctx.lens;
  lens.video = video;
  let raf = null;
  let greeted = false;

  /** Draw the overlay and run the on-device analysis. */
  const draw = () => {
    if (!lens.active) return;
    const rect = hud.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    hud.width = Math.max(1, rect.width * dpr);
    hud.height = Math.max(1, rect.height * dpr);
    const g = hud.getContext('2d');
    g.clearRect(0, 0, hud.width, hud.height);
    g.scale(dpr, dpr);

    const motion = lens.motionEnergy();
    const light = lens.ambientLight();
    const w = rect.width;
    const h = rect.height;

    // Corner brackets and a horizon rule — a HUD, not a filter.
    g.strokeStyle = 'rgba(90,216,255,0.65)';
    g.lineWidth = 1.5;
    const m = 14;
    const c = 26;
    for (const [x, y, dx, dy] of [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]]) {
      g.beginPath();
      g.moveTo(x, y + dy * c);
      g.lineTo(x, y);
      g.lineTo(x + dx * c, y);
      g.stroke();
    }
    g.strokeStyle = 'rgba(216,180,90,0.35)';
    g.beginPath();
    g.moveTo(m, h / 2);
    g.lineTo(w - m, h / 2);
    g.stroke();

    // Motion bar.
    g.fillStyle = 'rgba(90,216,255,0.85)';
    g.fillRect(m, h - m - 4, Math.min(w - m * 2, motion * (w - m * 2)), 3);
    g.font = '10px ui-monospace, monospace';
    g.fillStyle = 'rgba(200,225,240,0.85)';
    g.fillText(`PRESENCE ${(motion * 100).toFixed(0)}%   LUMA ${(light.luma * 100).toFixed(0)}%   ${lens.facing === 'user' ? 'FRONT' : 'REAR'}`, m, h - m - 10);

    fill(readout, [
      el('div.tile', {}, [el('b', { text: `${(motion * 100).toFixed(0)}%` }), el('span', { text: 'presence' })]),
      el('div.tile', {}, [el('b', { text: `${(light.luma * 100).toFixed(0)}%` }), el('span', { text: 'scene light' })]),
      el('div.tile', {}, [el('b', { text: lens.facing === 'user' ? 'FRONT' : 'REAR' }), el('span', { text: 'camera' })]),
    ]);

    // The receptionist notices somebody arriving, once.
    if (!greeted && motion > 0.35) {
      greeted = true;
      ctx.speak('I see you. Point the rear camera at a QR code and I will pull the destination apart before you follow it.');
      ctx.tone('arrive');
    }
    // Tint the hologram toward the light in the visitor's room.
    ctx.hall?.setAmplitude(Math.min(0.5, motion));
    raf = requestAnimationFrame(draw);
  };

  fill(body, [
    el('p.dim', { text: 'Front and rear camera, on iPhone and Android. Everything below — presence detection, ambient light, capture, code scanning — runs on this device. No frame is uploaded or stored.' }),
    el('div.lens-wrap', {}, [video, el('div.lens-hud', {}, [hud])]),
    el('div.row', {}, [
      el('button.btn.primary', {
        type: 'button',
        onclick: async () => {
          const result = await lens.start(lens.facing);
          status.textContent = result.ok ? `Live — ${result.label}` : result.error;
          if (result.ok) { draw(); ctx.tone('confirm'); } else ctx.tone('deny');
        },
      }, ['Start camera']),
      el('button.btn', { type: 'button', onclick: async () => { await lens.flip(); greeted = false; } }, ['Flip']),
      el('button.btn', {
        type: 'button',
        onclick: async () => {
          const on = await lens.toggleTorch();
          ctx.toast(lens.hasTorch ? `Torch ${on ? 'on' : 'off'}` : 'This camera exposes no torch control.');
        },
      }, ['Torch']),
      el('button.btn', {
        type: 'button',
        onclick: () => {
          const shot = lens.capture();
          if (!shot) return ctx.toast('Nothing to capture yet.');
          const link = el('a', { href: shot, download: `nexus-${Date.now()}.jpg` });
          link.click();
          ctx.toast('Frame saved to this device.');
        },
      }, ['Capture']),
      el('button.btn', {
        type: 'button',
        onclick: () => { cancelAnimationFrame(raf); lens.stop(); status.textContent = 'Camera idle.'; },
      }, ['Stop']),
    ]),
    status,
    readout,
    el('div.row', {}, [
      el('button.btn', { type: 'button', onclick: () => ctx.go('labs', { lab: 'scanner' }) }, ['Open the code scanner']),
      el('button.btn', {
        type: 'button',
        onclick: async () => {
          const ok = await ctx.hall?.enableMotion();
          ctx.toast(ok ? 'Gyroscope parallax on — tilt the phone.' : 'Motion access refused or unavailable.');
        },
      }, ['Tilt to look around']),
    ]),
    el('p.dim.small', {
      text: 'Presence detection is a frame-difference on a 64-pixel-wide copy — enough to notice somebody arrive, far too coarse to identify anyone. That is deliberate.',
    }),
  ]);

  return () => { cancelAnimationFrame(raf); lens.stop(); };
}

/**
 * Swarm — the multi-agent orchestrator with its orbit display.
 *
 * @param {HTMLElement} body Panel body.
 * @param {object} ctx Console context.
 */
export function renderSwarm(body, ctx) {
  const goal = el('input.field', {
    type: 'text',
    placeholder: 'Give the swarm a goal…',
    value: 'Explain prompt injection and tell me what is happening in the sky right now',
    'aria-label': 'Swarm goal',
  });
  const orbit = el('div.orbit', {}, [el('div.orbit-ring')]);
  const trace = el('div.trace-list');
  const answer = el('div.card', { style: { display: 'none' } });

  const nodes = new Map();
  AGENTS.forEach((agent, i) => {
    const angle = (i / AGENTS.length) * Math.PI * 2 - Math.PI / 2;
    const node = el('div.agent-node', {
      style: {
        color: agent.colour,
        left: `${50 + Math.cos(angle) * 38}%`,
        top: `${50 + Math.sin(angle) * 38}%`,
      },
      title: `${agent.role} Tools: ${agent.tools.join(', ') || 'none'}`,
    }, [el('i'), agent.name]);
    nodes.set(agent.id, node);
    orbit.append(node);
  });

  /** Run the swarm against the current goal. */
  const go = async () => {
    fill(trace, []);
    answer.style.display = 'none';
    for (const node of nodes.values()) node.className = 'agent-node';
    ctx.tone('tap');
    const result = await runSwarm(goal.value, {
      feeds: ctx.feeds,
      onEvent: (event) => {
        if (event.type === 'start') nodes.get(event.node.agent)?.classList.add('busy');
        if (event.type === 'done') {
          const node = nodes.get(event.node.agent);
          node?.classList.remove('busy');
          node?.classList.add(event.denied ? 'denied' : 'done');
          trace.append(el('div.trace-line', { class: event.denied ? 'denied' : '' }, [
            el('b', { text: event.node.agent }),
            el('span', { text: `${event.node.label} — ${event.result.summary}` }),
          ]));
        }
      },
    });
    answer.style.display = '';
    fill(answer, [
      el('h3', { text: 'Answer' }),
      el('p', { text: result.answer }),
      ...result.detail.slice(0, 6).map((line) => el('p.dim.small', { text: typeof line === 'string' ? line : JSON.stringify(line) })),
      el('p.label', { text: 'Critic' }),
      el('p.dim', { text: result.review }),
    ]);
    ctx.speak(result.answer);
  };

  fill(body, [
    el('p.dim', { text: 'Six specialists, one task graph. Independent tasks run in parallel; each agent can only call the tools on its own allowlist, and that list is enforced in code — try telling the Scholar to read the feeds and watch it refuse.' }),
    goal,
    el('button.btn.primary.wide', { type: 'button', onclick: go }, ['Run the swarm']),
    orbit,
    el('p.label', { text: 'Trace' }),
    trace,
    answer,
    el('p.label', { text: 'Roster' }),
    ...AGENTS.map((agent) => el('div.feed-item', {}, [
      el('span.feed-dot', { style: { background: agent.colour } }),
      el('div', {}, [
        el('b', { text: agent.name }),
        el('span.sub', { text: `${agent.role} Tools: ${agent.tools.join(', ') || 'none'}` }),
      ]),
    ])),
  ]);
}

/**
 * Settings — model connection, voice, data and the honest small print.
 *
 * @param {HTMLElement} body Panel body.
 * @param {object} ctx Console context.
 */
export function renderSettings(body, ctx) {
  const settings = readSettings();
  const provider = el('select.field', {}, [
    el('option', { value: 'anthropic', selected: settings.provider === 'anthropic' }, ['Anthropic (Claude)']),
    el('option', { value: 'openai', selected: settings.provider === 'openai' }, ['OpenAI-compatible']),
  ]);
  const model = el('input.field', { type: 'text', value: settings.model, placeholder: 'model id' });
  const key = el('input.field', { type: 'password', value: settings.key, placeholder: 'API key — stored only in this browser' });
  const endpoint = el('input.field', { type: 'text', value: settings.endpoint, placeholder: 'custom endpoint (optional)' });

  const voiceSelect = el('select.field', {}, [
    el('option', { value: '' }, ['Automatic — best available female voice']),
    ...ctx.voice.voices().map((v) => el('option', {
      value: v.name,
      selected: ctx.voice.voice?.name === v.name,
    }, [`${v.name} (${v.lang})`])),
  ]);
  voiceSelect.addEventListener('change', () => {
    if (voiceSelect.value) ctx.voice.setVoice(voiceSelect.value);
    ctx.speak('This is how I will sound.');
  });

  const snap = ctx.progress.snapshot();

  fill(body, [
    el('p.label', { text: 'Language model (optional)' }),
    el('p.dim.small', { text: 'Without a key the console answers from its own syllabus index — offline, cited, and the default. A key lets Aether reason beyond the lessons.' }),
    provider, model, key, endpoint,
    el('div.row', {}, [
      el('button.btn.primary', {
        type: 'button',
        onclick: () => {
          writeSettings({
            provider: provider.value,
            model: model.value.trim(),
            key: key.value.trim(),
            endpoint: endpoint.value.trim(),
          });
          ctx.toast(key.value.trim() ? 'Model connected for this browser.' : 'Key cleared — back to the local syllabus.');
          ctx.updateStatus();
        },
      }, ['Save']),
      el('button.btn', {
        type: 'button',
        onclick: () => { writeSettings({ key: '' }); key.value = ''; ctx.toast('Key removed.'); ctx.updateStatus(); },
      }, ['Forget key']),
    ]),
    el('p.dim.small', {
      text: 'A key in a browser is readable by anything running in this page — that is a property of browsers, not of this console. Use a scoped, revocable key, or leave it empty and keep the local brain.',
    }),

    el('p.label', { text: 'Voice' }),
    voiceSelect,
    el('div.row', {}, [
      el('button.btn', { type: 'button', onclick: () => ctx.speak('Aether online. Where would you like to start?') }, ['Test voice']),
      el('button.btn', { type: 'button', onclick: () => ctx.toggleMute() }, ['Mute / unmute']),
    ]),
    el('p.dim.small', {
      text: ctx.voice.canListen
        ? 'Speech recognition is available in this browser. Hold the microphone button to talk.'
        : 'This browser has no speech recognition (Firefox, and some in-app browsers). Typing does everything speaking does.',
    }),

    el('p.label', { text: 'Your record' }),
    el('div.tiles', {}, [
      el('div.tile', {}, [el('b', { text: String(snap.xp) }), el('span', { text: 'XP' })]),
      el('div.tile', {}, [el('b', { text: snap.rank.name }), el('span', { text: 'rank' })]),
      el('div.tile', {}, [el('b', { text: `${snap.lessonsDone}/${snap.lessonsTotal}` }), el('span', { text: 'lessons' })]),
    ]),
    el('div.row', {}, [
      el('button.btn', {
        type: 'button',
        onclick: () => {
          const blob = new Blob([ctx.progress.export()], { type: 'application/json' });
          const link = el('a', { href: URL.createObjectURL(blob), download: 'nexus-progress.json' });
          link.click();
          ctx.toast('Record exported.');
        },
      }, ['Export']),
      el('button.btn', {
        type: 'button',
        onclick: () => {
          const input = el('input', { type: 'file', accept: 'application/json' });
          input.addEventListener('change', async () => {
            const file = input.files?.[0];
            if (!file) return;
            const ok = ctx.progress.import(await file.text());
            ctx.toast(ok ? 'Record restored.' : 'That file was not a Nexus export.');
            ctx.render();
          });
          input.click();
        },
      }, ['Import']),
      el('button.btn.danger', {
        type: 'button',
        onclick: () => {
          if (confirm('Erase all progress on this device? This cannot be undone.')) {
            ctx.progress.reset();
            ctx.toast('Record erased.');
            ctx.render();
          }
        },
      }, ['Erase']),
    ]),

    el('p.label', { text: 'Rank ladder' }),
    ...RANKS.map((rank) => el('div.feed-item', {}, [
      el('span.feed-dot', { class: snap.xp >= rank.at ? 'station' : 'satellite' }),
      el('div', {}, [el('b', { text: `${rank.name} — ${rank.clearance}` }), el('span.sub', { text: `${rank.at} XP` })]),
    ])),

    el('p.label', { text: 'What this is' }),
    el('p.dim.small', { text: 'AETHER NEXUS is a training console. It runs entirely in your browser: the syllabus, the labs, the grading and your record never leave the device, and there is no account and no backend. Live feeds are fetched directly from their public sources by your browser.' }),
    el('p.dim.small', { text: 'Feeds: USGS (seismic), adsb.lol (air traffic), The Space Devs Launch Library 2 (launches), wheretheiss.at (orbital), NOAA SWPC (space weather), FIRST.org EPSS (vulnerability exploitation). Each is credited on the Ops deck.' }),
    el('p.dim.small', { text: 'The security material is defensive: it teaches how attacks work so they can be recognised and stopped. The ranges simulate attacks against fictional targets and produce no tooling that works against a real system.' }),
  ]);
}
