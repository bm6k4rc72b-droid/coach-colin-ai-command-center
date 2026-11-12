// Virality score: how fast a post is growing, how hard people engage with it, and how far it
// beats its platform's typical post in the same batch. 0-100, comparable within one run.

const W = { comments: 3, shares: 5, likes: 1 };

export function score(items, now = Date.now()) {
  const byPlatform = {};
  for (const it of items) {
    const ageH = Math.max(1, (now - Date.parse(it.published_at)) / 3600e3);
    it.age_hours = +ageH.toFixed(1);
    it.views_per_hour = Math.round(it.views / ageH);
    it.engagement_rate = it.views ? (it.likes * W.likes + it.comments * W.comments + it.shares * W.shares) / it.views : 0;
    (byPlatform[it.platform] ||= []).push(it);
  }
  const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  for (const list of Object.values(byPlatform)) {
    const mv = median(list.map((i) => i.views_per_hour)) || 1, me = median(list.map((i) => i.engagement_rate)) || 1e-6;
    for (const it of list) {
      const velocity = Math.log2(1 + it.views_per_hour / mv);        // 1 = median, grows slowly
      const engage = Math.log2(1 + it.engagement_rate / me);
      const fresh = it.age_hours < 24 ? 1.15 : it.age_hours < 72 ? 1 : 0.8;
      it.raw = (velocity * 0.65 + engage * 0.35) * fresh;
    }
  }
  const max = Math.max(1e-9, ...items.map((i) => i.raw));
  for (const it of items) { it.viral_score = Math.round((it.raw / max) * 100); delete it.raw; }
  return items.sort((a, b) => b.viral_score - a.viral_score);
}

export function hashtagTable(items, top = 25) {
  const t = {};
  for (const it of items) for (const h of new Set(it.hashtags)) {
    const r = (t[h] ||= { tag: h, posts: 0, views: 0, score: 0, platforms: new Set() });
    r.posts++; r.views += it.views; r.score += it.viral_score; r.platforms.add(it.platform);
  }
  return Object.values(t).map((r) => ({ ...r, platforms: [...r.platforms], avg_score: Math.round(r.score / r.posts) }))
    .filter((r) => r.posts >= 2).sort((a, b) => b.avg_score * Math.log2(1 + b.posts) - a.avg_score * Math.log2(1 + a.posts)).slice(0, top);
}
