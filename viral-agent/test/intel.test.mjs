import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { batchBaselines, brandDeals, creators, dealsIn, outliers, readIndex, writeIndex } from "../src/intel.mjs";

const d = (s) => `2026-11-${String(s).padStart(2, "0")}T12:00:00Z`;
const items = [
  { platform: "youtube", channel_id: "A", author: "Ana", url: "u1", title: "GTA 6 money guide", published_at: d(10), views: 600000, description: "Sponsored by NordVPN. #ad" },
  { platform: "youtube", channel_id: "A", author: "Ana", url: "u2", title: "GTA 6 map tips", published_at: d(12), views: 40000, description: "Thanks to NordVPN for sponsoring" },
  { platform: "youtube", channel_id: "B", author: "Bo", url: "u3", title: "GTA 6 review", published_at: d(13), views: 900000, description: "use code BO at Razer" },
];
const baselines = {
  "youtube:A": { platform: "youtube", name: "Ana", followers: 150000, median_views: 50000, posts_per_week: 3, recent_titles: [{ title: "GTA 6 heist guide", published_at: d(5), views: 50000 }] },
  "youtube:B": { platform: "youtube", name: "Bo", followers: 2000000, median_views: 800000, posts_per_week: 1, recent_titles: [] },
};

// Outliers are judged against the creator's own usual views, not raw views.
const out = outliers(items, baselines, { min: 5 });
assert.deepEqual(out.map((o) => o.url), ["u1"]);
assert.equal(items[0].outlier_x, 12);
assert.equal(items[2].outlier_x, 1.1); // 900K views, but normal for Bo

// Creator filters: under 200K, 3+ GTA 6 posts since Nov 1.
const c = creators(items, baselines, { maxFollowers: 200000, topic: "gta 6", minTopicPosts: 3, since: "2026-11-01" });
assert.deepEqual(c.map((r) => r.creator), ["Ana"]);
assert.equal(c[0].topic_posts, 3);

// Brand deals and rebookings.
assert.deepEqual(dealsIn("Huge thanks to Raid Shadow for sponsoring this").brands, ["Raid Shadow"]);
const deals = brandDeals(items);
const nord = deals.find((x) => x.brand === "NordVPN");
assert.equal(nord.posts, 2);
assert.deepEqual(nord.rebooked, ["Ana"]);
assert.ok(deals.find((x) => x.brand === "Razer"));
assert.equal(items[0].disclosed_ad, true);

// Batch baselines need 3+ posts by the creator.
assert.deepEqual(Object.keys(batchBaselines(items)), []);

// The index dedupes by url and keeps the newest data.
const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "idx-")), "index.jsonl");
writeIndex(f, items); writeIndex(f, [{ ...items[0], views: 700000 }]);
const idx = readIndex(f);
assert.equal(idx.length, 3);
assert.equal(idx.find((r) => r.url === "u1").views, 700000);
console.log("intel tests passed");
