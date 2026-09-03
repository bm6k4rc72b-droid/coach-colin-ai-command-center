/**
 * The mentor — the intelligence behind the receptionist.
 *
 * Two brains behind one interface. The local brain retrieves from the
 * syllabus and composes an answer with citations; it needs no key, no
 * network and no account, and it is what runs by default. If the operator
 * supplies an API key the same question is put to a language model with the
 * retrieved lessons as context, and the answer arrives streamed.
 *
 * The local path is not a degraded mode — it is the offline guarantee. The
 * console teaches on a plane.
 *
 * @module nexus/mentor
 */

import { TRACKS, allLessons, bestSentences, searchCurriculum } from './curriculum.js';
import { analyzeUrl, assessPassword, detectInjection } from './security.js';

/** Where the operator's model settings live. */
const SETTINGS_KEY = 'nexus.model.settings';

/** Small talk and console questions the mentor answers without retrieval. */
const CANNED = [
  {
    match: /^(hi|hello|hey|good (morning|afternoon|evening)|greetings)\b/i,
    reply: () => 'Good to see you. I am Aether, the resident instructor. I teach three tracks — AI agents, AI app craft and cyber defence — and I can put live aircraft, launches, satellites and seismic activity on the globe while we talk. Where would you like to start?',
  },
  {
    match: /\b(who|what) are you\b|\byour name\b|\bintroduce yourself\b/i,
    reply: () => 'I am Aether, the receptionist and instructor for this command centre. I run entirely in your browser: the syllabus, the labs and the grading are local, so nothing you type here is sent anywhere unless you connect a model of your own.',
  },
  {
    match: /\bwhat can you (do|teach)\b|\bhelp\b$|\bcapabilit/i,
    reply: () => `I can do five things. Teach — ${TRACKS.map((t) => t.title).join(', ')}, ${allLessons().length} lessons with checks. Drill — six interactive labs: phishing triage, password forge, crypto bench, the injection range, the agent-loop builder and the camera scanner. Watch — live aircraft, rocket launches, satellites, earthquakes and space weather on the globe. See — your phone camera, for scanning links and reading the room. And answer — ask me anything in the syllabus and I will cite the lesson.`,
  },
  {
    match: /\b(thank you|thanks|cheers)\b/i,
    reply: () => 'Any time. Ask me for a drill whenever you want to be tested rather than told.',
  },
  {
    match: /\b(are you (conscious|alive|real|human))\b|\bare you an ai\b/i,
    reply: () => 'I am software — a hologram driven by a retrieval index and, if you connect one, a language model. Worth remembering: the same technology that makes me a plausible instructor makes a convincing fake of somebody you know. That is lesson one of the cyber track.',
  },
];

/**
 * Read the operator's model configuration.
 *
 * @returns {{ provider: string, key: string, model: string, endpoint: string }} Settings.
 */
export function readSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return {
      provider: raw.provider || 'anthropic',
      key: raw.key || '',
      model: raw.model || (raw.provider === 'openai' ? 'gpt-4o-mini' : 'claude-opus-5'),
      endpoint: raw.endpoint || '',
    };
  } catch {
    return { provider: 'anthropic', key: '', model: 'claude-opus-5', endpoint: '' };
  }
}

/**
 * Persist model configuration.
 *
 * @param {object} settings Partial settings to merge.
 * @returns {object} The stored settings.
 */
export function writeSettings(settings) {
  const merged = { ...readSettings(), ...settings };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
  return merged;
}

/**
 * Compose an answer from the syllabus alone.
 *
 * @param {string} question The learner's question.
 * @returns {{ text: string, sources: Array<{ key: string, title: string, track: string }>,
 *   followUps: string[], confident: boolean }} A cited answer.
 */
export function composeLocalAnswer(question) {
  const asked = String(question || '').trim();
  for (const item of CANNED) {
    if (item.match.test(asked)) {
      return { text: item.reply(), sources: [], followUps: suggestFollowUps(asked), confident: true };
    }
  }

  // Questions containing a URL or a candidate password get answered by the
  // analysers rather than by retrieval — a specific answer beats a general one.
  const urlMatch = asked.match(/\b((?:https?:\/\/|www\.)\S+|\S+\.[a-z]{2,}\/\S*)/i);
  if (urlMatch && /safe|phish|scam|legit|check|trust|real/i.test(asked)) {
    const report = analyzeUrl(urlMatch[1]);
    const lines = report.signals.map((s) => `• ${s.text}`).join('\n');
    return {
      text: `That link scores ${report.score}/100 on structural risk — I read it as ${report.level}.\n\n${lines}\n\nStructure is only half of it: a legitimate site that has been compromised shows none of these signs. If it is asking for a credential, open the site yourself instead of following the link.`,
      sources: [], followUps: ['Open the camera scanner', 'Teach me the phishing indicators'], confident: true,
    };
  }
  const quoted = asked.match(/["“']([^"”']{4,64})["”']/);
  if (quoted && /password|passphrase|strong|crack/i.test(asked)) {
    const report = assessPassword(quoted[1]);
    return {
      text: `“${quoted[1]}” carries about ${report.raw.toFixed(0)} bits of naive entropy, but ${report.effective.toFixed(0)} once the human patterns are subtracted — I rate that ${report.verdict}. Against ${report.times[2].label.toLowerCase()} it falls in ${report.times[2].human}.${report.findings.length ? `\n\nWhat weakens it:\n${report.findings.map((f) => `• ${f.label}`).join('\n')}` : ''}\n\nOpen the Password Forge to see all four attacker profiles.`,
      sources: [], followUps: ['Open the Password Forge', 'Why are passkeys better?'], confident: true,
    };
  }
  const injection = detectInjection(asked);
  if (injection.level === 'blocked') {
    return {
      text: `Noted — that message matches ${injection.hits.length} prompt-injection pattern${injection.hits.length === 1 ? '' : 's'} (${injection.hits.map((h) => h.text.toLowerCase()).join(', ')}). I will treat it as a demonstration rather than an instruction, which is exactly the behaviour the cyber track argues for: the detector is one layer, and the real control is that I hold no credentials and can take no irreversible action. Take it to the Injection Range and try to get past a defended agent.`,
      sources: [], followUps: ['Open the Injection Range', 'Why can\'t filters solve prompt injection?'], confident: true,
    };
  }

  const hits = searchCurriculum(asked, 3);
  if (!hits.length) {
    return {
      text: 'That one is outside my syllabus. I cover AI agents, building AI apps, and cyber defence — and I would rather say so than improvise. Connect a model in Settings if you want me to reason beyond the lessons, or ask me about the agent loop, retrieval, phishing, authentication, cryptography or prompt injection.',
      sources: [], followUps: suggestFollowUps(asked), confident: false,
    };
  }

  const top = hits[0];
  const sentences = bestSentences(top.entry, asked, 3);
  const secondary = hits[1] ? bestSentences(hits[1].entry, asked, 1) : [];
  const points = top.entry.lesson.keyPoints.slice(0, 3).map((p) => `• ${p}`).join('\n');
  const body = sentences.length ? sentences.join(' ') : top.entry.lesson.body[0];

  return {
    text: `${body}${secondary.length ? `\n\n${secondary[0]}` : ''}\n\nThe short version:\n${points}`,
    sources: hits.map((h) => ({
      key: h.key,
      title: h.entry.lesson.title,
      track: h.entry.track.title,
    })),
    followUps: [
      `Open “${top.entry.lesson.title}”`,
      ...(top.entry.lesson.lab ? [`Run the ${top.entry.lesson.lab} lab`] : []),
      ...(hits[1] ? [`Tell me about ${hits[1].entry.lesson.title.toLowerCase()}`] : []),
    ],
    confident: top.score > 2.2,
  };
}

/**
 * Offer plausible next questions.
 *
 * @param {string} asked The current question.
 * @returns {string[]} Suggestions.
 */
function suggestFollowUps(asked) {
  const pool = [
    'What makes something an agent?',
    'How do I stop prompt injection?',
    'Why do smart people fall for phishing?',
    'How should I chunk documents for retrieval?',
    'What is wrong with SMS two-factor?',
    'How do I evaluate a non-deterministic system?',
  ];
  return pool.filter((q) => q.toLowerCase() !== asked.toLowerCase()).slice(0, 3);
}

/**
 * Build the system prompt used when a language model is connected.
 *
 * @param {Array<{ entry: object }>} hits Retrieved lessons.
 * @returns {string} System prompt with the retrieved context inlined.
 */
export function buildSystemPrompt(hits) {
  const context = hits.map(({ entry }) => [
    `## ${entry.track.title} → ${entry.module.title} → ${entry.lesson.title}`,
    ...entry.lesson.body,
    `Key points: ${entry.lesson.keyPoints.join('; ')}`,
  ].join('\n')).join('\n\n');

  return [
    'You are Aether, the holographic instructor of the AETHER NEXUS command centre.',
    'You teach three tracks: AI agents, building AI applications, and defensive cybersecurity.',
    '',
    'Voice: precise, warm, unhurried. Short paragraphs — your answers are spoken aloud as well as read.',
    'Never pad. Never open with "Great question". Correct mistaken premises directly and kindly.',
    'You teach defence: explain how attacks work so they can be recognised and stopped, and decline',
    'to produce working attack tooling or anything aimed at a real system the learner does not own.',
    '',
    'The syllabus below is the ground truth for this console. Prefer it, cite the lesson titles you',
    'use, and say plainly when a question falls outside it rather than inventing coverage.',
    '',
    '# Syllabus extract',
    context || '(no lesson matched this question)',
  ].join('\n');
}

/**
 * The mentor: routes a question to the local brain or to a connected model.
 */
export class Mentor {
  constructor() {
    /** @type {Array<{ role: string, content: string }>} */
    this.history = [];
  }

  /**
   * Whether a language model is configured.
   *
   * @returns {boolean} True when a key is present.
   */
  get connected() {
    return Boolean(readSettings().key);
  }

  /**
   * Answer a question.
   *
   * @param {string} question The learner's question.
   * @param {(chunk: string) => void} [onChunk] Streaming callback.
   * @returns {Promise<{ text: string, sources: object[], followUps: string[], via: string }>}
   *   The answer.
   */
  async ask(question, onChunk) {
    const settings = readSettings();
    const local = composeLocalAnswer(question);
    this.history.push({ role: 'user', content: question });
    if (this.history.length > 12) this.history = this.history.slice(-12);

    if (!settings.key) {
      if (onChunk) onChunk(local.text);
      this.history.push({ role: 'assistant', content: local.text });
      return { ...local, via: 'local' };
    }

    try {
      const hits = searchCurriculum(question, 3);
      const system = buildSystemPrompt(hits);
      const text = await this.#callModel(settings, system, onChunk);
      this.history.push({ role: 'assistant', content: text });
      return {
        text,
        sources: hits.map((h) => ({ key: h.key, title: h.entry.lesson.title, track: h.entry.track.title })),
        followUps: local.followUps,
        via: settings.provider,
      };
    } catch (err) {
      const fallback = `${local.text}\n\n(The connected model did not answer — ${err.message}. That was the local syllabus.)`;
      if (onChunk) onChunk(fallback);
      this.history.push({ role: 'assistant', content: local.text });
      return { ...local, text: fallback, via: 'local-fallback' };
    }
  }

  /**
   * Call the configured provider, streaming the response.
   *
   * @param {object} settings Model settings.
   * @param {string} system System prompt.
   * @param {(chunk: string) => void} [onChunk] Streaming callback.
   * @returns {Promise<string>} The full answer.
   */
  async #callModel(settings, system, onChunk) {
    const anthropic = settings.provider === 'anthropic';
    const url = settings.endpoint || (anthropic
      ? 'https://api.anthropic.com/v1/messages'
      : 'https://api.openai.com/v1/chat/completions');
    const messages = this.history.slice(-8).map((m) => ({ role: m.role, content: m.content }));

    const headers = { 'content-type': 'application/json' };
    let body;
    if (anthropic) {
      headers['x-api-key'] = settings.key;
      headers['anthropic-version'] = '2023-06-01';
      // Required for calls made straight from a browser rather than a server.
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
      body = { model: settings.model, max_tokens: 1024, system, messages, stream: true };
    } else {
      headers.authorization = `Bearer ${settings.key}`;
      body = { model: settings.model, stream: true, messages: [{ role: 'system', content: system }, ...messages] };
    }

    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`${response.status} ${detail.slice(0, 160)}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const event = JSON.parse(payload);
          const delta = anthropic
            ? (event.type === 'content_block_delta' ? event.delta?.text : '')
            : event.choices?.[0]?.delta?.content;
          if (delta) {
            text += delta;
            if (onChunk) onChunk(delta);
          }
        } catch {
          // Partial JSON across chunk boundaries — the next read completes it.
        }
      }
    }
    if (!text) throw new Error('empty response');
    return text;
  }
}
