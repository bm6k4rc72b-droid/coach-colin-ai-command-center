/**
 * Track 2 — Building AI apps.
 *
 * The mentor track for people shipping a product rather than studying the
 * field: prompts as interfaces, retrieval, streaming UX, cost, and the
 * operational realities that only appear after launch.
 *
 * @module nexus/tracks/appcraft
 */

/** @type {import('../curriculum.js').Track} */
export const APPCRAFT_TRACK = {
  id: 'appcraft',
  title: 'AI App Craft',
  tagline: 'Ship something people trust: prompts, retrieval, streaming, cost and the parts that only hurt in production.',
  accent: '#ffcf5a',
  modules: [
    {
      id: 'app-prompt',
      title: 'Prompts as an interface',
      minutes: 14,
      lessons: [
        {
          id: 'prompt-contract',
          title: 'Write the contract, not the incantation',
          body: [
            'A production prompt is a specification: who the model is acting as, what it is given, what it must produce, and what it must never do. Magic phrases — "you are a world-class expert", "think step by step" bolted onto everything — are folklore. Structure, examples and explicit output shape are what move quality.',
            'Put the task first, the constraints next, and the data last, clearly fenced. Long context degrades in the middle, so the instruction that matters should not be buried at position 4,000 of 12,000. If the data is long, restate the task after it.',
            'Examples are worth more than adjectives. Two or three demonstrations of the exact input-to-output transformation you want will beat a paragraph describing it, especially for formatting, tone and edge-case handling. Choose examples that cover the boundaries, not the easy middle.',
            'Specify the failure path. What should the model output when the answer is not in the provided material? If you do not say, it will invent something plausible — not because it is broken, but because you asked a question and gave no permitted way to decline.',
            'Version prompts like code. They are code: they change behaviour, they regress, and "who changed the system prompt on Thursday" is a question you will one day have to answer.',
          ],
          code: {
            lang: 'text',
            text: `TASK
Extract every payment obligation from the contract below.

OUTPUT
JSON array. Each item: {clause_ref, payer, payee, amount, currency, due, conditional}
- amount: number in major units, or null if the clause names no figure
- conditional: true when payment depends on an event, with the event in "due"
- Return [] if the contract contains no payment obligations.

RULES
- Quote clause_ref exactly as numbered in the source.
- Never infer an amount that is not written down.
- If a clause is ambiguous, include it with "conditional": true and
  put your reading in a "note" field rather than dropping it.

CONTRACT
<<<
{{contract_text}}
>>>

Now produce the JSON array for the contract above. No prose.`,
          },
          keyPoints: [
            'Task, constraints, then fenced data — and restate the task after long data.',
            'Examples beat adjectives, especially at the boundaries.',
            'Always define what "I cannot answer this" looks like.',
            'Prompts are versioned artefacts with regressions.',
          ],
        },
        {
          id: 'structured-output',
          title: 'Getting structure you can actually parse',
          body: [
            'Free text is a lovely demo and a miserable integration. Anything downstream of the model wants a schema. Use the provider\'s structured-output or tool-calling mode when it exists — it constrains generation rather than hoping, and it removes an entire category of parse failures.',
            'When you must parse text, be defensive: strip code fences, take the first balanced JSON object, and validate against a schema before use. Then decide what a validation failure means. Retrying once with the error message attached fixes most of them; retrying forever burns money on a prompt that is simply wrong.',
            'Design the schema for the model, not just the database. Flat is easier than nested. Enums are easier than free strings. A field called `confidence` invites a made-up number; a field called `evidence_quote` that must appear verbatim in the source is checkable.',
            'And keep the escape hatch. Every schema should have a way to express "this input did not fit" — an `unparseable` flag, a `notes` field — or the model will jam bad data into your clean columns to satisfy you.',
          ],
          keyPoints: [
            'Prefer constrained decoding or tool-calling over parsing prose.',
            'Validate against a schema, then retry once with the error attached.',
            'Flat schemas with enums; verbatim-quote fields instead of confidence scores.',
            'Give the schema a legitimate way to say "does not fit".',
          ],
        },
      ],
      quiz: [
        {
          q: 'Your extraction prompt invents figures that are not in the document. The first fix is:',
          options: [
            'Add "be accurate" to the prompt',
            'Explicitly permit and define a "not stated" output, and require verbatim evidence',
            'Increase the context window',
            'Lower temperature to 0',
          ],
          answer: 1,
          why: 'A question with no permitted way to decline gets answered anyway. Define the null path and make claims checkable against the source.',
        },
        {
          q: 'Where should the instruction go in a prompt with 10,000 tokens of source data?',
          options: [
            'Only at the very top',
            'Only at the very bottom',
            'At the top, and restated after the data',
            'Interleaved every 1,000 tokens',
          ],
          answer: 2,
          why: 'Attention over long contexts is uneven. Framing at the top and restating at the end is the cheap, reliable pattern.',
        },
        {
          q: 'The best reason to prefer tool-calling / structured output over parsing prose:',
          options: [
            'It is cheaper per token',
            'It constrains generation, removing whole classes of parse failure',
            'It is faster to first token',
            'It works with more models',
          ],
          answer: 1,
          why: 'Constrained decoding makes malformed output largely impossible, rather than something you clean up afterwards.',
        },
      ],
    },
    {
      id: 'app-retrieval',
      title: 'Retrieval that survives contact with real documents',
      minutes: 16,
      lessons: [
        {
          id: 'rag-reality',
          title: 'RAG is a search problem wearing an AI hat',
          body: [
            'Retrieval-augmented generation fails at the retrieval step far more often than at the generation step. If the right passage is not in the top-k, no model can save you. Before tuning prompts, measure recall: for a set of real questions, is the answer-bearing chunk retrieved at all?',
            'Chunking is where most quality is won or lost. Split on structure — headings, sections, function boundaries — not on a fixed character count that guillotines sentences. Carry the document title, section path and date into every chunk, because a paragraph that says "this is not permitted" is useless without knowing what "this" and which policy.',
            'Pure vector search under-performs on names, codes, error strings and rare terms — exactly the things people search for. Hybrid retrieval (BM25 keyword search plus embeddings, fused) is close to a free win. Adding a reranker over the top 50 candidates is the next one.',
            'Cite everything. Every claim in the answer should carry the chunk it came from, and the UI should let the reader jump to it. This does more for trust than any amount of confident phrasing, and it makes the failure mode visible instead of silent.',
            'Finally: freshness. A retrieval index is a cache of your knowledge base and it goes stale. Decide the re-index cadence, show the "as of" date, and handle deletions — a document removed for legal reasons must leave the index too.',
          ],
          code: {
            lang: 'javascript',
            text: `// Hybrid retrieval, fused with Reciprocal Rank Fusion.
// One line of maths that reliably beats either retriever alone.
function rrf(rankings, k = 60) {
  const scores = new Map();
  for (const list of rankings) {
    list.forEach((doc, index) => {
      scores.set(doc.id, (scores.get(doc.id) ?? 0) + 1 / (k + index + 1));
    });
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, score]) => ({ id, score }));
}

const fused = rrf([
  await bm25.search(query, { limit: 50 }),      // exact terms, codes, names
  await vectors.search(await embed(query), 50), // paraphrase, concepts
]);
const top = await reranker.rank(query, fused.slice(0, 50));`,
          },
          keyPoints: [
            'Measure retrieval recall before touching the prompt.',
            'Chunk on structure and carry the document context into the chunk.',
            'Hybrid keyword + vector, fused, then reranked.',
            'Cite every claim; show the index date; propagate deletions.',
          ],
        },
      ],
      quiz: [
        {
          q: 'A RAG system answers policy questions confidently but wrongly. What do you measure first?',
          options: [
            'Model temperature',
            'Whether the answer-bearing chunk is retrieved at all',
            'Tokens per second',
            'Embedding dimensionality',
          ],
          answer: 1,
          why: 'If retrieval never surfaced the right passage, generation was doomed. Recall@k is the first diagnostic.',
        },
        {
          q: 'Why does pure vector search struggle with error codes and product SKUs?',
          options: [
            'They are too short to embed',
            'Embeddings capture semantic similarity, not exact rare tokens',
            'They are usually numeric',
            'Vector databases cannot index them',
          ],
          answer: 1,
          why: 'Rare exact strings are precisely where lexical search wins, which is why hybrid retrieval is the default.',
        },
      ],
    },
    {
      id: 'app-ux',
      title: 'Interface, latency and trust',
      minutes: 15,
      lessons: [
        {
          id: 'streaming-ux',
          title: 'Latency is a design material',
          body: [
            'Users do not experience your p50 latency; they experience time-to-first-token and whether the wait felt intentional. Streaming turns an eight-second stare into a readable eight seconds. Show tool activity as it happens — "searching the handbook", "reading section 4" — and the same wait reads as competence rather than a hang.',
            'Design for interruption. Anything that takes more than a second or two needs a stop button that genuinely aborts, and a partial result that is still useful. An agent you cannot stop is a machine you do not control, and users feel it.',
            'Give uncertainty a visual language. Sources, "as of" dates, and a clear difference between "here is the answer" and "here is my best reading, check it". Interfaces that never show doubt train people to either trust everything or trust nothing, and both are expensive.',
            'Make errors recoverable in place. A failed generation should offer retry, retry-with-more-context, and edit-my-question — not a dead end with an apology. Most AI product frustration is a dead end, not a wrong answer.',
            'And keep the human edit path first-class. The output is a draft. Copy, tweak, regenerate a paragraph, undo — these are the operations people actually perform all day.',
          ],
          keyPoints: [
            'Time-to-first-token and visible progress beat raw speed.',
            'Stop must really stop, and partial output must stay useful.',
            'Show sources and dates; distinguish answer from best reading.',
            'Every failure needs an in-place recovery, not an apology.',
          ],
        },
        {
          id: 'cost-latency',
          title: 'Cost, caching and choosing a model per call',
          body: [
            'Cost is a product decision, not a billing one. The lever that matters most is not squeezing tokens but routing: use a small fast model for classification, extraction and routing, and a large one only where judgement is genuinely needed. Most production traffic is not the hard case.',
            'Prompt caching changes the arithmetic when a long stable prefix — system prompt, tool definitions, a policy document — is reused across calls. Order your prompt so everything stable comes first and the variable part last, or you forfeit the cache on every request.',
            'Batch what is not interactive. Overnight enrichment, backfills and evals do not need low latency, and batch pricing is materially cheaper. Separating interactive from background traffic early keeps this option open.',
            'Instrument per-request: model, input and output tokens, cache hits, latency, and the feature that made the call. Without that, "our AI bill tripled" is unanswerable. With it, it is usually one endpoint doing something silly, and you will find it in ten minutes.',
            'Set budget ceilings in code — per user, per session, per day — with graceful degradation to a cheaper model rather than a hard failure. A runaway loop should get slower and dumber, not more expensive.',
          ],
          keyPoints: [
            'Route by difficulty; small models handle most traffic.',
            'Stable prefix first, variable content last, to keep the cache warm.',
            'Move non-interactive work to batch.',
            'Log tokens and cost per feature, and cap spend with degradation.',
          ],
        },
      ],
      quiz: [
        {
          q: 'Which change most improves perceived speed without touching the model?',
          options: [
            'Reducing output length',
            'Streaming with visible tool-progress messages',
            'Switching data centre',
            'Raising the rate limit',
          ],
          answer: 1,
          why: 'Perceived latency is dominated by time-to-first-signal and whether the wait is legible.',
        },
        {
          q: 'To benefit from prompt caching you should order the prompt as:',
          options: [
            'Variable content first, stable content last',
            'Stable content first, variable content last',
            'Alphabetically',
            'Shortest section first',
          ],
          answer: 1,
          why: 'Caches key on a shared prefix. Anything variable at the front invalidates everything behind it.',
        },
        {
          q: 'A runaway agent loop is burning budget. The best-designed response is:',
          options: [
            'Hard-fail the request',
            'Degrade to a cheaper model and cap the remaining steps',
            'Queue it for later',
            'Alert an engineer and continue',
          ],
          answer: 1,
          why: 'Graceful degradation keeps the user served while capping the blast radius. Hard failure loses the work already done.',
        },
      ],
    },
    {
      id: 'app-ship',
      title: 'Shipping and keeping it alive',
      minutes: 14,
      lessons: [
        {
          id: 'production',
          title: 'The parts nobody demos',
          body: [
            'Model versions move. Pin them explicitly, test the next version against your eval set before switching, and keep the old version reachable for a rollback window. "It worked last week" is a real incident category in this field.',
            'Rate limits and outages are normal operating conditions, not exceptions. Retry with exponential backoff and jitter, fail over to a secondary model, and make the degraded path visibly different in the UI rather than silently worse.',
            'Log enough to reconstruct any answer: prompt version, model, retrieved chunk ids, tool calls, and the output. Redact personal data at the boundary — logging raw user content forever is a breach waiting for a date. Retention limits are part of the design.',
            'Put a feedback mechanism next to every generated artefact, and actually read it. Thumbs-down with a free-text field, sampled into a weekly review, is the cheapest eval-set generator that exists: your failures arrive pre-labelled by the people who care.',
            'Finally, be honest in the interface about what the system is. Users calibrate on the language you use. Overclaiming buys a week of enthusiasm and a year of distrust after the first confident mistake.',
          ],
          keyPoints: [
            'Pin model versions; eval before upgrading; keep a rollback.',
            'Backoff, failover, and make degraded mode visible.',
            'Log for reconstruction, redact at the boundary, set retention.',
            'Feedback capture is your cheapest source of real eval cases.',
          ],
        },
      ],
      quiz: [
        {
          q: 'The most important reason to pin a model version in production is:',
          options: [
            'It is cheaper',
            'Behaviour can change under you, silently breaking prompts and evals',
            'Pinned versions are faster',
            'It is required by most providers',
          ],
          answer: 1,
          why: 'Silent behavioural drift is the classic production surprise. Pinning turns an incident into a scheduled upgrade.',
        },
        {
          q: 'Which logging practice is both useful and defensible?',
          options: [
            'Log all raw user content indefinitely',
            'Log nothing',
            'Log prompt version, model, retrieval ids and tool calls, with redaction and retention limits',
            'Log only errors',
          ],
          answer: 2,
          why: 'You need enough to reconstruct a decision, without turning your logs into an indefinite store of personal data.',
        },
      ],
    },
  ],
};
