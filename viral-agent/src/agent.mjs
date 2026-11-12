// The strategist: Claude reads the scored data, searches the web for what the APIs can't reach
// (TikTok trends, news, memes), and writes the briefing, hooks and a 5-day posting plan as JSON.
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

const SYSTEM = `You are the research and strategy lead for a short-form video creator who covers ${"${TOPIC}"}.
Work from evidence. Every trend you report cites where you saw it (a post URL from the data or a web source).
Never invent view counts; say "not measured" when a number isn't in the data or a source.
Content rules the creator follows, which your ideas must respect:
- No leaked or pre-release footage, no spoilers in titles or thumbnails, no AI-generated imagery of the game's characters or world (the publisher treats that as infringing).
- Gameplay the creator records, official trailers used briefly for commentary, and original graphics are fine.
- Captions must work with the sound off. Hooks land in the first 1.5 seconds.
Return ONLY a JSON object, no prose around it, with this shape:
{"briefing":{"headline":str,"what_is_working":[{"trend":str,"why":str,"evidence":[str]}],"formats":[str],"sounds":[str],"hashtags":{"tiktok":[str],"instagram":[str],"youtube":[str],"x":[str]},"avoid":[str]},
 "ideas":[{"title":str,"hook":str,"format":str,"platforms":[str],"why_now":str,"asset_needed":str}],
 "plan":[{"date":"YYYY-MM-DD","posts":[{"time_local":"HH:MM","platform":str,"idea_title":str,"caption":str,"hashtags":[str]}]}]}`;

export async function strategize({ topic, scored, hashtags, startDate, days = 5, timezone = "America/Los_Angeles" }) {
  const data = { top_posts: scored.slice(0, 60).map(({ platform, url, title, author, views, views_per_hour, engagement_rate, viral_score, age_hours }) =>
    ({ platform, url, title, author, views, views_per_hour, engagement_rate: +engagement_rate.toFixed(4), viral_score, age_hours })), hashtags };
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
      system: SYSTEM.replace("${TOPIC}", topic),
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
