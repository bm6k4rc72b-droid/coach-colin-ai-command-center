/* ══════════════════════════════════════════════════════════════
   PRISM · engine — intent routing and the live model link

   Two ways a mission can be answered:

   LOCAL  (default, always available, works offline)
          Deterministic composers in compose.js. No key, no network,
          no cost. Genuinely useful structured output.

   LIVE   (opt-in, Settings → Live Link)
          Streams a real Claude response through the Messages API,
          shaped by the same mission brief. Two transports:
            · proxy  — you POST to your own endpoint; no key in the
                       browser. This is the one to use.
            · direct — key held in this browser only. Personal
                       devices only; anyone with the machine can
                       read it out of local storage.
   ══════════════════════════════════════════════════════════════ */

P.engine = (function () {
  'use strict';

  const U = P.util, S = P.store;

  const API_URL = 'https://api.anthropic.com/v1/messages';
  const API_VERSION = '2023-06-01';
  const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

  /* ══════════════════════════════════════════════════════════
     Intent routing — the beam
     ══════════════════════════════════════════════════════════ */

  /* Keywords that pull a phrase toward a mission. Weighted: an exact
     agent name is decisive, a topic word is a nudge. */
  /* Signals are matched as substrings, so stems ("automat", "refram")
     deliberately catch every inflection. Multi-word phrases score far
     higher than single words, and the words in WEAK are so common
     across missions that on their own they barely count. */
  const SIGNALS = {
    'atlas/arc90':      ['90 day', 'ninety day', 'next 3 months', 'next three months', 'quarter', 'roadmap', 'strategy', 'big goal', 'where do i start'],
    'atlas/week':       ['this week', 'my week', 'shape my week', 'plan my week', 'weekly plan', 'prioritis', 'prioritiz', 'schedule'],
    'atlas/cut':        ['too much', 'overwhelm', 'stop doing', 'cut list', 'spread thin', 'doing everything', 'burn'],

    'verse/hooks':      ['hook', 'caption', 'write a post', 'content idea', 'reel about', 'post about', 'instagram', 'tiktok'],
    'verse/script':     ['script', 'video', 'film', 'talk to camera', 'sixty second', '60 second'],
    'verse/repurpose':  ['repurpos', 'reuse', 'turn this into', 'across channels', 'newsletter version', 'more out of'],

    'forge/block':      ['programme', 'program', 'training plan', 'training programme', 'training program',
                        'workout', 'split', 'training block', 'sets and reps', 'lifting'],
    'forge/swap':       ['swap', 'alternativ', 'substitut', 'missed session', 'gym is packed', 'session rescue', 'too sore'],
    'forge/onboard':    ['beginner', 'new client', 'first four weeks', 'onboard', 'never trained', 'nervous'],

    'echo/reply':       ['reply', 'respond', 'what do i say', 'they asked', 'asked my price', 'asked how much',
                        'how much do you charge', 'enquir', 'inquir', 'dm me', 'a message', 'i froze'],
    'echo/faq':         ['front desk', 'questions i get', 'phone script', 'same questions', 'faq'],
    'echo/objection':   ['objection', 'too expensive', 'think about it', 'cannot afford', 'no money', 'ask my partner', 'say no'],

    'ledger/stack':     ['offer', 'package', 'tiers', 'three tiers', 'pricing', 'stack'],
    'ledger/truehourly':['hourly', 'per hour', 'underpaid', 'what i earn', 'my rate', 'worth my time'],
    'ledger/raise':     ['raise my price', 'price rise', 'increase price', 'prices up', 'charge more', 'put my prices'],

    'pulse/checkin':    ['check in', 'check-in', 'checkin', 'weekly message', 'how are they doing'],
    'pulse/winback':    ['win back', 'winback', 'ghost', 'went quiet', 'gone quiet', 'laps', 'stopped coming', 'drift', 'disappear'],
    'pulse/risk':       ['churn', 'quitting', 'about to quit', 'retention', 'at risk', 'losing clients', 'my roster'],

    'scout/sweep':      ['find clients', 'find new clients', 'more clients', 'where to find', 'get clients', 'lead'],
    'scout/opener':     ['cold', 'outreach', 'first message', 'reach out', 'approach them'],
    'scout/referral':   ['referral', 'refer', 'word of mouth', 'recommend'],

    'muse/reframe':     ['mindset', 'stuck', 'motivation', 'fail', 'discipline', 'negativ', 'refram', 'always quit', 'hate how'],
    'muse/hard':        ['difficult conversation', 'hard conversation', 'confront', 'awkward', 'fire a client', 'let a client go', 'dreading'],
    'muse/why':         ['real reason', 'real why', 'goal setting', 'what they really want', 'dig deeper', 'underneath'],

    'cipher/funnel':    ['funnel', 'conversion', 'not converting', 'analytics', 'my numbers', 'metrics'],
    'cipher/target':    ['how many clients', 'income goal', 'work backwards', 'need to earn', 'want to earn', 'to make 5k', 'for 5k'],
    'cipher/retention': ['lifetime value', 'ltv', 'how long do clients stay', 'retention math', 'worth per client'],

    'relay/blueprint':  ['automat', 'workflow', 'zapier', 'a system for', 'every week by hand', 'chore', 'do this manually'],
    'relay/intake':     ['intake', 'sign up process', 'signup process', 'welcome sequence', 'new client process', 'onboarding flow'],
    'relay/audit':      ['where does my time go', 'time leak', 'no time left', 'time audit', 'week disappears']
  };

  /* Words common enough to appear in half the missions — on their own
     they are noise, and letting them score highly is how "automate my
     weekly chore" ends up at the week planner. */
  const WEAK = ['week', 'time', 'busy', 'plan', 'post', 'script', 'goal', 'message', 'price',
                'lead', 'video', 'offer', 'refer', 'cold', 'stuck', 'split'];

  /**
   * Does `sig` occur in `q` at a word boundary?
   * Single words match as prefixes so stems ("automat") catch every
   * inflection; multi-word phrases must end on a boundary too, or
   * "my week" swallows "my weekly".
   */
  /* Below this, a match is one incidental word rather than intent. */
  const MIN_SCORE = 6;

  function hasSignal(q, sig) {
    const multi = sig.indexOf(' ') !== -1;
    let from = 0, idx;
    while ((idx = q.indexOf(sig, from)) !== -1) {
      const startOk = !/[a-z0-9]/.test(q.charAt(idx - 1));
      // Tolerate a plural on the last word: "90 day" should match "90 days".
      const endOk = !multi || /^s?(?![a-z0-9])/.test(q.slice(idx + sig.length));
      if (startOk && endOk) return true;
      from = idx + 1;
    }
    return false;
  }

  /** Score a phrase against every mission; return the best matches. */
  function route(text) {
    const q = ' ' + String(text || '').toLowerCase().trim() + ' ';
    if (!q.trim()) return [];

    const open = P.progress.unlockedIds();
    const scores = [];

    for (const key in SIGNALS) {
      const [agentId, missionId] = key.split('/');
      const agent = P.agents.byId[agentId];
      const mission = P.agents.findMission(agentId, missionId);
      if (!agent || !mission) continue;

      let score = 0;

      // Explicit agent name wins outright.
      if (q.indexOf(' ' + agentId + ' ') !== -1) score += 40;

      // Mission title words.
      mission.title.toLowerCase().split(/\W+/).filter(w => w.length > 3).forEach(w => {
        if (hasSignal(q, w)) score += WEAK.indexOf(w) !== -1 ? 1 : 6;
      });

      // Signal phrases — a multi-word phrase is far stronger evidence
      // than a single word that half the roster could claim.
      SIGNALS[key].forEach(sig => {
        if (!hasSignal(q, sig)) return;
        const words = sig.split(' ').length;
        if (words > 1) score += 12 + words * 3;
        else score += WEAK.indexOf(sig) !== -1 ? 2 : 8;
      });

      if (score > 0) {
        scores.push({
          agentId, missionId, agent, mission, score,
          locked: open.indexOf(agentId) === -1
        });
      }
    }

    // A single weak word is not a match. Without a floor, one point of
    // noise from a common title word outranks a locked mission that
    // scored sixteen, and the beam sends people somewhere useless.
    const strong = scores.filter(x => x.score >= MIN_SCORE);

    // Unlocked matches sort ahead of locked ones so the beam prefers an
    // answer it can actually deliver; callers still see the locked ones.
    strong.sort((a, b) => (a.locked - b.locked) || (b.score - a.score));
    return strong.slice(0, 4);
  }

  /* Beam suggestions, each tagged with where it routes, so the deck
     only ever offers phrases the player can actually follow. */
  const HINTS = [
    { q: 'write me a reel hook about protein',        a: 'verse' },
    { q: 'plan my next 90 days',                      a: 'atlas' },
    { q: 'someone asked my price and I froze',        a: 'echo' },
    { q: 'my week is a mess, help me shape it',       a: 'atlas' },
    { q: 'script a 60 second video',                  a: 'verse' },
    { q: 'build me a 3 day training programme',       a: 'forge' },
    { q: 'they said it is too expensive',             a: 'echo' },
    { q: 'turn my service into three tiers',          a: 'ledger' },
    { q: 'a client went quiet',                       a: 'pulse' },
    { q: 'where do I find new clients',               a: 'scout' },
    { q: 'how many clients do I need for 5k',         a: 'cipher' },
    { q: 'automate the thing I do every week',        a: 'relay' },
    { q: 'a client says they always fail',            a: 'muse' }
  ];

  /** Three beam examples that route to agents this player has. */
  function hints(seed) {
    const open = P.progress.unlockedIds();
    const usable = HINTS.filter(h => open.indexOf(h.a) !== -1);
    return U.sample(usable.length >= 3 ? usable : HINTS, 3, U.rng(seed || 'hints'));
  }

  /**
   * Guess which field the free text should land in — normally the
   * first text-ish field, so the beam pre-fills something useful.
   */
  function prefill(mission, text) {
    const out = {};
    const target = mission.fields.find(f => f.type === 'text' || f.type === 'area');
    if (target) out[target.k] = String(text || '').trim();
    return out;
  }

  /* ══════════════════════════════════════════════════════════
     Live link — Claude Messages API
     ══════════════════════════════════════════════════════════ */

  const linkReady = () => {
    const p = S.get().prefs;
    if (!p.liveLink) return false;
    return p.linkMode === 'proxy' ? !!p.endpoint : !!p.apiKey;
  };

  /** The brief the model is answering — mirrors the local composer's job. */
  function systemPrompt(agent, mission) {
    return [
      'You are ' + agent.name + ', one facet of PRISM — a command deck used by a working coach.',
      'Your remit: ' + agent.role + '. ' + agent.line,
      '',
      'You are running the mission "' + mission.title + '".',
      'What the user must walk away with: ' + mission.gives,
      '',
      'Rules:',
      '- Hand over a finished artefact, not a conversation. No "let me know if you want me to expand".',
      '- Be specific. Named numbers, real sentences they can send, actual days of the week.',
      '- British English. Plain words. No corporate register, no hype, no emoji.',
      '- Never invent facts about the user\'s business beyond what they gave you.',
      '- If something they said is a bad idea, say so once, briefly, then do the work anyway.',
      '',
      'Format your reply using ONLY these markers, and nothing else:',
      '  ## SECTION HEADING        — starts a section',
      '  - **Lead in** — the detail   — a step or list item',
      '  > A single highlighted line  — a callout',
      '  = Label | Value | note       — a statistic tile',
      '  # tag, tag, tag              — a row of short tags',
      '  Plain paragraphs are fine on their own line.',
      'Do not use any other markdown. Do not wrap the reply in a code fence.'
    ].join('\n');
  }

  function userPrompt(mission, inputs, mod) {
    const lines = mission.fields.map(f => {
      const v = inputs[f.k];
      return '- ' + f.label + ': ' + (v === undefined || v === '' ? '(not given)' : v);
    });
    const mods = {
      shorter:  'Make this noticeably shorter than you otherwise would. Cut to what they would actually use.',
      bolder:   'Take a stronger line. Fewer hedges, more opinion, commit to a recommendation.',
      specific: 'Replace every vague noun with a concrete one. Add numbers, names and days.',
      angle:    'Rebuild this from a completely different angle than the obvious one.'
    };
    return 'Brief:\n' + lines.join('\n') + (mod ? '\n\nAdjustment: ' + mods[mod] : '');
  }

  /* ── markdown-ish → PRISM blocks ──────────────────────────── */

  function parse(text) {
    const blocks = [];
    let section = null;

    const flush = () => {
      if (section && section.items && section.items.length) blocks.push(section);
      section = null;
    };

    String(text || '').split('\n').forEach(raw => {
      const line = raw.trim();
      if (!line) return;

      // ## SECTION
      let m = line.match(/^#{2,}\s*(.+)$/);
      if (m) { flush(); section = { t: 'steps', h: m[1].trim(), items: [] }; return; }

      // # tag, tag
      m = line.match(/^#\s+(.+)$/);
      if (m) {
        flush();
        blocks.push({ t: 'tags', h: 'Tags', items: m[1].split(',').map(s => s.trim()).filter(Boolean) });
        return;
      }

      // > callout
      m = line.match(/^>\s*(.+)$/);
      if (m) { flush(); blocks.push({ t: 'quote', h: '', text: m[1].trim() }); return; }

      // = Label | Value | note
      m = line.match(/^=\s*(.+)$/);
      if (m) {
        const parts = m[1].split('|').map(s => s.trim());
        const last = blocks[blocks.length - 1];
        const tile = { k: parts[0] || '', v: parts[1] || '', n: parts[2] || '' };
        if (last && last.t === 'stats') last.items.push(tile);
        else { flush(); blocks.push({ t: 'stats', h: 'Numbers', items: [tile] }); }
        return;
      }

      // - **Lead** — detail   /  - plain item
      m = line.match(/^[-*•]\s*(.+)$/);
      if (m) {
        const body = m[1].trim();
        const lead = body.match(/^\*\*(.+?)\*\*\s*[—:–-]?\s*(.*)$/);
        if (!section) section = { t: 'steps', h: '', items: [] };
        if (lead) section.items.push({ b: lead[1].trim(), text: lead[2].trim() || '—' });
        else section.items.push({ b: '', text: body.replace(/\*\*/g, '') });
        return;
      }

      // plain paragraph
      flush();
      blocks.push({ t: 'note', text: line.replace(/\*\*/g, '') });
    });

    flush();

    // A steps block with no leads reads better as a list.
    return blocks.map(b => {
      if (b.t === 'steps' && b.items.every(it => !it.b)) {
        return { t: 'list', h: b.h, items: b.items.map(it => it.text) };
      }
      return b;
    });
  }

  /* ── the request ──────────────────────────────────────────── */

  function buildBody(agent, mission, inputs, mod) {
    const prefs = S.get().prefs;
    return {
      model: prefs.model || 'claude-opus-5',
      max_tokens: 64000,
      stream: true,
      system: systemPrompt(agent, mission),
      messages: [{ role: 'user', content: userPrompt(mission, inputs, mod) }],
      // Adaptive thinking is the current API; budget_tokens is rejected on Opus 5.
      thinking: { type: 'adaptive', display: 'summarized' },
      // Chat-weight work — effort high is the default and overkill here.
      output_config: { effort: 'medium' },
      // Opus 5 can decline; let the server re-run on a fallback rather than
      // handing the user a refusal they cannot act on.
      fallbacks: 'default'
    };
  }

  function headers() {
    const prefs = S.get().prefs;
    const h = { 'content-type': 'application/json' };
    if (prefs.linkMode === 'direct') {
      h['x-api-key'] = prefs.apiKey;
      h['anthropic-version'] = API_VERSION;
      h['anthropic-beta'] = FALLBACK_BETA;
      // Required for browser-origin calls; see the Live Link warning in Settings.
      h['anthropic-dangerous-direct-browser-access'] = 'true';
    }
    return h;
  }

  /**
   * Stream a live response.
   * @param {object}   opts.agent
   * @param {object}   opts.mission
   * @param {object}   opts.inputs
   * @param {string}   [opts.mod]
   * @param {function} opts.onText     partial answer text
   * @param {function} opts.onThinking partial reasoning summary
   * @param {AbortSignal} [opts.signal]
   * @returns {Promise<{doc:object, refused:boolean}>}
   */
  async function live(opts) {
    const prefs = S.get().prefs;
    const url = prefs.linkMode === 'proxy' ? prefs.endpoint : API_URL;
    const body = buildBody(opts.agent, opts.mission, opts.inputs, opts.mod);

    const res = await fetch(url, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
      signal: opts.signal
    });

    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).error.message; } catch (_) { detail = res.statusText; }
      throw new Error('Live link failed (' + res.status + '): ' + detail);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    let buffer = '';
    let answer = '';
    let thinking = '';
    let stopReason = null;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() || '';

      for (const chunk of chunks) {
        const dataLine = chunk.split('\n').find(l => l.startsWith('data:'));
        if (!dataLine) continue;

        let ev;
        try { ev = JSON.parse(dataLine.slice(5).trim()); } catch (_) { continue; }

        if (ev.type === 'content_block_delta') {
          if (ev.delta.type === 'text_delta') {
            answer += ev.delta.text;
            opts.onText && opts.onText(answer);
          } else if (ev.delta.type === 'thinking_delta') {
            thinking += ev.delta.thinking || '';
            opts.onThinking && opts.onThinking(thinking);
          }
        } else if (ev.type === 'message_delta' && ev.delta && ev.delta.stop_reason) {
          stopReason = ev.delta.stop_reason;
        } else if (ev.type === 'error') {
          throw new Error((ev.error && ev.error.message) || 'Stream error');
        }
      }
    }

    // Check stop_reason before trusting the content — a refusal can arrive
    // with an empty body, or mid-stream after partial output.
    if (stopReason === 'refusal') {
      return {
        refused: true,
        doc: {
          title: opts.mission.title,
          subtitle: 'Declined',
          blocks: [{ t: 'note', text: 'The model declined this request and the fallback chain declined it too. Rephrase the brief, or run it locally — the local composer is always available.' }]
        }
      };
    }

    const blocks = parse(answer);
    return {
      refused: false,
      thinking,
      doc: {
        title: opts.mission.title,
        subtitle: opts.agent.name + ' · live',
        live: true,
        blocks: blocks.length ? blocks : [{ t: 'note', text: answer || 'Empty response.' }]
      }
    };
  }

  /* ══════════════════════════════════════════════════════════
     One entry point the UI calls
     ══════════════════════════════════════════════════════════ */

  /**
   * Produce a document for a mission, live if the link is up and
   * healthy, local otherwise. Never throws — a failed live call
   * degrades to the local composer with a note explaining why.
   */
  async function produce(agentId, missionId, inputs, opts) {
    const o = opts || {};
    const agent = P.agents.byId[agentId];
    const mission = P.agents.findMission(agentId, missionId);

    if (!agent || !mission) {
      return { doc: P.compose.run(agentId, missionId, inputs, o.mod), live: false };
    }

    if (linkReady()) {
      try {
        const res = await live({
          agent, mission, inputs, mod: o.mod,
          onText: o.onText, onThinking: o.onThinking, signal: o.signal
        });
        return { doc: res.doc, live: !res.refused, refused: res.refused };
      } catch (err) {
        if (err.name === 'AbortError') throw err;
        const doc = P.compose.run(agentId, missionId, inputs, o.mod);
        doc.blocks.unshift({
          t: 'note',
          text: 'Live link did not answer (' + err.message + '), so this is the local composer. Nothing is lost — check Settings → Live Link.'
        });
        return { doc, live: false, failed: err.message };
      }
    }

    return { doc: P.compose.run(agentId, missionId, inputs, o.mod), live: false };
  }

  return { route, prefill, produce, live, parse, linkReady, systemPrompt, hints, SIGNALS, HINTS, MIN_SCORE };
})();
