// Nightly run: collect -> score -> Claude strategy -> briefing.md + plan.csv in out/<date>/
// usage: node src/run.mjs [--topic gta6|ff7-revelation|ff-resonance] [--days 5] [--start YYYY-MM-DD] [--outlier 5] [--max-followers N] [--no-ai]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectAll } from "./collect.mjs";
import { score, hashtagTable } from "./score.mjs";
import { batchBaselines, brandDeals, creators, outliers, writeIndex, youtubeBaselines } from "./intel.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const slug = opt("topic", process.env.TOPIC || "gta6");
const cfg = JSON.parse(fs.readFileSync(path.join(root, "topics", `${slug}.json`), "utf8"));
const topic = cfg.topic;
const days = +opt("days", 5);
const tz = process.env.TIMEZONE || "America/Los_Angeles";
const start = opt("start", new Date().toLocaleDateString("en-CA", { timeZone: tz }));
const out = path.join(root, "out", slug, start); fs.mkdirSync(out, { recursive: true });

const { items, status } = await collectAll(cfg, path.join(root, "data", slug));
const scored = score(items), tags = hashtagTable(scored);
// Creator intelligence: baselines, true breakouts, creators, brand deals.
let baselines = batchBaselines(scored);
try { Object.assign(baselines, await youtubeBaselines(scored.filter((i) => i.channel_id).slice(0, 40).map((i) => i.channel_id))); }
catch (e) { status.baselines = `error: ${e.message}`; }
const breakouts = outliers(scored, baselines, { min: +opt("outlier", 5) });
const deals = brandDeals(scored);
const topCreators = creators(scored, baselines, { topic: cfg.topic_regex || cfg.search, maxFollowers: +opt("max-followers", Infinity) }).slice(0, 25);
if (!args.includes("--no-ai") && scored.length) {
  const { enrich } = await import("./agent.mjs");
  try { await enrich(scored.slice(0, 30)); } catch (e) { status.enrich = `error: ${e.message}`; }
}
fs.writeFileSync(path.join(out, "posts.json"), JSON.stringify(scored, null, 1));
fs.writeFileSync(path.join(out, "intel.json"), JSON.stringify({ baselines, breakouts: breakouts.map((b) => b.url), creators: topCreators, deals }, null, 1));
const indexed = writeIndex(path.join(root, "data", slug, "index.jsonl"), scored);
console.log("sources:", status, `| ${scored.length} posts scored | ${breakouts.length} breakouts | ${deals.length} brands | index ${indexed}`);

let strat = null;
if (!args.includes("--no-ai")) {
  const { strategize } = await import("./agent.mjs");
  strat = await strategize({ topic, rules: cfg.rules, scored, hashtags: tags, startDate: start, days, timezone: tz });
  fs.writeFileSync(path.join(out, "strategy.json"), JSON.stringify(strat, null, 2));
}

const md = [`# ${topic}: viral briefing, ${start}`, "", "## Sources", ...Object.entries(status).map(([k, v]) => `- ${k}: ${v}`), "",
  "## Top posts by viral score", "| # | Platform | Score | Views/hr | Title |", "|---|---|---|---|---|",
  ...scored.slice(0, 20).map((p, i) => `| ${i + 1} | ${p.platform} | ${p.viral_score} | ${p.views_per_hour} | [${p.title.replace(/\|/g, "/").slice(0, 70)}](${p.url}) |`), "",
  "## Breakouts (views vs the creator's own usual)", ...(breakouts.length ? breakouts.slice(0, 15).map((p) => `- **${p.outlier_x}x** ${p.author}: [${p.title.replace(/\|/g, "/").slice(0, 80)}](${p.url})${p.labels ? ` · hook: ${p.labels.hook_type}, ${p.labels.format}` : ""}`) : ["- none at this threshold (needs YOUTUBE_API_KEY or creators with 3+ posts in the batch)"]), "",
  "## Creators on this topic", "| Creator | Platform | Followers | Topic posts | Posts/wk | Usual views |", "|---|---|---|---|---|---|",
  ...topCreators.map((c) => `| ${c.creator} | ${c.platform} | ${c.followers ?? "not measured"} | ${c.topic_posts} | ${c.posts_per_week ?? "-"} | ${c.median_views ?? "-"} |`), "",
  "## Brand deals seen", ...(deals.length ? deals.slice(0, 15).map((d) => `- **${d.brand}**: ${d.posts} posts with ${d.creators.map((c) => `${c.creator}${c.posts > 1 ? ` (x${c.posts}, rebooked)` : ""}`).join(", ")}`) : ["- none detected in titles/captions/descriptions"]), "",
  "## Hashtags", ...tags.map((t) => `- #${t.tag}: ${t.posts} posts, avg score ${t.avg_score} (${t.platforms.join(", ")})`)];
if (strat) {
  const b = strat.briefing;
  md.push("", `## ${b.headline}`, ...b.what_is_working.map((w) => `- **${w.trend}**: ${w.why} (${w.evidence.join(", ")})`),
    "", "### Formats", ...b.formats.map((f) => `- ${f}`), "", "### Avoid", ...b.avoid.map((f) => `- ${f}`),
    "", "## Ideas", ...strat.ideas.map((x) => `- **${x.title}**: hook "${x.hook}" · ${x.format} · ${x.platforms.join("/")} · needs: ${x.asset_needed}`));
  const rows = [["date", "time_local", "platform", "idea", "caption", "hashtags"]];
  for (const d of strat.plan) for (const p of d.posts) rows.push([d.date, p.time_local, p.platform, p.idea_title, p.caption, p.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")]);
  fs.writeFileSync(path.join(out, "plan.csv"), rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n"));
}
fs.writeFileSync(path.join(out, "briefing.md"), md.join("\n"));
console.log(`wrote ${out}`);
