/**
 * ASTRA — the concierge.
 *
 * Two brains behind one interface. The local brain retrieves from the corpus
 * and composes a cited answer; it needs no key, no network and no account, and
 * it is what runs by default. If an operator supplies an API key the same
 * question goes to a language model with the retrieved evidence as context, and
 * the answer streams back.
 *
 * The local path is not a degraded mode. It is the guarantee: the platform
 * answers with citations on a plane, and a connected model can improve the
 * prose but never the tier — evidence grading always comes from the corpus, so
 * a model cannot talk the platform into more confidence than the studies
 * support.
 *
 * One behaviour is fixed in both paths: ASTRA organises education around a
 * stated goal. It does not diagnose, does not recommend a compound, and does
 * not produce a protocol. When asked to, it says what it will do instead.
 *
 * @module astra/astra
 */

import { GOALS, claimStudies, corpusSize, findAny, pubmedUrl } from './data/peptides.js';
import { describe, scoreEvidence, tier } from './evidence.js';
import { dossier, rankForGoals, resolveNamed, resolveSubject, search } from './engine.js';

const SETTINGS_KEY = 'astra.model.v1';

/** Requests the concierge answers without retrieval. */
const CANNED = [
  {
    match: /^(hi|hello|hey|good (morning|afternoon|evening)|greetings)\b/i,
    reply: () => `I am Astra. I run the intelligence layer for this facility: ${corpusSize().peptides} compounds, ${corpusSize().studies} catalogued studies, every claim gradeable and every source openable. Tell me what you are trying to understand rather than which compound you want, and I will organise the evidence around it.`,
  },
  {
    match: /\b(who|what) are you\b|\byour name\b|\bintroduce yourself\b/i,
    reply: () => 'I am Astra, the research concierge. I read the corpus, grade the evidence behind every claim, and show you the study rather than my summary of it. I run in your browser — nothing you type here leaves this device unless you connect a model of your own.',
  },
  {
    match: /\bwhat can you (do|answer)\b|\bhelp\b$|\bcapabilit/i,
    reply: () => 'Six things. Explain a compound across eight fixed sections. Grade any claim by evidence tier. Decode a paper into what it does and does not prove. Compare two compounds on evidence quality. Check a piece of copy before you publish it. And map the whole field as a graph you can fly through.',
  },
  {
    match: /\b(should i (take|use|try)|what should i take|is it safe for me|how much should i|what dose|dose for me|my protocol|prescribe)\b/i,
    reply: () => 'I do not do that, and the refusal is the product rather than a limitation. I have no idea who you are, what else you take or what is going on in your body, and neither does any peptide marketer who answers that question confidently. What I can do is show you exactly what has been studied, in whom, at what tier, and what remains unknown — so the conversation you have with a clinician is a much better one. Which compound, and what are you trying to understand about it?',
  },
  {
    match: /\b(thank you|thanks|cheers)\b/i,
    reply: () => 'Any time. Ask me to check a claim next — it is the fastest way to see how the grading works.',
  },
  {
    match: /\bevidence (tier|level|hierarchy|pyramid)\b|\bhow do you (grade|score)\b/i,
    reply: () => 'Seven tiers, strongest to weakest: randomised human trial, human trial, human observational, animal, in vitro, mechanistic rationale, anecdote. Each tier carries a hard confidence ceiling, so accumulating studies at one tier raises confidence toward that cap and never past it. Ten mouse studies do not outrank one good trial, and the meter refuses to pretend otherwise.',
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
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
  } catch {
    // Settings are a convenience; the local brain works without them.
  }
  return merged;
}

/**
 * Which goals a question is about.
 *
 * @param {string} question The question.
 * @returns {string[]} Goal ids.
 */
export function goalsIn(question) {
  const text = String(question || '').toLowerCase();
  const cues = {
    recovery: /\b(recover|injur|tendon|heal|repair|rehab|surgery)\w*\b/,
    metabolic: /\b(metabolic|insulin|glucose|blood sugar|weight|fat loss|visceral)\w*\b/,
    longevity: /\b(longevity|ag(e)?ing|anti[- ]?aging|lifespan|senescen)\w*\b/,
    performance: /\b(performance|athlet|strength|output|training|gym)\w*\b/,
    cognition: /\b(focus|memory|cognit|brain|nootropic|bdnf|clarity)\w*\b/,
    'gut-health': /\b(gut|intestin|colitis|ibd|leaky|digest|microbio)\w*\b/,
    'skin-hair': /\b(skin|collagen|wrinkle|hair|elastin|cosmetic)\w*\b/,
    mood: /\b(anxiety|mood|stress|calm|depress)\w*\b/,
    immune: /\b(immune|inflammat|autoimmun)\w*\b/,
  };
  return Object.entries(cues).filter(([, pattern]) => pattern.test(text)).map(([id]) => id);
}

/**
 * Compose an answer from the corpus alone.
 *
 * @param {string} question The reader's question.
 * @returns {{ text: string, sources: Array<object>, followUps: string[], subject: object|null,
 *   goals: string[], reading: object|null }} A cited answer.
 */
export function composeLocalAnswer(question) {
  const asked = String(question || '').trim();
  for (const item of CANNED) {
    if (item.match.test(asked)) {
      return { text: item.reply(), sources: [], followUps: followUps(asked, null), subject: null, goals: [], reading: null };
    }
  }

  const goals = goalsIn(asked);
  // A goal-shaped question that names no compound gets the concierge behaviour
  // the brief asked for: organise the field around the goal. Retrieval only
  // picks a compound once we know none was named.
  const named = resolveNamed(asked);
  if (!named && goals.length) return goalAnswer(asked, goals);
  const subject = named || resolveSubject(asked);
  if (!subject) {
    const hits = search(asked, 4);
    if (!hits.length) {
      return {
        text: `Nothing in the corpus matches that. I cover ${corpusSize().peptides} compounds and ${corpusSize().stacks} stacks — try naming one, or tell me the outcome you are interested in and I will organise the evidence around that instead.`,
        sources: [], followUps: ['Which compounds have human evidence?', 'How do you grade evidence?'], subject: null, goals, reading: null,
      };
    }
    return {
      text: hits.map((hit) => `**${hit.doc.title}** — ${excerpt(hit.doc.text)}`).join('\n\n'),
      sources: hits.map((hit) => ({ id: hit.doc.id, title: hit.doc.title, peptide: hit.doc.peptide })),
      followUps: followUps(asked, null), subject: null, goals, reading: null,
    };
  }

  return subjectAnswer(asked, subject, goals);
}

/**
 * Answer a question about a specific compound.
 *
 * @param {string} asked The question.
 * @param {object} subject The compound or stack.
 * @param {string[]} goals Detected goals.
 * @returns {object} The answer.
 */
function subjectAnswer(asked, subject, goals) {
  const report = dossier(subject);
  const reading = report.reading;
  const isStack = report.kind === 'stack';

  // Route on what was actually asked. The dossier holds everything; the
  // concierge should answer the question rather than recite the file.
  if (/\b(safe|safety|side effect|risk|harm|danger)\b/i.test(asked)) {
    return {
      text: `On safety for ${subject.name}: the honest answer is that safety is established by large, long trials, and ${isStack ? 'this combination has none' : subject.regulatory.status === 'approved' ? 'this compound has them' : 'this compound does not have them'}.\n\n${(subject.uncertainties || []).slice(0, 3).map((item) => `• ${item}`).join('\n')}\n\n${subject.regulatory ? subject.regulatory.headline : ''} Absence of reported harm in small studies is not evidence of safety — it is absence of the study that would find harm.`,
      sources: sourcesFor(subject), followUps: followUps(asked, subject), subject, goals, reading,
    };
  }
  if (/\b(human|people|person|clinical trial|rct|tested in)\b/i.test(asked)) {
    const human = report.sections.human;
    return {
      text: human.studies.length
        ? `${human.body}\n\n${human.studies.map((study) => `**${study.title}** (${study.journal}, ${study.year}) — ${study.design}, ${study.population}${study.n ? `, n=${study.n}` : ''}. ${study.finding}\n*Limitation:* ${study.limitation}`).join('\n\n')}`
        : `${human.body}\n\nThat is the answer to your question: no. ${subject.name} has no human efficacy trial in this corpus, and the confidence meter caps at ${Math.round(reading.best.ceiling * 100)}% because of it.`,
      sources: sourcesFor(subject), followUps: followUps(asked, subject), subject, goals, reading,
    };
  }
  if (/\bmechanism\b|\bhow (?:does|do)\b[^?]{0,30}\bwork\b|\bpathway\b|\breceptor\b/i.test(asked)) {
    return {
      text: `${report.sections.mechanism.body}\n\n${(report.sections.mechanism.items || []).map((item) => `**${item.title}** (${item.tierInfo.label.toLowerCase()}) — ${item.detail}`).join('\n\n') || subject.rationale}`,
      sources: sourcesFor(subject), followUps: followUps(asked, subject), subject, goals, reading,
    };
  }
  if (/\b(legal|approved|banned|regulat|fda|wada|sport)\b/i.test(asked)) {
    const regulatory = report.sections.regulatory;
    return {
      text: `${regulatory.body}\n\n${regulatory.detail}\n\n**In sport:** ${regulatory.sport}`,
      sources: sourcesFor(subject), followUps: followUps(asked, subject), subject, goals, reading,
    };
  }
  if (/\b(compare|versus|vs\.?|better than|difference between)\b/i.test(asked)) {
    return {
      text: `Open the Comparison Lab for a proper side-by-side — it reads five axes at once. The short version for ${subject.name}: ${describe(reading)} Its best available design is ${reading.best.label.toLowerCase()}, which is the number that decides most comparisons.`,
      sources: sourcesFor(subject), followUps: followUps(asked, subject), subject, goals, reading,
    };
  }

  // Default: the opening of the dossier, which is what most questions want.
  const claims = report.claims || [];
  const strongest = claims.length ? claims.reduce((acc, claim) => (claim.tierInfo.rank < acc.tierInfo.rank ? claim : acc), claims[0]) : null;
  return {
    text: [
      `**${subject.name}** — ${subject.tagline}`,
      '',
      subject.summary,
      '',
      `**Evidence:** ${describe(reading)} Best available design: ${reading.best.label.toLowerCase()}.`,
      strongest ? `**Strongest claim:** ${strongest.text} — ${strongest.tierInfo.label.toLowerCase()}. ${strongest.note || ''}` : '',
      `**Biggest open question:** ${(subject.uncertainties || [])[0] || 'The combination has never been studied.'}`,
    ].filter(Boolean).join('\n'),
    sources: sourcesFor(subject),
    followUps: followUps(asked, subject),
    subject,
    goals,
    reading,
  };
}

/**
 * Answer a goal-shaped question by organising the field around it.
 *
 * @param {string} asked The question.
 * @param {string[]} goals Detected goals.
 * @returns {object} The answer.
 */
function goalAnswer(asked, goals) {
  const ranked = rankForGoals(goals).slice(0, 4);
  const labels = goals.map((id) => GOALS.find((goal) => goal.id === id)?.label || id).join(' and ');
  return {
    text: [
      `You are asking about **${labels.toLowerCase()}**, so here is the field organised around that rather than around what sells.`,
      '',
      ...ranked.map(({ entry, reading }) => `**${entry.name}** — ${describe(reading)} ${entry.tagline}`),
      '',
      ranked.length && ranked[0].reading.score < 0.4
        ? 'Note what that ordering shows: nothing here clears the emerging-evidence line for this goal. That is the real answer to the question, and it is more useful than a recommendation would be.'
        : 'Open any of them for the full dossier — eight sections, every claim expandable into its sources.',
    ].join('\n'),
    sources: ranked.map(({ entry }) => ({ id: entry.id, title: entry.name, peptide: entry.id })),
    followUps: ranked.slice(0, 3).map(({ entry }) => `What human evidence exists for ${entry.name}?`),
    subject: null,
    goals,
    reading: null,
  };
}

/**
 * Citation records for a compound.
 *
 * @param {object} subject A compound or stack.
 * @returns {Array<object>} Sources.
 */
function sourcesFor(subject) {
  if (subject.members) return subject.members.map((id) => ({ id, title: findAny(id)?.name || id, peptide: id }));
  return subject.studies.slice(0, 4).map((study) => ({
    id: study.id, title: `${study.title} (${study.year})`, peptide: subject.id, url: pubmedUrl(study), tier: study.tier,
  }));
}

/**
 * Suggested next questions.
 *
 * @param {string} asked What was asked.
 * @param {object|null} subject The resolved compound.
 * @returns {string[]} Follow-ups.
 */
function followUps(asked, subject) {
  if (!subject) return ['Which compounds have human evidence?', 'How do you grade evidence?', 'Check a claim for me'];
  return [
    `What human evidence exists for ${subject.name}?`,
    `What does the research on ${subject.name} not prove?`,
    `Is ${subject.name} approved anywhere?`,
  ];
}

/**
 * A short excerpt of an index document.
 *
 * @param {string} text Document text.
 * @returns {string} An excerpt.
 */
function excerpt(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > 240 ? `${clean.slice(0, clean.lastIndexOf(' ', 240))}…` : clean;
}

/**
 * Build the context block handed to a language model.
 *
 * The model receives the graded evidence, not the raw corpus, so it cannot
 * reach a more confident conclusion than the tiers allow without contradicting
 * material it was given.
 *
 * @param {string} question The question.
 * @returns {string} The context block.
 */
export function buildContext(question) {
  const subject = resolveSubject(question);
  const hits = search(question, 6);
  const lines = [];
  if (subject) {
    const report = dossier(subject);
    lines.push(`COMPOUND: ${subject.name} (${subject.full || subject.klass})`);
    lines.push(`SUMMARY: ${subject.summary}`);
    lines.push(`EVIDENCE: ${describe(report.reading)} Best design available: ${report.reading.best.label}. Confidence ceiling for that tier: ${Math.round(report.reading.best.ceiling * 100)}%.`);
    for (const claim of report.claims || []) {
      lines.push(`CLAIM [${tier(claim.tier).label}]: ${claim.text} — ${claim.note || ''}`);
      for (const study of claimStudies(subject, claim)) {
        lines.push(`  STUDY: ${study.title} (${study.journal}, ${study.year}); ${study.design}; ${study.population}${study.n ? `; n=${study.n}` : ''}; FINDING: ${study.finding}; LIMITATION: ${study.limitation}`);
      }
    }
    for (const item of subject.uncertainties || []) lines.push(`UNCERTAINTY: ${item}`);
    if (subject.regulatory) lines.push(`REGULATORY: ${subject.regulatory.headline} ${subject.regulatory.detail} SPORT: ${subject.regulatory.sport}`);
  }
  for (const hit of hits.slice(0, 4)) lines.push(`CORPUS [${hit.doc.kind}]: ${hit.doc.title} — ${excerpt(hit.doc.text)}`);
  return lines.join('\n');
}

/** The system prompt. It encodes the platform's positioning, not just its tone. */
export const SYSTEM_PROMPT = `You are Astra, the research concierge for a peptide education platform.

Your job is research literacy, not medical advice. You explain what has been studied, in whom, at what evidence tier, and what remains unknown.

Hard rules:
- Never diagnose, never recommend a compound to a person, never produce a dosing or treatment protocol. If asked, explain what you will do instead and offer the evidence.
- Never state a claim more confidently than the CONTEXT's evidence tier supports. If the context says animal-model evidence, say animal-model evidence.
- Never invent a study, a number, an author or a journal. If the context does not contain it, say the corpus does not cover it.
- Always name the tier in the sentence that makes the claim.
- Prefer the limitation over the headline. The most useful sentence in any paper is usually the one about what it does not establish.

Write in plain, confident prose. Short paragraphs. No bullet-point padding. British spelling.`;

/**
 * Ask a connected language model, streaming the answer.
 *
 * @param {string} question The question.
 * @param {object} options Options.
 * @param {(chunk: string) => void} options.onChunk Called with each text delta.
 * @param {AbortSignal} [options.signal] Abort signal.
 * @returns {Promise<string>} The complete answer.
 */
export async function askModel(question, { onChunk, signal } = {}) {
  const settings = readSettings();
  if (!settings.key) throw new Error('no-key');
  const context = buildContext(question);
  const body = settings.provider === 'openai'
    ? {
      model: settings.model,
      stream: true,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `CONTEXT FROM THE CORPUS:\n${context}\n\nQUESTION: ${question}` },
      ],
    }
    : {
      model: settings.model,
      max_tokens: 1200,
      stream: true,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `CONTEXT FROM THE CORPUS:\n${context}\n\nQUESTION: ${question}` }],
    };

  const endpoint = settings.endpoint || (settings.provider === 'openai'
    ? 'https://api.openai.com/v1/chat/completions'
    : 'https://api.anthropic.com/v1/messages');

  const headers = { 'content-type': 'application/json' };
  if (settings.provider === 'openai') headers.authorization = `Bearer ${settings.key}`;
  else {
    headers['x-api-key'] = settings.key;
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
  }

  const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal });
  if (!response.ok || !response.body) throw new Error(`model-${response.status}`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
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
        const delta = settings.provider === 'openai'
          ? event.choices?.[0]?.delta?.content
          : (event.type === 'content_block_delta' ? event.delta?.text : null);
        if (delta) {
          full += delta;
          onChunk?.(delta);
        }
      } catch {
        // A partial SSE frame; the next read completes it.
      }
    }
  }
  return full;
}

/**
 * Ask ASTRA — model first when configured, corpus always as the floor.
 *
 * @param {string} question The question.
 * @param {object} [options] Options, as {@link askModel}.
 * @returns {Promise<object>} The answer, with a `via` field naming the path taken.
 */
export async function ask(question, options = {}) {
  const local = composeLocalAnswer(question);
  const settings = readSettings();
  if (!settings.key) return { ...local, via: 'corpus' };
  try {
    const text = await askModel(question, options);
    // The tier, the sources and the reading still come from the corpus. The
    // model supplies prose; it does not supply confidence.
    return { ...local, text: text || local.text, via: 'model' };
  } catch (error) {
    return { ...local, via: 'corpus', modelError: String(error.message || error) };
  }
}
