/**
 * BEAUTY OS writers: research, listing (per channel), GEO page copy and outreach, each a Claude
 * call with a strict JSON schema. Uses the same browser-only key as COLIN OS (same origin).
 * Every output is re-checked by the deterministic rules in core.js before it is shown.
 *
 * @module beauty-os/agents
 */
import Anthropic from '../../viralx/vendor/anthropic/sdk.mjs';

export const MODEL = 'claude-opus-5-5';
const KEY = 'colin-os.anthropicKey';
export const getKey = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
export const setKey = (k) => { try { k ? localStorage.setItem(KEY, k.trim()) : localStorage.removeItem(KEY); } catch { /* private mode */ } };

const str = { type: 'string' };
const strs = { type: 'array', items: str };
const obj = (props) => ({ type: 'object', additionalProperties: false, required: Object.keys(props), properties: props });

const SYSTEM = `You are part of BEAUTY OS, the growth team for a hair, skin and anti-aging brand selling on Shopify, TikTok Shop and Amazon (dropshipping and private label).
Rules you never break:
- Cosmetic claims only. Say "reduces the appearance of", "for fuller-looking", "improves the look of". Never say a product regrows hair, boosts collagen, heals, treats, cures, repairs, or removes wrinkles; never claim SPF, "FDA approved", "clinically proven" or "#1" unless the facts provided include proof.
- Never invent ingredients, percentages, studies, reviews, ratings, sales numbers or contacts. If a fact is missing, write [ADD: what is needed].
- Follow each channel's rules: Amazon titles ≤200 chars with no promo words or ! $ ? _ { } ^ ¬ ¦, five bullets, backend search terms ≤249 bytes with no title repeats and no commas; Shopify SEO title ≤60 chars, meta description ≤155; TikTok Shop product name 25–255 chars.
- Write for search engines AND AI answer engines (GEO): answer first, specific, who it is for, how to use, honest comparisons, real FAQs.
- Creator content requires FTC disclosure; email follows CAN-SPAM.`;

async function call(user, schema, maxTokens = 8000) {
  const client = new Anthropic({ apiKey: getKey(), dangerouslyAllowBrowser: true });
  const res = await client.beta.messages.create({
    model: MODEL, max_tokens: maxTokens, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
    system: SYSTEM, messages: [{ role: 'user', content: user }],
  });
  if (res.stop_reason === 'refusal') throw new Error(`Claude declined (${res.stop_details?.explanation || 'policy'})`);
  if (res.stop_reason === 'max_tokens') throw new Error('Response was cut off; try again.');
  return JSON.parse(res.content.filter((x) => x.type === 'text').map((x) => x.text).join(''));
}

/** Product ideas for a niche, with how to validate each before spending. */
export const researchIdeas = (niche, notes = '') => call(
  `Suggest 8 product ideas for this niche: "${niche}". ${notes}\nFor each: what it is, the buyer, why it can sell now on TikTok Shop / Amazon / Shopify (label anything that is your estimate), a price range, the cosmetic-safe main claim, risks (regulatory, returns, shipping, saturation), the content angle that sells it, and 3 checks to validate before ordering inventory (e.g. Google Trends term, TikTok Creative Center hashtag, Amazon BSR range to look for).`,
  obj({ ideas: { type: 'array', items: obj({ name: str, category: str, buyer: str, why: str, priceRange: str, mainClaim: str, risks: strs, contentAngle: str, validate: strs }) } }),
);

const LISTING_SCHEMA = {
  amazon: obj({ title: str, bullets: strs, searchTerms: str, description: str }),
  shopify: obj({ title: str, seoTitle: str, metaDescription: str, handle: str, description: str, faqs: { type: 'array', items: obj({ q: str, a: str }) } }),
  tiktok: obj({ title: str, description: str, sellingPoints: strs, videoHooks: strs }),
};

/** A listing for one channel from product facts and target keywords. */
export const writeListing = (channel, facts, keywords) => call(
  `Write the ${channel} listing.\nProduct facts (use only these):\n${facts}\n\nTarget keywords (most important first):\n${keywords || '[none given: choose sensible ones and say so]'}`,
  LISTING_SCHEMA[channel],
);

/** Rewrites a product page for AI answer engines. */
export const writeGeoPage = (facts, current) => call(
  `Rewrite this product page so ChatGPT, Perplexity, Gemini and Google AI Overviews can quote it. Answer-first opening; who it is for and not for; key ingredients with concentrations ONLY if given; how to use; one honest comparison; 5 FAQs real shoppers ask.\nFacts:\n${facts}\n\nCurrent page:\n${current || '(none)'}`,
  obj({ page: str, faqs: { type: 'array', items: obj({ q: str, a: str }) }, comparison: str, missingFacts: strs }),
);

/** A personalised first email (or DM) plus two follow-ups for one lead. */
export const writeOutreach = (type, lead, brand) => call(
  `Write outreach to this ${type} lead. Lead (only use these facts): ${JSON.stringify(lead)}\nOur brand: ${JSON.stringify(brand)}\nFirst touch under 110 words, one ask, no more than one link. Then follow-ups at day 3 and day 8, each shorter. Include the sender name, the brand's physical address and a "reply stop" opt-out at the end of every email.${type === 'creator' ? ' Also write a 280-character TikTok/Instagram DM version and state that paid posts need #ad.' : ''}`,
  obj({ subject: str, body: str, followUps: strs, dm: str }),
);

export function explain(e) {
  if (e instanceof Anthropic.AuthenticationError) return 'That API key was rejected. Check it at console.anthropic.com.';
  if (e instanceof Anthropic.RateLimitError) return 'Rate limited. Wait a minute and try again.';
  if (e instanceof Anthropic.APIConnectionError) return 'Could not reach api.anthropic.com. Check your connection.';
  if (e instanceof Anthropic.APIError) return `API error ${e.status}: ${e.message}`;
  return e?.message || String(e);
}
