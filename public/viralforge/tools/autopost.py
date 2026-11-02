#!/usr/bin/env python3
"""VIRALFORGE autopost: hands-free posting through the platforms' official APIs.

Why not instagrapi: it logs in through Instagram's private mobile API, which breaks Meta's
terms; accounts using it get checkpoint challenges and bans. This script uses the official
Instagram Graph API (Reels publishing + insights) and TikTok's Content Posting API instead.
Standard library only, so it runs anywhere Python 3.9+ does (a laptop, a $5 VPS, a Raspberry Pi).

Setup (once):
  Instagram: a Business or Creator account linked to a Facebook Page, and a Meta app with
    instagram_business_content_publish (+ instagram_business_manage_insights for insights).
    export IG_USER_ID=...  IG_TOKEN=...   (long-lived token)
  TikTok:    an app with the Content Posting API (video.publish scope).
    export TIKTOK_TOKEN=...
    Until TikTok audits your app, posts are forced to private (SELF_ONLY), and
    PULL_FROM_URL needs the video's domain verified in the TikTok developer portal.

Both platforms pull the video from a public HTTPS URL, so put the rendered MP4 somewhere
public first (S3, Cloudflare R2, a GitHub release asset).

Usage:
  autopost.py plan  --days 7 --slots 07:30,12:15,19:45   # write empty slots into queue.json
  autopost.py add   --at 2026-11-03T07:30 --video https://.../clip.mp4 --caption "..." [--tiktok]
  autopost.py run                                          # post anything due, then every minute
  autopost.py once                                         # post anything due and exit (cron)
  autopost.py insights --limit 10                          # your recent Reels' numbers
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

GRAPH = f"https://graph.facebook.com/{os.environ.get('GRAPH_VERSION', 'v23.0')}"
TIKTOK = "https://open.tiktokapis.com/v2"
QUEUE = Path(os.environ.get("VIRALFORGE_QUEUE", "queue.json"))


def http(method: str, url: str, data: dict | None = None, headers: dict | None = None, as_json: bool = False) -> dict:
    body = None
    headers = dict(headers or {})
    if data is not None:
        if as_json:
            body = json.dumps(data).encode()
            headers["Content-Type"] = "application/json; charset=UTF-8"
        else:
            body = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {url.split('?')[0]} -> {e.code}: {e.read().decode(errors='replace')[:500]}") from None


def env(name: str) -> str:
    v = os.environ.get(name)
    if not v:
        sys.exit(f"Set {name} first (see the top of this file).")
    return v


# ── Instagram (official Graph API) ─────────────────────────────────────────────

def ig_publish_reel(video_url: str, caption: str, cover_url: str | None = None) -> str:
    uid, tok = env("IG_USER_ID"), env("IG_TOKEN")
    params = {"media_type": "REELS", "video_url": video_url, "caption": caption, "share_to_feed": "true", "access_token": tok}
    if cover_url:
        params["cover_url"] = cover_url
    container = http("POST", f"{GRAPH}/{uid}/media", params)["id"]
    for _ in range(60):  # Instagram transcodes first; poll up to ~10 min
        st = http("GET", f"{GRAPH}/{container}?fields=status_code,status&access_token={urllib.parse.quote(tok)}")
        if st.get("status_code") == "FINISHED":
            break
        if st.get("status_code") in ("ERROR", "EXPIRED"):
            raise RuntimeError(f"Instagram could not process the video: {st}")
        time.sleep(10)
    else:
        raise RuntimeError("Instagram is still processing after 10 minutes")
    return http("POST", f"{GRAPH}/{uid}/media_publish", {"creation_id": container, "access_token": tok})["id"]


def ig_insights(limit: int = 10) -> list[dict]:
    uid, tok = env("IG_USER_ID"), env("IG_TOKEN")
    q = urllib.parse.quote(tok)
    media = http("GET", f"{GRAPH}/{uid}/media?fields=id,caption,media_product_type,timestamp,permalink,like_count,comments_count&limit={limit}&access_token={q}")
    out = []
    for m in media.get("data", []):
        row = {k: m.get(k) for k in ("timestamp", "permalink", "like_count", "comments_count")}
        row["hook"] = (m.get("caption") or "").split("\n")[0][:70]
        try:
            ins = http("GET", f"{GRAPH}/{m['id']}/insights?metric=views,reach,saved,shares,total_interactions&access_token={q}")
            row.update({i["name"]: i["values"][0]["value"] for i in ins.get("data", [])})
        except RuntimeError as e:
            row["insights_error"] = str(e)[:120]
        out.append(row)
    return out


# ── TikTok (Content Posting API) ───────────────────────────────────────────────

def tiktok_publish(video_url: str, caption: str) -> str:
    tok = env("TIKTOK_TOKEN")
    auth = {"Authorization": f"Bearer {tok}"}
    info = http("POST", f"{TIKTOK}/post/publish/creator_info/query/", {}, auth, as_json=True)["data"]
    options = info.get("privacy_level_options") or ["SELF_ONLY"]
    privacy = "PUBLIC_TO_EVERYONE" if "PUBLIC_TO_EVERYONE" in options else options[0]
    r = http("POST", f"{TIKTOK}/post/publish/video/init/", {
        "post_info": {"title": caption[:2200], "privacy_level": privacy, "disable_comment": False, "disable_duet": False, "disable_stitch": False},
        "source_info": {"source": "PULL_FROM_URL", "video_url": video_url},
    }, auth, as_json=True)
    return r["data"]["publish_id"]


# ── queue ──────────────────────────────────────────────────────────────────────

def load() -> list[dict]:
    return json.loads(QUEUE.read_text()) if QUEUE.exists() else []


def save(q: list[dict]) -> None:
    q.sort(key=lambda x: x["at"])
    QUEUE.write_text(json.dumps(q, indent=2))


def plan(days: int, slots: list[str]) -> None:
    q = load()
    taken = {x["at"] for x in q}
    today = dt.date.today()
    now = dt.datetime.now()
    for d in range(days):
        for s in slots:
            h, m = map(int, s.split(":"))
            at = dt.datetime.combine(today + dt.timedelta(days=d), dt.time(h, m))
            if at > now and at.isoformat(timespec="minutes") not in taken:
                q.append({"at": at.isoformat(timespec="minutes"), "video": None, "caption": None, "platforms": ["instagram"], "status": "empty"})
    save(q)
    print(f"{QUEUE}: {sum(1 for x in q if x['status'] == 'empty')} empty slots. Fill them with `add --at <slot>`.")


def add(at: str, video: str, caption: str, tiktok: bool) -> None:
    q = [x for x in load() if not (x["at"] == at and x["status"] == "empty")]
    q.append({"at": at, "video": video, "caption": caption, "platforms": ["instagram"] + (["tiktok"] if tiktok else []), "status": "queued"})
    save(q)
    print(f"Queued for {at}.")


def post_due() -> int:
    q = load()
    now = dt.datetime.now().isoformat(timespec="minutes")
    n = 0
    for item in q:
        if item["status"] != "queued" or item["at"] > now:
            continue
        results = {}
        for p in item["platforms"]:
            try:
                results[p] = ig_publish_reel(item["video"], item["caption"]) if p == "instagram" else tiktok_publish(item["video"], item["caption"])
            except Exception as e:  # keep going for the other platform
                results[p] = f"ERROR {e}"
        item["status"] = "error" if any(str(v).startswith("ERROR") for v in results.values()) else "posted"
        item["result"] = results
        item["posted_at"] = dt.datetime.now().isoformat(timespec="seconds")
        print(f"[{item['posted_at']}] {item['at']} -> {results}")
        n += 1
        save(q)
    return n


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("plan"); p.add_argument("--days", type=int, default=7); p.add_argument("--slots", default="07:30,12:15,19:45")
    a = sub.add_parser("add"); a.add_argument("--at", required=True); a.add_argument("--video", required=True); a.add_argument("--caption", required=True); a.add_argument("--tiktok", action="store_true")
    sub.add_parser("run"); sub.add_parser("once")
    i = sub.add_parser("insights"); i.add_argument("--limit", type=int, default=10)
    args = ap.parse_args()
    if args.cmd == "plan":
        plan(args.days, args.slots.split(","))
    elif args.cmd == "add":
        add(args.at, args.video, args.caption, args.tiktok)
    elif args.cmd == "once":
        post_due()
    elif args.cmd == "run":
        print("Posting due items every minute. Ctrl-C to stop.")
        while True:
            post_due()
            time.sleep(60)
    elif args.cmd == "insights":
        print(json.dumps(ig_insights(args.limit), indent=2))


if __name__ == "__main__":
    main()
