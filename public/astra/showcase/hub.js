/**
 * The International Translation Hub — on-device translation, language
 * detection and a hand-checked peptide glossary in twelve languages.
 *
 * Translation runs on the device, in the same spirit as the rest of the
 * chamber: where the browser ships an on-device AI translator (Chrome's
 * Translator and LanguageDetector APIs, 2025+), the hub uses it, and
 * reports which engine produced each line and how long it actually took.
 * Where it does not, the hub falls back to its own phrasebook — the
 * glossary, the safety line and a handful of questions, written per
 * language — and says so rather than pretending. No text leaves the device
 * either way.
 *
 * @module astra/showcase/hub
 */

/** The hub's languages: speech code for the voice, script, and direction. */
export const HUB_LANGS = [
  { id: 'en', name: 'English', english: 'English', speech: 'en-GB', script: 'Latin', dir: 'ltr', flag: 'EN' },
  { id: 'es', name: 'Español', english: 'Spanish', speech: 'es-ES', script: 'Latin', dir: 'ltr', flag: 'ES' },
  { id: 'fr', name: 'Français', english: 'French', speech: 'fr-FR', script: 'Latin', dir: 'ltr', flag: 'FR' },
  { id: 'de', name: 'Deutsch', english: 'German', speech: 'de-DE', script: 'Latin', dir: 'ltr', flag: 'DE' },
  { id: 'pt', name: 'Português', english: 'Portuguese', speech: 'pt-BR', script: 'Latin', dir: 'ltr', flag: 'PT' },
  { id: 'it', name: 'Italiano', english: 'Italian', speech: 'it-IT', script: 'Latin', dir: 'ltr', flag: 'IT' },
  { id: 'zh', name: '中文', english: 'Chinese', speech: 'zh-CN', script: 'Han', dir: 'ltr', flag: 'ZH' },
  { id: 'ja', name: '日本語', english: 'Japanese', speech: 'ja-JP', script: 'Kana + Kanji', dir: 'ltr', flag: 'JA' },
  { id: 'ko', name: '한국어', english: 'Korean', speech: 'ko-KR', script: 'Hangul', dir: 'ltr', flag: 'KO' },
  { id: 'ar', name: 'العربية', english: 'Arabic', speech: 'ar-SA', script: 'Arabic', dir: 'rtl', flag: 'AR' },
  { id: 'hi', name: 'हिन्दी', english: 'Hindi', speech: 'hi-IN', script: 'Devanagari', dir: 'ltr', flag: 'HI' },
  { id: 'ru', name: 'Русский', english: 'Russian', speech: 'ru-RU', script: 'Cyrillic', dir: 'ltr', flag: 'RU' },
];

export const langById = (id) => HUB_LANGS.find((l) => l.id === id) || HUB_LANGS[0];

/** "Hello" in each, for the orbiting glyphs. */
export const GREETINGS = {
  en: 'Hello', es: 'Hola', fr: 'Bonjour', de: 'Hallo', pt: 'Olá', it: 'Ciao',
  zh: '你好', ja: 'こんにちは', ko: '안녕하세요', ar: 'مرحبا', hi: 'नमस्ते', ru: 'Привет',
};

/**
 * Fourteen terms a reader meets in every study page, in twelve languages.
 * Written per language with the medical register each one actually uses
 * (e.g. 随机对照试验, ランダム化比較試験, рандомизированное контролируемое
 * исследование), not run through a machine.
 */
export const GLOSSARY = [
  { id: 'peptide', en: 'peptide', es: 'péptido', fr: 'peptide', de: 'Peptid', pt: 'peptídeo', it: 'peptide', zh: '肽', ja: 'ペプチド', ko: '펩타이드', ar: 'ببتيد', hi: 'पेप्टाइड', ru: 'пептид' },
  { id: 'receptor', en: 'receptor', es: 'receptor', fr: 'récepteur', de: 'Rezeptor', pt: 'receptor', it: 'recettore', zh: '受体', ja: '受容体', ko: '수용체', ar: 'مستقبِل', hi: 'रिसेप्टर', ru: 'рецептор' },
  { id: 'half-life', en: 'half-life', es: 'vida media', fr: 'demi-vie', de: 'Halbwertszeit', pt: 'meia-vida', it: 'emivita', zh: '半衰期', ja: '半減期', ko: '반감기', ar: 'عمر النصف', hi: 'अर्ध-आयु', ru: 'период полувыведения' },
  { id: 'rct', en: 'randomised controlled trial', es: 'ensayo controlado aleatorizado', fr: 'essai contrôlé randomisé', de: 'randomisierte kontrollierte Studie', pt: 'ensaio clínico randomizado', it: 'studio randomizzato controllato', zh: '随机对照试验', ja: 'ランダム化比較試験', ko: '무작위 대조 시험', ar: 'تجربة عشوائية مضبوطة', hi: 'यादृच्छिक नियंत्रित परीक्षण', ru: 'рандомизированное контролируемое исследование' },
  { id: 'placebo', en: 'placebo', es: 'placebo', fr: 'placebo', de: 'Placebo', pt: 'placebo', it: 'placebo', zh: '安慰剂', ja: 'プラセボ', ko: '위약', ar: 'دواء وهمي', hi: 'प्लेसीबो', ru: 'плацебо' },
  { id: 'side-effects', en: 'side effects', es: 'efectos secundarios', fr: 'effets secondaires', de: 'Nebenwirkungen', pt: 'efeitos colaterais', it: 'effetti collaterali', zh: '副作用', ja: '副作用', ko: '부작용', ar: 'آثار جانبية', hi: 'दुष्प्रभाव', ru: 'побочные эффекты' },
  { id: 'evidence', en: 'evidence', es: 'evidencia', fr: 'données probantes', de: 'Evidenz', pt: 'evidência', it: 'evidenza', zh: '证据', ja: 'エビデンス', ko: '근거', ar: 'الأدلة', hi: 'साक्ष्य', ru: 'доказательная база' },
  { id: 'weight-loss', en: 'weight loss', es: 'pérdida de peso', fr: 'perte de poids', de: 'Gewichtsabnahme', pt: 'perda de peso', it: 'perdita di peso', zh: '减重', ja: '体重減少', ko: '체중 감량', ar: 'فقدان الوزن', hi: 'वज़न घटना', ru: 'снижение веса' },
  { id: 'investigational', en: 'investigational (not approved)', es: 'en investigación (no aprobado)', fr: 'expérimental (non approuvé)', de: 'in Prüfung (nicht zugelassen)', pt: 'em investigação (não aprovado)', it: 'sperimentale (non approvato)', zh: '在研（未获批准）', ja: '治験中（未承認）', ko: '임상 개발 중 (미승인)', ar: 'قيد البحث (غير معتمد)', hi: 'प्रायोगिक (अनुमोदित नहीं)', ru: 'исследуемый (не одобрен)' },
  { id: 'animal-study', en: 'animal study', es: 'estudio en animales', fr: 'étude animale', de: 'Tierstudie', pt: 'estudo em animais', it: 'studio sugli animali', zh: '动物研究', ja: '動物実験', ko: '동물 연구', ar: 'دراسة على الحيوانات', hi: 'पशु अध्ययन', ru: 'исследование на животных' },
  { id: 'dose', en: 'dose', es: 'dosis', fr: 'dose', de: 'Dosis', pt: 'dose', it: 'dose', zh: '剂量', ja: '用量', ko: '용량', ar: 'جرعة', hi: 'खुराक', ru: 'доза' },
  { id: 'glp1-ra', en: 'GLP-1 receptor agonist', es: 'agonista del receptor de GLP-1', fr: 'agoniste du récepteur du GLP-1', de: 'GLP-1-Rezeptoragonist', pt: 'agonista do receptor de GLP-1', it: 'agonista del recettore del GLP-1', zh: 'GLP-1受体激动剂', ja: 'GLP-1受容体作動薬', ko: 'GLP-1 수용체 작용제', ar: 'ناهض مستقبلات GLP-1', hi: 'GLP-1 रिसेप्टर एगोनिस्ट', ru: 'агонист рецептора GLP-1' },
  { id: 'not-advice', en: 'not medical advice', es: 'no es consejo médico', fr: 'ceci n’est pas un avis médical', de: 'keine medizinische Beratung', pt: 'não é aconselhamento médico', it: 'non è un consiglio medico', zh: '不构成医疗建议', ja: '医学的助言ではありません', ko: '의학적 조언이 아닙니다', ar: 'ليست نصيحة طبية', hi: 'यह चिकित्सा सलाह नहीं है', ru: 'не является медицинской рекомендацией' },
  { id: 'doctor', en: 'talk to your doctor', es: 'consulta a tu médico', fr: 'parlez-en à votre médecin', de: 'sprechen Sie mit Ihrem Arzt', pt: 'fale com seu médico', it: 'parla con il tuo medico', zh: '请咨询您的医生', ja: '医師にご相談ください', ko: '의사와 상담하세요', ar: 'استشر طبيبك', hi: 'अपने डॉक्टर से बात करें', ru: 'проконсультируйтесь с врачом' },
];

/** Questions a reader asks, for the phrasebook. */
export const PHRASES = [
  { id: 'evidence', en: 'What does the evidence say?', es: '¿Qué dice la evidencia?', fr: 'Que disent les données ?', de: 'Was sagt die Evidenz?', pt: 'O que dizem as evidências?', it: 'Cosa dicono le evidenze?', zh: '证据怎么说？', ja: 'エビデンスは何と言っていますか？', ko: '근거는 무엇을 말하나요?', ar: 'ماذا تقول الأدلة؟', hi: 'साक्ष्य क्या कहते हैं?', ru: 'Что говорят доказательства?' },
  { id: 'approved', en: 'Is it approved?', es: '¿Está aprobado?', fr: 'Est-il approuvé ?', de: 'Ist es zugelassen?', pt: 'Está aprovado?', it: 'È approvato?', zh: '它获批了吗？', ja: '承認されていますか？', ko: '승인되었나요?', ar: 'هل هو معتمد؟', hi: 'क्या यह स्वीकृत है?', ru: 'Он одобрен?' },
  { id: 'side-effects', en: 'What are the side effects?', es: '¿Cuáles son los efectos secundarios?', fr: 'Quels sont les effets secondaires ?', de: 'Welche Nebenwirkungen gibt es?', pt: 'Quais são os efeitos colaterais?', it: 'Quali sono gli effetti collaterali?', zh: '有哪些副作用？', ja: '副作用は何ですか？', ko: '부작용은 무엇인가요?', ar: 'ما هي الآثار الجانبية؟', hi: 'इसके दुष्प्रभाव क्या हैं?', ru: 'Какие побочные эффекты?' },
  { id: 'humans', en: 'Was it tested in humans?', es: '¿Se ha probado en humanos?', fr: 'A-t-il été testé chez l’humain ?', de: 'Wurde es am Menschen getestet?', pt: 'Foi testado em humanos?', it: 'È stato testato sugli esseri umani?', zh: '在人体中测试过吗？', ja: 'ヒトで試験されましたか？', ko: '사람에게 시험되었나요?', ar: 'هل تم اختباره على البشر؟', hi: 'क्या इसका मनुष्यों पर परीक्षण हुआ है?', ru: 'Его испытывали на людях?' },
];

/** The safety line, in every language the hub speaks. */
export const SAFETY = {
  en: 'Educational only — not medical advice. No doses. Talk to your doctor.',
  es: 'Solo con fines educativos: no es consejo médico. Sin dosis. Consulta a tu médico.',
  fr: 'À but éducatif uniquement — ceci n’est pas un avis médical. Aucune posologie. Parlez-en à votre médecin.',
  de: 'Nur zu Bildungszwecken – keine medizinische Beratung. Keine Dosierungen. Sprechen Sie mit Ihrem Arzt.',
  pt: 'Apenas educativo — não é aconselhamento médico. Sem doses. Fale com seu médico.',
  it: 'Solo a scopo educativo: non è un consiglio medico. Nessun dosaggio. Parla con il tuo medico.',
  zh: '仅供教育用途——不构成医疗建议。不提供剂量。请咨询您的医生。',
  ja: '教育目的のみ。医学的助言ではありません。用量は扱いません。医師にご相談ください。',
  ko: '교육 목적으로만 제공됩니다. 의학적 조언이 아닙니다. 용량 안내는 하지 않습니다. 의사와 상담하세요.',
  ar: 'لأغراض تعليمية فقط — ليست نصيحة طبية. لا جرعات. استشر طبيبك.',
  hi: 'केवल शैक्षिक उद्देश्य के लिए — यह चिकित्सा सलाह नहीं है। कोई खुराक नहीं। अपने डॉक्टर से बात करें।',
  ru: 'Только в образовательных целях — не является медицинской рекомендацией. Никаких доз. Проконсультируйтесь с врачом.',
};

/** Cities on the network globe, one or two per language. */
export const CITIES = [
  { name: 'London', lang: 'en', lat: 51.5, lon: -0.1 },
  { name: 'New York', lang: 'en', lat: 40.7, lon: -74 },
  { name: 'Madrid', lang: 'es', lat: 40.4, lon: -3.7 },
  { name: 'Mexico City', lang: 'es', lat: 19.4, lon: -99.1 },
  { name: 'Paris', lang: 'fr', lat: 48.9, lon: 2.35 },
  { name: 'Berlin', lang: 'de', lat: 52.5, lon: 13.4 },
  { name: 'São Paulo', lang: 'pt', lat: -23.5, lon: -46.6 },
  { name: 'Rome', lang: 'it', lat: 41.9, lon: 12.5 },
  { name: 'Beijing', lang: 'zh', lat: 39.9, lon: 116.4 },
  { name: 'Tokyo', lang: 'ja', lat: 35.7, lon: 139.7 },
  { name: 'Seoul', lang: 'ko', lat: 37.6, lon: 127 },
  { name: 'Riyadh', lang: 'ar', lat: 24.7, lon: 46.7 },
  { name: 'Delhi', lang: 'hi', lat: 28.6, lon: 77.2 },
  { name: 'Moscow', lang: 'ru', lat: 55.8, lon: 37.6 },
];

/* ---------------------------------------------------------------- engines */

const scope = typeof self !== 'undefined' ? self : globalThis;

/** Which on-device engines this browser offers. */
export function engines() {
  return { translator: 'Translator' in scope, detector: 'LanguageDetector' in scope };
}

/**
 * Whether a language pair can be translated on this device.
 *
 * @returns {Promise<'available'|'downloadable'|'downloading'|'unavailable'|'phrasebook'>} Status.
 */
export async function pairStatus(from, to) {
  if (from === to) return 'available';
  if (!engines().translator) return 'phrasebook';
  try {
    return await withTimeout(scope.Translator.availability({ sourceLanguage: from, targetLanguage: to }), 3000);
  } catch (error) {
    return 'unavailable';
  }
}

const translators = new Map();

/**
 * The phrasebook: an exact glossary term, question or safety line, in any
 * of the twelve languages, looked up rather than translated.
 *
 * @returns {string|null} The target-language text, or null if it is not in the book.
 */
export function phrasebook(text, from, to) {
  const norm = (s) => String(s || '').trim().toLowerCase().replace(/[\s.?!？。！¿¡]+$/u, '').replace(/^[¿¡]/, '');
  const wanted = norm(text);
  if (!wanted) return null;
  for (const entry of [...GLOSSARY, ...PHRASES]) {
    const languages = from && from !== 'auto' ? [from] : HUB_LANGS.map((l) => l.id);
    if (languages.some((l) => norm(entry[l]) === wanted)) return entry[to];
  }
  for (const id of Object.keys(SAFETY)) if (norm(SAFETY[id]) === wanted) return SAFETY[to];
  return null;
}

/**
 * Translate text on the device.
 *
 * @param {string} text Source text.
 * @param {string} from Source language id.
 * @param {string} to Target language id.
 * @param {{ onProgress?: (fraction: number) => void, quick?: boolean }} [options] Model-download
 *   progress; `quick` uses the AI only if its model is already on the device (no download wait).
 * @returns {Promise<{ text: string, ms: number, engine: 'on-device AI'|'phrasebook'|'same language'|'none', note?: string }>} The result.
 */
export async function translate(text, from, to, options = {}) {
  const started = performance.now();
  const done = (out, engine, note) => ({ text: out, ms: Math.max(0, performance.now() - started), engine, note });
  if (!text || !text.trim()) return done('', 'none');
  if (from === to) return done(text, 'same language');
  const bookStart = performance.now();
  const book = phrasebook(text, from, to);
  const bookMs = performance.now() - bookStart;
  if (engines().translator && options.quick && (await pairStatus(from, to)) !== 'available') {
    if (book) return done(book, 'phrasebook', 'The on-device model for this pair is not downloaded yet.');
    return done('', 'none', 'The on-device model for this pair is not downloaded yet — translate once in the main box to fetch it.');
  }
  if (engines().translator) {
    const key = `${from}>${to}`;
    try {
      if (!translators.has(key)) {
        const entry = { listeners: new Set(), promise: null };
        entry.promise = scope.Translator.create({
          sourceLanguage: from,
          targetLanguage: to,
          monitor(m) { m.addEventListener('downloadprogress', (e) => entry.listeners.forEach((fn) => fn(e.loaded))); },
        });
        entry.promise.catch(() => translators.delete(key));
        translators.set(key, entry);
      }
      const entry = translators.get(key);
      // Wait for the model, but not forever: 15 s of silence, or 45 s after
      // the last download progress, and the phrasebook answers instead while
      // the download carries on in the background.
      const translator = await new Promise((resolve, reject) => {
        let timer = setTimeout(() => reject(new Error('the on-device model is not ready yet')), 15000);
        const onProgress = (f) => {
          clearTimeout(timer);
          timer = setTimeout(() => reject(new Error('the on-device model is still downloading')), 45000);
          options.onProgress?.(f);
        };
        entry.listeners.add(onProgress);
        entry.promise.then(
          (t) => { clearTimeout(timer); entry.listeners.delete(onProgress); resolve(t); },
          (e) => { clearTimeout(timer); entry.listeners.delete(onProgress); reject(e); },
        );
      });
      const out = await translator.translate(text);
      return done(out, 'on-device AI');
    } catch (error) {
      const raw = error.message || error.name || 'unknown error';
      const why = /gesture/i.test(raw) ? 'its model needs downloading — press Translate to start' : raw;
      const waited = (performance.now() - started) / 1000;
      // The latency shown is the engine that answered; the wait is in the note.
      const fallback = (out, engine, note) => ({ text: out, ms: bookMs, engine, note });
      if (book) return fallback(book, 'phrasebook', `On-device AI unavailable for this pair after ${waited.toFixed(0)} s (${why}), so this came from the phrasebook.`);
      return fallback('', 'none', `The on-device translator could not run this pair after ${waited.toFixed(0)} s: ${why}.`);
    }
  }
  if (book) return done(book, 'phrasebook');
  return done('', 'none', 'This browser has no on-device translator (Chrome 138 or later on desktop has one). The glossary, the questions and the safety line still work from the phrasebook.');
}

let detector = null;

/**
 * Work out what language some text is in: the on-device detector where
 * there is one, otherwise the script and its commonest words.
 *
 * @returns {Promise<{ lang: string, confidence: number, engine: string }>} The best guess.
 */
export async function detect(text) {
  if (engines().detector) {
    try {
      // Use the model only if it is already on the device; otherwise start
      // fetching it for next time and answer from the script heuristic now.
      const ready = await withTimeout(scope.LanguageDetector.availability(), 2000);
      if (ready === 'available') {
        detector ||= await withTimeout(scope.LanguageDetector.create(), 4000);
        const [best] = await withTimeout(detector.detect(text), 3000);
        if (best && best.detectedLanguage && best.detectedLanguage !== 'und') {
          return { lang: best.detectedLanguage.split('-')[0], confidence: best.confidence, engine: 'on-device AI' };
        }
      } else if (ready === 'downloadable' && !detecting) {
        detecting = scope.LanguageDetector.create().then((d) => { detector = d; }, () => {});
      }
    } catch (error) { /* fall through to the heuristic */ }
  }
  return { ...guessLanguage(text), engine: 'script + word heuristic' };
}

let detecting = null;

/** Reject if a promise has not settled in time. */
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), ms);
    Promise.resolve(promise).then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });
}

const STOPWORDS = {
  en: 'the and is of to in that it for not with are this was what does',
  es: 'el la los las que de y es un una por para con no se del lo qué está',
  fr: 'le la les des est et une un du que pas pour avec ce sont il qui dans',
  de: 'der die das und ist nicht ein eine mit zu den von sie es ich wird was',
  pt: 'o a os as que de e é um uma não para com do da em foi está são',
  it: 'il lo la gli le che di e è un una non per con del della sono stato',
};
const STOP = Object.fromEntries(Object.entries(STOPWORDS).map(([k, v]) => [k, new Set(v.split(' '))]));

/**
 * Guess a language from its script, then (for Latin text) from its
 * commonest function words and accents.
 *
 * @returns {{ lang: string, confidence: number }} The guess.
 */
export function guessLanguage(text) {
  const s = String(text || '');
  const count = (re) => (s.match(re) || []).length;
  const letters = Math.max(1, count(/\p{L}/gu));
  const scripts = [
    ['ar', count(/[؀-ۿ]/g)],
    ['hi', count(/[ऀ-ॿ]/g)],
    ['ko', count(/[가-힯ᄀ-ᇿ]/g)],
    ['ja', count(/[぀-ヿ]/g) * 3],
    ['zh', count(/[一-鿿]/g)],
    ['ru', count(/[Ѐ-ӿ]/g)],
  ].sort((a, b) => b[1] - a[1]);
  if (scripts[0][1] > 0) {
    // Japanese mixes kanji with kana; any kana at all means Japanese.
    if (scripts[0][0] === 'zh' && count(/[぀-ヿ]/g)) return { lang: 'ja', confidence: 0.9 };
    return { lang: scripts[0][0], confidence: Math.min(0.99, 0.6 + scripts[0][1] / letters) };
  }
  const words = s.toLowerCase().match(/\p{L}+/gu) || [];
  const score = Object.fromEntries(Object.keys(STOP).map((k) => [k, words.filter((w) => STOP[k].has(w)).length]));
  if (/[ñ¿¡]/i.test(s)) score.es += 2;
  if (/[ßäöü]/i.test(s)) score.de += 2;
  if (/[ãõ]/i.test(s)) score.pt += 2;
  if (/[œêîûëï]|ç[aoue]|\bl’|\bd’|\bqu’/i.test(s)) score.fr += 2;
  if (/\b(è|perché|gli|della|sono)\b/i.test(s)) score.it += 1;
  const ranked = Object.entries(score).sort((a, b) => b[1] - a[1]);
  if (!ranked[0][1]) return { lang: 'en', confidence: 0.2 };
  const total = ranked.reduce((sum, [, v]) => sum + v, 0);
  return { lang: ranked[0][0], confidence: Math.min(0.95, ranked[0][1] / total) };
}
