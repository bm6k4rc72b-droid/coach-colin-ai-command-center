// Creator intelligence on top of the collected posts: the things a social researcher does by hand.
//
//   baselines   each creator's usual views (median of their recent uploads), followers, posting rate
//   outliers    posts that beat their own creator's usual views by N x (true breakouts, not raw views)
//   creators    find creators by follower ceiling, topic posts since a date, posting frequency
//   brandDeals  who brands are working with, from disclosure and sponsor lines, and who they rebook
//   index       every analysed post saved as JSONL so later questions (ask.mjs) can be answered from it
//
// Baselines use the YouTube Data API (YOUTUBE_API_KEY). Other platforms get a baseline only when a
// creator has several posts in the collected data. Nothing here guesses a number that isn't in the data.
import fs from "node:fs";
import path from "node:path";

const median = (a) => { const s = a.filter((n) => Number.isFinite(n)).sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const key = (it) => `${it.platform}:${it.channel_id || it.author || "?"}`;

async function yt(pathAndQuery) {
  const k = process.env.YOUTUBE_API_KEY;
  const r = await fetch(`https://www.googleapis.com/youtube/v3/${pathAndQuery}&key=${k}`);
  if (!r.ok) throw new Error(`${r.status} youtube ${pathAndQuery.split("?")[0]}`);
  return r.json();
}

/**
 * Each YouTube creator's baseline: subscribers, median views of their last `recent` uploads,
 * and uploads per week over that window. Costs about 3 quota units per channel.
 */
export async function youtubeBaselines(channelIds, { recent = 30 } = {}) {
  const out = {};
  if (!process.env.YOUTUBE_API_KEY || !channelIds.length) return out;
  const ids = [...new Set(channelIds)];
  for (let i = 0; i < ids.length; i += 50) {
    const ch = await yt(`channels?part=statistics,contentDetails,snippet&id=${ids.slice(i, i + 50).join(",")}&maxResults=50`);
    for (const c of ch.items || []) {
      try {
        const pl = await yt(`playlistItems?part=contentDetails&playlistId=${c.contentDetails.relatedPlaylists.uploads}&maxResults=${recent}`);
        const vids = (pl.items || []).map((p) => p.contentDetails.videoId);
        const st = vids.length ? await yt(`videos?part=statistics,snippet&id=${vids.join(",")}`) : { items: [] };
        const views = st.items.map((v) => +v.statistics.viewCount || 0);
        const dates = st.items.map((v) => Date.parse(v.snippet.publishedAt)).sort((a, b) => a - b);
        const weeks = dates.length > 1 ? Math.max(1, (dates.at(-1) - dates[0]) / 6048e5) : null;
        out[`youtube:${c.id}`] = {
          platform: "youtube", channel_id: c.id, name: c.snippet.title,
          followers: c.statistics.hiddenSubscriberCount ? null : +c.statistics.subscriberCount,
          median_views: median(views), sample: views.length,
          posts_per_week: weeks ? +(dates.length / weeks).toFixed(2) : null,
          recent_titles: st.items.map((v) => ({ title: v.snippet.title, published_at: v.snippet.publishedAt, views: +v.statistics.viewCount || 0 })),
        };
      } catch (e) { out[`youtube:${c.id}`] = { platform: "youtube", channel_id: c.id, name: c.snippet.title, error: e.message }; }
    }
  }
  return out;
}

/** Baselines from the collected posts themselves, for creators with at least `min` posts in the batch. */
export function batchBaselines(items, { min = 3 } = {}) {
  const by = {};
  for (const it of items) (by[key(it)] ||= []).push(it);
  const out = {};
  for (const [k, list] of Object.entries(by)) if (list.length >= min) {
    out[k] = { platform: list[0].platform, name: list[0].author, median_views: median(list.map((i) => i.views)), sample: list.length, source: "batch" };
  }
  return out;
}

/**
 * Outliers: views divided by the creator's own median. `outlier_x` is set on every post that has a
 * baseline; posts at or above `min` are returned, biggest breakout first.
 */
export function outliers(items, baselines, { min = 5 } = {}) {
  for (const it of items) {
    const b = baselines[key(it)];
    if (b && b.median_views) it.outlier_x = +(it.views / b.median_views).toFixed(1);
  }
  return items.filter((i) => i.outlier_x >= min).sort((a, b) => b.outlier_x - a.outlier_x);
}

/**
 * Creators matching filters. `topic` is a regex tested on post titles (the batch plus the creator's
 * recent uploads from the baseline), counted since `since`.
 */
export function creators(items, baselines, { maxFollowers = Infinity, minFollowers = 0, topic = null, minTopicPosts = 1, since = null, minPostsPerWeek = 0 } = {}) {
  const re = topic ? (topic instanceof RegExp ? topic : new RegExp(topic, "i")) : null;
  const after = since ? Date.parse(since) : -Infinity;
  const by = {};
  for (const it of items) (by[key(it)] ||= { posts: [] }).posts.push(it);
  for (const k of Object.keys(baselines)) by[k] ||= { posts: [] };
  const rows = [];
  for (const [k, { posts }] of Object.entries(by)) {
    const b = baselines[k] || {};
    const titles = new Map();
    for (const p of posts) titles.set(p.title, Date.parse(p.published_at));
    for (const r of b.recent_titles || []) titles.set(r.title, Date.parse(r.published_at));
    const topicPosts = [...titles].filter(([t, d]) => d >= after && (!re || re.test(t))).length;
    const followers = b.followers ?? null;
    if (followers != null && (followers > maxFollowers || followers < minFollowers)) continue;
    if (followers == null && maxFollowers !== Infinity) continue; // can't confirm the ceiling
    if (topicPosts < minTopicPosts) continue;
    if ((b.posts_per_week ?? 0) < minPostsPerWeek) continue;
    rows.push({ creator: b.name || posts[0]?.author, platform: b.platform || posts[0]?.platform, followers, topic_posts: topicPosts,
      posts_per_week: b.posts_per_week ?? null, median_views: b.median_views ?? null, best: posts.sort((a, c) => (c.outlier_x || 0) - (a.outlier_x || 0))[0]?.url || null });
  }
  return rows.sort((a, c) => c.topic_posts - a.topic_posts || (c.median_views || 0) - (a.median_views || 0));
}

// Sponsor and disclosure lines in titles, captions and descriptions.
const DEAL = [
  /(?:[Ss]ponsored|[Pp]resented|[Bb]rought to you|[Pp]owered) by @?([A-Z][\w&.'-]*(?:\s[A-Z][\w&.'-]*){0,3})/g,
  /[Tt]hanks? (?:to )?@?([A-Z][\w&.'-]*(?:\s[A-Z][\w&.'-]*){0,3}) for (?:sponsoring|partnering|supporting)/g,
  /(?:paid )?partnership with @?([A-Z][\w&.'-]*(?:\s[A-Z][\w&.'-]*){0,3})/gi,
  /in partnership with @?([A-Z][\w&.'-]*(?:\s[A-Z][\w&.'-]*){0,3})/gi,
  /use (?:my )?code \w+ (?:at|on|for) @?([A-Z][\w&.'-]*(?:\s[A-Z][\w&.'-]*){0,2})/gi,
];
const DISCLOSED = /#(ad|sponsored|partner|paidpartnership)\b|\bpaid promotion\b/i;

/** Brands found in a post's text, and whether it carries a disclosure tag. */
export function dealsIn(text = "") {
  const brands = new Set();
  for (const re of DEAL) for (const m of text.matchAll(re)) brands.add(m[1].trim().replace(/[.,!:]+$/, ""));
  return { brands: [...brands], disclosed: DISCLOSED.test(text) };
}

/** brand -> creators it worked with, posts per creator (2+ = rebooked), and the posts. */
export function brandDeals(items) {
  const brands = {};
  for (const it of items) {
    const { brands: found, disclosed } = dealsIn(`${it.title || ""}\n${it.description || ""}`);
    if (found.length) it.deals = found;
    if (disclosed) it.disclosed_ad = true;
    for (const b of found) {
      const r = (brands[b] ||= { brand: b, creators: {}, posts: 0 });
      r.posts++;
      const c = (r.creators[it.author || "?"] ||= { creator: it.author, posts: 0, urls: [] });
      c.posts++; c.urls.push(it.url);
    }
  }
  return Object.values(brands).map((r) => {
    const list = Object.values(r.creators).sort((a, b) => b.posts - a.posts);
    return { brand: r.brand, posts: r.posts, creators: list, rebooked: list.filter((c) => c.posts > 1).map((c) => c.creator) };
  }).sort((a, b) => b.posts - a.posts);
}

/** Append analysed posts to the topic's running index (deduplicated by url, newest data wins). */
export function writeIndex(file, items) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const rows = new Map();
  if (fs.existsSync(file)) for (const line of fs.readFileSync(file, "utf8").split("\n")) if (line.trim()) { const r = JSON.parse(line); rows.set(r.url, r); }
  const seen = new Date().toISOString();
  for (const it of items) rows.set(it.url, { ...rows.get(it.url), ...it, seen_at: seen });
  fs.writeFileSync(file, [...rows.values()].map((r) => JSON.stringify(r)).join("\n") + "\n");
  return rows.size;
}

export function readIndex(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
}
