// Collectors: pull recent, high-performing posts about a topic from each platform's official API.
// Each collector runs only if its key is set, and returns the same item shape:
// { platform, id, url, title, author, published_at, views, likes, comments, shares, hashtags[] }
// No logins, no cookies, no scraping behind walls: these are the platforms' public APIs.

const UA = "viral-agent/1.0";
const hoursAgo = (h) => new Date(Date.now() - h * 3600e3).toISOString();
const tags = (s = "") => [...s.matchAll(/#([\p{L}\p{N}_]+)/gu)].map((m) => m[1].toLowerCase());

async function getJSON(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { "user-agent": UA, ...(opts.headers || {}) } });
  if (!r.ok) throw new Error(`${r.status} ${url.split("?")[0]}`);
  return r.json();
}

// YouTube Data API v3: search last N hours, then fetch stats for the hits.
export async function youtube(query, { hours = 72, max = 50 } = {}) {
  const key = process.env.YOUTUBE_API_KEY; if (!key) return [];
  const q = new URLSearchParams({ part: "snippet", q: query, type: "video", order: "viewCount",
    publishedAfter: hoursAgo(hours), maxResults: String(max), key });
  const s = await getJSON(`https://www.googleapis.com/youtube/v3/search?${q}`);
  const ids = s.items.map((i) => i.id.videoId).join(",");
  if (!ids) return [];
  const v = await getJSON(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${ids}&key=${key}`);
  return v.items.map((i) => ({
    platform: "youtube", id: i.id, url: `https://youtu.be/${i.id}`, title: i.snippet.title,
    author: i.snippet.channelTitle, published_at: i.snippet.publishedAt,
    views: +i.statistics.viewCount || 0, likes: +i.statistics.likeCount || 0,
    comments: +i.statistics.commentCount || 0, shares: 0,
    short: /^PT(\d+S|[0-5]?\dS|1M)$/.test(i.contentDetails.duration),
    hashtags: tags(`${i.snippet.title} ${i.snippet.description}`),
  }));
}

// Reddit: app-only OAuth (create a "script" app at reddit.com/prefs/apps).
export async function reddit(subs = ["GTA6", "GTA", "gaming", "PS5"], { query = "GTA 6", limit = 50 } = {}) {
  const id = process.env.REDDIT_CLIENT_ID, secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return [];
  const tok = await getJSON("https://www.reddit.com/api/v1/access_token", {
    method: "POST", body: "grant_type=client_credentials",
    headers: { authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"), "content-type": "application/x-www-form-urlencoded" },
  });
  const out = [];
  for (const sub of subs) {
    const path = sub === "GTA6" ? `r/${sub}/top?t=day&limit=${limit}` : `r/${sub}/search?q=${encodeURIComponent(query)}&restrict_sr=1&sort=top&t=day&limit=${limit}`;
    const j = await getJSON(`https://oauth.reddit.com/${path}`, { headers: { authorization: `Bearer ${tok.access_token}` } });
    for (const { data: p } of j.data.children) out.push({
      platform: "reddit", id: p.id, url: `https://reddit.com${p.permalink}`, title: p.title, author: p.subreddit_name_prefixed,
      published_at: new Date(p.created_utc * 1000).toISOString(), views: p.score * 20, likes: p.score,
      comments: p.num_comments, shares: 0, hashtags: [], flair: p.link_flair_text,
    });
  }
  return out;
}

// X API v2 recent search (paid tier with search access).
export async function x(query = '("GTA 6" OR GTA6 OR "GTA VI") -is:retweet lang:en', { max = 100 } = {}) {
  const bearer = process.env.X_BEARER_TOKEN; if (!bearer) return [];
  const q = new URLSearchParams({ query, max_results: String(max), sort_order: "relevancy",
    "tweet.fields": "public_metrics,created_at,entities", expansions: "author_id", "user.fields": "username" });
  const j = await getJSON(`https://api.x.com/2/tweets/search/recent?${q}`, { headers: { authorization: `Bearer ${bearer}` } });
  const users = Object.fromEntries((j.includes?.users || []).map((u) => [u.id, u.username]));
  return (j.data || []).map((t) => ({
    platform: "x", id: t.id, url: `https://x.com/i/status/${t.id}`, title: t.text, author: users[t.author_id],
    published_at: t.created_at, views: t.public_metrics.impression_count || 0, likes: t.public_metrics.like_count,
    comments: t.public_metrics.reply_count, shares: t.public_metrics.retweet_count + t.public_metrics.quote_count,
    hashtags: (t.entities?.hashtags || []).map((h) => h.tag.toLowerCase()),
  }));
}

// Instagram Graph API hashtag search (needs a Business/Creator account linked to a Facebook app).
export async function instagram(hashtag = "gta6") {
  const token = process.env.IG_ACCESS_TOKEN, user = process.env.IG_USER_ID; if (!token || !user) return [];
  const h = await getJSON(`https://graph.facebook.com/v21.0/ig_hashtag_search?user_id=${user}&q=${hashtag}&access_token=${token}`);
  const hid = h.data?.[0]?.id; if (!hid) return [];
  const m = await getJSON(`https://graph.facebook.com/v21.0/${hid}/top_media?user_id=${user}&fields=id,caption,media_type,permalink,like_count,comments_count,timestamp&limit=50&access_token=${token}`);
  return (m.data || []).map((p) => ({
    platform: "instagram", id: p.id, url: p.permalink, title: (p.caption || "").slice(0, 200), author: "",
    published_at: p.timestamp, views: (p.like_count || 0) * 25, likes: p.like_count || 0,
    comments: p.comments_count || 0, shares: 0, hashtags: tags(p.caption), media_type: p.media_type,
  }));
}

// TikTok: the Research API needs approval, so the default path is a CSV export from TikTok
// Creative Center (Trends > Hashtags / Songs / Videos) dropped into data/tiktok/*.csv.
// Columns read: url,title,author,published_at,views,likes,comments,shares,hashtags
import fs from "node:fs";
import path from "node:path";
export async function tiktokCsv(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".csv"))) {
    const [head, ...rows] = fs.readFileSync(path.join(dir, f), "utf8").trim().split(/\r?\n/);
    const cols = head.split(",").map((c) => c.trim().toLowerCase());
    for (const row of rows) {
      const cells = row.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"'));
      const r = Object.fromEntries(cols.map((c, i) => [c, cells[i] ?? ""]));
      out.push({ platform: "tiktok", id: r.url, url: r.url, title: r.title, author: r.author, published_at: r.published_at || new Date().toISOString(),
        views: +r.views || 0, likes: +r.likes || 0, comments: +r.comments || 0, shares: +r.shares || 0,
        hashtags: (r.hashtags || "").split(/[\s;|]+/).filter(Boolean).map((h) => h.replace(/^#/, "").toLowerCase()) });
    }
  }
  return out;
}

export async function collectAll(topic, dataDir) {
  const jobs = { youtube: youtube(topic), reddit: reddit(), x: x(), instagram: instagram(topic.replace(/\s+/g, "").toLowerCase()), tiktok: tiktokCsv(path.join(dataDir, "tiktok")) };
  const items = [], status = {};
  for (const [name, p] of Object.entries(jobs)) {
    try { const r = await p; items.push(...r); status[name] = r.length ? `${r.length} items` : "skipped (no key or no data)"; }
    catch (e) { status[name] = `error: ${e.message}`; }
  }
  return { items, status };
}
