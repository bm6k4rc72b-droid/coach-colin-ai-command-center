// Nightly run: collect -> score -> Claude strategy -> briefing.md + plan.csv in out/<date>/
// usage: node src/run.mjs [--topic "GTA 6"] [--days 5] [--start YYYY-MM-DD] [--no-ai]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectAll } from "./collect.mjs";
import { score, hashtagTable } from "./score.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const topic = opt("topic", process.env.TOPIC || "GTA 6");
const days = +opt("days", 5);
const tz = process.env.TIMEZONE || "America/Los_Angeles";
const start = opt("start", new Date().toLocaleDateString("en-CA", { timeZone: tz }));
const out = path.join(root, "out", start); fs.mkdirSync(out, { recursive: true });

const { items, status } = await collectAll(topic, path.join(root, "data"));
const scored = score(items), tags = hashtagTable(scored);
fs.writeFileSync(path.join(out, "posts.json"), JSON.stringify(scored, null, 1));
console.log("sources:", status, `| ${scored.length} posts scored`);

let strat = null;
if (!args.includes("--no-ai")) {
  const { strategize } = await import("./agent.mjs");
  strat = await strategize({ topic, scored, hashtags: tags, startDate: start, days, timezone: tz });
  fs.writeFileSync(path.join(out, "strategy.json"), JSON.stringify(strat, null, 2));
}

const md = [`# ${topic}: viral briefing, ${start}`, "", "## Sources", ...Object.entries(status).map(([k, v]) => `- ${k}: ${v}`), "",
  "## Top posts by viral score", "| # | Platform | Score | Views/hr | Title |", "|---|---|---|---|---|",
  ...scored.slice(0, 20).map((p, i) => `| ${i + 1} | ${p.platform} | ${p.viral_score} | ${p.views_per_hour} | [${p.title.replace(/\|/g, "/").slice(0, 70)}](${p.url}) |`), "",
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
