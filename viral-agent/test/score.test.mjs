import assert from "node:assert/strict";
import { score, hashtagTable } from "../src/score.mjs";
const now = Date.parse("2026-11-12T12:00:00Z"), h = (n) => new Date(now - n * 3600e3).toISOString();
const items = [
  { platform: "youtube", title: "fast", published_at: h(2), views: 400000, likes: 30000, comments: 2000, shares: 0, hashtags: ["gta6", "shorts"] },
  { platform: "youtube", title: "slow", published_at: h(60), views: 400000, likes: 5000, comments: 100, shares: 0, hashtags: ["gta6"] },
  { platform: "youtube", title: "tiny", published_at: h(10), views: 900, likes: 10, comments: 1, shares: 0, hashtags: ["shorts"] },
];
const s = score(items, now);
assert.equal(s[0].title, "fast"); assert.equal(s[0].viral_score, 100); assert.equal(s.at(-1).title, "tiny");
assert.ok(hashtagTable(s).find((t) => t.tag === "gta6").posts === 2);
console.log("score tests passed");
