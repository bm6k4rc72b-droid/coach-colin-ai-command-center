// The strategist: Claude reads the scored data, searches the web for what the APIs can't reach
// (TikTok trends, news, memes), and writes the briefing, hooks and a 5-day posting plan as JSON.
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

const SYSTEM = `You are the research and strategy lead for a short-form video creator who covers ${"${TOPIC}"}.
Work from evidence. Every trend you report cites where you saw it (a post URL from the data or a web source).
Never invent view counts; say "not measured" when a number isn't in the data or a source.
outlier_x is a post's views divided by its creator's usual views: weight true breakouts (5x+) over raw view counts, and build ideas from the hooks and formats of the breakouts.
Content rules the creator follows, which your ideas must respect:
${"${RULES}"}
- Gameplay the creator records, official trailers used briefly for commentary, and original graphics are fine.
- Captions must work with the sound off. Hooks land in the first 1.5 seconds.
Return ONLY a JSON object, no prose around it, with this shape:
{"briefing":{"headline":str,"what_is_working":[{"trend":str,"why":str,"evidence":[str]}],"formats":[str],"sounds":[str],"hashtags":{"tiktok":[str],"instagram":[str],"youtube":[str],"x":[str]},"avoid":[str]},
 "ideas":[{"title":str,"hook":str,"format":str,"platforms":[str],"why_now":str,"asset_needed":str}],
 "plan":[{"date":"YYYY-MM-DD","posts":[{"time_local":"HH:MM","platform":str,"idea_title":str,"caption":str,"hashtags":[str]}]}]}`;

export async function strategize({ topic, rules = [], scored, hashtags, startDate, days = 5, timezone = "America/Los_Angeles" }) {
  const data = { top_posts: scored.slice(0, 60).map(({ platform, url, title, author, views, views_per_hour, engagement_rate, viral_score, age_hours, outlier_x, labels, deals }) =>
    ({ platform, url, title, author, views, views_per_hour, engagement_rate: +engagement_rate.toFixed(4), viral_score, age_hours, outlier_x, labels, deals })), hashtags };
  const messages = [{ role: "user", content:
    `Topic: ${topic}\nPlan starts ${startDate} for ${days} days, times in ${timezone}.\n` +
    `Scored platform data (may be empty for platforms without API keys):\n${JSON.stringify(data)}\n\n` +
    `Search the web for what is going viral about the topic right now on TikTok, Instagram Reels, YouTube Shorts, X and Reddit, ` +
    `fill the gaps in the data, then return the JSON.` }];

  // Server-side web search; the API may pause a long search turn, so resume until done.
  for (let turn = 0; turn < 6; turn++) {
    const res = await client.beta.messages.create({
      model: MODEL, max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
      output_config: { effort: "high" },
      system: SYSTEM.replace("${TOPIC}", topic).replace("${RULES}", rules.map((r) => `- ${r}`).join("\n")),
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 20 }],
      messages,
    });
    if (res.stop_reason === "pause_turn") { messages.push({ role: "assistant", content: res.content }); continue; }
    if (res.stop_reason === "refusal") throw new Error(`Claude declined: ${res.stop_details?.explanation ?? "no detail"}`);
    const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    return JSON.parse(json);
  }
  throw new Error("web search did not finish in 6 turns");
}

// One plain Claude call (no web search) that returns JSON.
async function json(system, user, maxTokens = 12000) {
  const res = await client.beta.messages.create({
    model: MODEL, max_tokens: maxTokens, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    output_config: { effort: "medium" }, system, messages: [{ role: "user", content: user }],
  });
  if (res.stop_reason === "refusal") throw new Error(`Claude declined: ${res.stop_details?.explanation ?? "no detail"}`);
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const starts = [text.indexOf("{"), text.indexOf("[")].filter((n) => n >= 0);
  return JSON.parse(text.slice(Math.min(...starts), Math.max(text.lastIndexOf("}"), text.lastIndexOf("]")) + 1));
}

/**
 * Enrich: label each post's hook, format, offer, proof points and topic from its title, caption and
 * (when present) transcript. Returns the posts with a `labels` object each.
 */
export async function enrich(posts) {
  if (!posts.length) return posts;
  const rows = posts.map((p, i) => ({ i, platform: p.platform, title: p.title, text: (p.description || "").slice(0, 800), transcript: (p.transcript || "").slice(0, 1500), views: p.views, outlier_x: p.outlier_x ?? null }));
  const out = await json(
    "You label short-form social posts for a content strategist. Use only what is in each post's text; write \"unclear\" when the text does not show it. Return ONLY a JSON array.",
    `For each post return {"i":n,"hook":"the opening line or promise, quoted or paraphrased","hook_type":"question|bold claim|curiosity gap|listicle|story|tutorial|reaction|shock|other","format":"e.g. talking head, screen recording, gameplay clip, skit, slideshow","offer":"what is sold or asked for, or none","proof":["proof points used"],"topic":"2-5 words"}.\n${JSON.stringify(rows)}`);
  for (const l of out) if (posts[l.i]) { const { i, ...labels } = l; posts[i].labels = labels; }
  return posts;
}

/** Break down one post: why it worked, what to copy, what not to. */
export async function breakdown(post, baseline = null) {
  return json(
    "You break down a single social post for a creator who wants to make their own original version. Base every point on the post's data, text and transcript; say \"not measured\" for numbers you were not given. Return ONLY a JSON object.",
    `Post: ${JSON.stringify({ ...post, transcript: (post.transcript || "").slice(0, 6000) })}\nCreator baseline: ${JSON.stringify(baseline)}\n` +
    'Return {"verdict":"one line: breakout or not, and by how much vs the creator\'s usual","why_it_worked":[str],"hook":{"text":str,"why":str},"structure":[{"beat":str,"seconds":str}],"retention_tricks":[str],"format":str,"audience":str,"copy_this":[str],"avoid":[str],"original_versions":[{"title":str,"hook":str,"how":str}]}');
}

/** Answer a natural-language question from the index (rows already filtered to fit). */
export async function ask(question, rows, extras = {}) {
  return json(
    "You answer questions about social posts and creators using ONLY the rows given (posts with views, outlier_x = views divided by the creator's usual views, labels, deals) and the extra tables. Cite post urls. If the rows can't answer it, say exactly what data is missing. Return ONLY a JSON object.",
    `Question: ${question}\nExtras: ${JSON.stringify(extras).slice(0, 20000)}\nRows: ${JSON.stringify(rows)}\nReturn {"answer":str,"items":[{"name":str,"why":str,"urls":[str]}],"missing":str|null}`, 8000);
}
