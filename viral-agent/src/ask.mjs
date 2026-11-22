// Ask the index questions in plain English, or break down one post.
//   node src/ask.mjs --topic gta6 "find creators under 200K who posted 3+ GTA 6 guides since October"
//   node src/ask.mjs --topic gta6 --breakdown https://youtu.be/abc123 [--transcript file.txt]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readIndex } from "./intel.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const slug = opt("topic", process.env.TOPIC || "gta6");
const rows = readIndex(path.join(root, "data", slug, "index.jsonl"));
const latest = fs.existsSync(path.join(root, "out", slug)) ? fs.readdirSync(path.join(root, "out", slug)).sort().at(-1) : null;
const intel = latest && fs.existsSync(path.join(root, "out", slug, latest, "intel.json")) ? JSON.parse(fs.readFileSync(path.join(root, "out", slug, latest, "intel.json"), "utf8")) : {};
const { ask, breakdown } = await import("./agent.mjs");

const url = opt("breakdown");
if (url) {
  const post = rows.find((r) => r.url === url) || { url, note: "not in the index: only the URL is known" };
  const t = opt("transcript"); if (t) post.transcript = fs.readFileSync(t, "utf8");
  const base = Object.values(intel.baselines || {}).find((b) => b.channel_id && b.channel_id === post.channel_id) || null;
  console.log(JSON.stringify(await breakdown(post, base), null, 2));
} else {
  const question = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--")).join(" ");
  if (!question) { console.error('usage: ask.mjs --topic <slug> "question"   |   --breakdown <url>'); process.exit(2); }
  if (!rows.length) { console.error(`No index for ${slug} yet: run npm run nightly -- --topic ${slug} first.`); process.exit(1); }
  // Keep the strongest and most relevant rows so the question fits in one call.
  const words = question.toLowerCase().match(/[a-z0-9]{4,}/g) || [];
  const rel = (r) => words.filter((w) => `${r.title} ${r.author} ${r.description || ""}`.toLowerCase().includes(w)).length;
  const pick = rows.map((r) => ({ r, s: rel(r) * 10 + (r.outlier_x || 0) + (r.viral_score || 0) / 20 })).sort((a, b) => b.s - a.s).slice(0, 150)
    .map(({ r }) => ({ platform: r.platform, url: r.url, title: r.title, author: r.author, published_at: r.published_at, views: r.views, outlier_x: r.outlier_x, labels: r.labels, deals: r.deals }));
  console.log(JSON.stringify(await ask(question, pick, { creators: intel.creators, deals: intel.deals }), null, 2));
}
