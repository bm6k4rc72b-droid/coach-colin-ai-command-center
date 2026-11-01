/**
 * Ask once, answer many — for real, against a vision-language model running
 * on your own machine.
 *
 * "Is a sheep down? Is the gate open? Is anyone by the tractor?" goes to the
 * model as ONE request carrying one frame, with a JSON schema that forces one
 * answer per question. One image encode and one prefill instead of three is
 * where the speed-up comes from; the latency lab's batching model predicts it
 * and this panel measures it, from the timings Ollama itself returns.
 *
 * The model runs in Ollama (MIT) on the ranch PC or a Jetson — any vision
 * model it serves (Gemma 3, Qwen2.5-VL, LLaVA, Llama 3.2 Vision). Nothing goes
 * to a cloud. LangChain is not needed for one structured call, so it is not
 * loaded. For a browser on another origin to call it, start Ollama with
 * OLLAMA_ORIGINS set to this site's origin (or *).
 *
 * Every answer is written into the evidence chain with the frame's BLAKE3, the
 * exact prompt and the reply, so "the camera said the gate was open at 02:14"
 * can be checked later. A model's answer is still a Modelled reading — VLMs
 * hallucinate — and "unsure" is a first-class answer.
 *
 * @module black-optic-6/ai/vlm
 */

export const DEFAULT_QUESTIONS = Object.freeze([
  'Is any sheep or cow lying down and not moving?',
  'Is a gate open?',
  'Is a person near the tractor or vehicles?',
  'Is there a vehicle that is not a farm vehicle?',
]);

/** Split the operator's questions, one per line. */
export function parseQuestions(text, max = 8) {
  return String(text ?? '').split('\n').map((q) => q.trim()).filter(Boolean).slice(0, max);
}

/** The JSON schema the reply must follow (Ollama structured outputs). */
export function schemaFor(n) {
  return {
    type: 'object',
    properties: {
      answers: {
        type: 'array', minItems: n, maxItems: n,
        items: {
          type: 'object',
          properties: { answer: { type: 'string', enum: ['yes', 'no', 'unsure'] }, evidence: { type: 'string' } },
          required: ['answer', 'evidence'],
        },
      },
    },
    required: ['answers'],
  };
}

/** The single prompt. */
export function promptFor(questions) {
  return [
    'You are watching a still frame from a ranch security camera.',
    'Answer every question below about THIS image only. Answer "unsure" if the image does not show enough to tell.',
    'For each, give one short sentence of visual evidence.',
    'Reply as JSON: {"answers":[{"answer":"yes|no|unsure","evidence":"..."}]}, one entry per question, in order.',
    '',
    ...questions.map((q, i) => `${i + 1}. ${q}`),
  ].join('\n');
}

/**
 * The /api/chat request body.
 *
 * @param {object} o
 * @param {string} o.model e.g. "gemma3:4b".
 * @param {string[]} o.questions
 * @param {string} o.imageBase64 JPEG, base64 without the data: prefix.
 */
export function chatRequest({ model, questions, imageBase64 }) {
  return {
    model,
    stream: false,
    format: schemaFor(questions.length),
    options: { temperature: 0 },
    messages: [{ role: 'user', content: promptFor(questions), images: [imageBase64] }],
  };
}

/**
 * Read the reply. Missing, malformed or extra answers become "unsure" rather
 * than shifting answers onto the wrong question.
 *
 * @param {object} reply Ollama's /api/chat JSON.
 * @param {string[]} questions
 * @returns {{answers: {question: string, answer: string, evidence: string}[], wellFormed: boolean}}
 */
export function parseReply(reply, questions) {
  let parsed = null;
  try { parsed = JSON.parse(reply?.message?.content ?? ''); } catch { parsed = null; }
  const list = Array.isArray(parsed?.answers) ? parsed.answers : [];
  const wellFormed = list.length === questions.length;
  return {
    wellFormed,
    answers: questions.map((question, i) => {
      const a = list[i];
      const answer = ['yes', 'no', 'unsure'].includes(String(a?.answer).toLowerCase()) ? String(a.answer).toLowerCase() : 'unsure';
      return { question, answer, evidence: typeof a?.evidence === 'string' ? a.evidence.slice(0, 240) : '' };
    }),
  };
}

/**
 * Ollama's own timings (nanoseconds) in milliseconds.
 *
 * @returns {{totalMs: number|null, loadMs: number|null, promptMs: number|null, generateMs: number|null,
 *   promptTokens: number|null, outputTokens: number|null}}
 */
export function timings(reply) {
  const ms = (ns) => (Number.isFinite(ns) ? ns / 1e6 : null);
  return {
    totalMs: ms(reply?.total_duration), loadMs: ms(reply?.load_duration),
    promptMs: ms(reply?.prompt_eval_duration), generateMs: ms(reply?.eval_duration),
    promptTokens: reply?.prompt_eval_count ?? null, outputTokens: reply?.eval_count ?? null,
  };
}

/**
 * Measured speed-up of one batched call over N single calls.
 *
 * @param {number} batchedMs Wall time of the one call with N questions.
 * @param {number[]} singleMs Wall times of N one-question calls.
 */
export function speedup(batchedMs, singleMs) {
  const sum = singleMs.reduce((s, x) => s + x, 0);
  return batchedMs > 0 ? sum / batchedMs : null;
}

/** Turn a "yes" to a watched question into a rule event. */
export function ruleEvents(answers) {
  return answers.filter((a) => a.answer === 'yes').map((a) => ({ title: a.question.replace(/\?$/, ''), detail: a.evidence || 'The model said yes.' }));
}
