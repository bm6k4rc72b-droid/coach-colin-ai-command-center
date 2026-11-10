"""Admin command line.

    python -m scripts.cli <command> [options]

    init-db                         create the tables
    gen-schema                      print the Postgres schema (schema.sql)
    list                            list restaurants
    set <id> [--name ...]           create/update a restaurant's brand settings
    show <id>                       print a restaurant's settings
    poll [<id>]                     run a review cycle now (all restaurants if no id)
    summary <id> [--no-send]        generate today's summary now
    qr <id> <table_tent|receipt|plain> [-o file.png]
    invite <id> <phone> [--name N] [--consent] [--delay MIN]
    export-agent <id>               print the ElevenLabs agent config (prompt + tools)
    provision-agent <id>            create/update the agent in ElevenLabs
    worker                          run only the background scheduler
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from app.config import setup_logging
from app.db import active_restaurants, get_restaurant, init_db, metadata
from app.tenants import RestaurantSettings, public_view, upsert_restaurant

# Settings that can be passed as --flags to `set`. Long text fields also accept
# @path to read the value from a file, e.g. --brand-voice @voice.txt
TEXT_FIELDS = [
    "name", "phone", "address", "hours", "parking", "menu_highlights", "brand_voice",
    "extra_info", "sign_off", "brand_color", "manager_name", "manager_phone", "manager_email",
    "slack_webhook_url", "google_account_id", "google_location_id", "google_place_id",
    "timezone", "summary_time",
]


def _restaurant(restaurant_id: str) -> dict:
    restaurant = get_restaurant(restaurant_id)
    if restaurant is None:
        sys.exit(f"No restaurant with id {restaurant_id!r}. Create it with: "
                 f"python -m scripts.cli set {restaurant_id} --name \"...\"")
    return restaurant


def _value(raw: str) -> str:
    return Path(raw[1:]).read_text().strip() if raw.startswith("@") else raw


def cmd_gen_schema(_: argparse.Namespace) -> None:
    from sqlalchemy.dialects import postgresql
    from sqlalchemy.schema import CreateIndex, CreateTable

    dialect = postgresql.dialect()
    print("-- Restaurant Reputation AI: Postgres / Supabase schema.")
    print("-- Generated from app/db.py by `python -m scripts.cli gen-schema`; do not edit by hand.")
    print("-- Run it in the Supabase SQL editor, or let `python -m scripts.cli init-db` create")
    print("-- the same tables for you.\n")
    for table in metadata.sorted_tables:
        print(str(CreateTable(table, if_not_exists=True).compile(dialect=dialect)).strip() + ";\n")
        for index in sorted(table.indexes, key=lambda i: i.name):
            print(str(CreateIndex(index, if_not_exists=True).compile(dialect=dialect)).strip() + ";\n")
        # Supabase exposes every table in `public` through its auto-generated REST
        # API. Row Level Security with no policies closes that door; this app
        # connects with the database password, which is not subject to RLS.
        print(f"ALTER TABLE {table.name} ENABLE ROW LEVEL SECURITY;\n")


def cmd_set(args: argparse.Namespace) -> None:
    changes: dict = {}
    if args.from_json:
        changes.update(json.loads(Path(args.from_json).read_text()))
    for field in TEXT_FIELDS:
        raw = getattr(args, field)
        if raw is not None:
            changes[field] = _value(raw)
    if args.auto_post_min_rating is not None:
        changes["auto_post_min_rating"] = args.auto_post_min_rating
    if args.active is not None:
        changes["active"] = args.active == "true"
    try:
        restaurant = upsert_restaurant(args.id, RestaurantSettings(**changes))
    except ValueError as exc:
        sys.exit(f"Not saved: {exc}")
    print(f"Saved {restaurant['id']} ({restaurant['name']}).")
    if restaurant.get("elevenlabs_agent_id"):
        print("This restaurant has a voice agent. Push the new settings to it with:\n"
              f"  python -m scripts.cli provision-agent {restaurant['id']}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Restaurant Reputation AI admin CLI")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("init-db")
    sub.add_parser("gen-schema")
    sub.add_parser("list")
    sub.add_parser("worker")

    p = sub.add_parser("set")
    p.add_argument("id")
    p.add_argument("--from-json", help="JSON file of settings (flags override it)")
    for field in TEXT_FIELDS:
        p.add_argument("--" + field.replace("_", "-"), dest=field)
    p.add_argument("--auto-post-min-rating", type=int, choices=[4, 5, 6],
                   help="lowest star rating replied to without approval (6 = approve everything)")
    p.add_argument("--active", choices=["true", "false"])

    for name in ("show", "export-agent", "provision-agent"):
        sub.add_parser(name).add_argument("id")
    sub.add_parser("poll").add_argument("id", nargs="?")
    p = sub.add_parser("summary")
    p.add_argument("id")
    p.add_argument("--no-send", action="store_true")
    p = sub.add_parser("qr")
    p.add_argument("id")
    p.add_argument("source", choices=["table_tent", "receipt", "plain"])
    p.add_argument("-o", "--output")
    p = sub.add_parser("invite")
    p.add_argument("id")
    p.add_argument("phone")
    p.add_argument("--name")
    p.add_argument("--consent", action="store_true",
                   help="the guest explicitly opted in to texts just now")
    p.add_argument("--delay", type=int, default=0, help="minutes to wait before sending")

    args = parser.parse_args()
    if args.command == "gen-schema":      # needs no database
        return cmd_gen_schema(args)
    setup_logging()
    init_db()

    if args.command == "init-db":
        print("Tables are ready.")
    elif args.command == "list":
        for r in active_restaurants():
            print(f"{r['id']:<28} {r['name']}")
    elif args.command == "set":
        cmd_set(args)
    elif args.command == "show":
        print(json.dumps(public_view(_restaurant(args.id)), indent=2, default=str))
    elif args.command == "poll":
        from app.modules import review_response

        targets = [_restaurant(args.id)] if args.id else active_restaurants()
        for restaurant in targets:
            print(restaurant["id"], review_response.run_cycle_for(restaurant))
    elif args.command == "summary":
        from app.modules import daily_summary

        row = daily_summary.generate(_restaurant(args.id), send=not args.no_send, force=True)
        print(row["content_markdown"])
    elif args.command == "qr":
        from app.modules import review_growth

        output = Path(args.output or f"{args.id}-{args.source}.png")
        try:
            output.write_bytes(review_growth.render_qr_asset(_restaurant(args.id), args.source))
        except review_growth.GrowthError as exc:
            sys.exit(str(exc))
        print(f"Wrote {output}")
    elif args.command == "invite":
        from app.modules import review_growth

        try:
            print(review_growth.queue_sms_invite(
                _restaurant(args.id), args.phone, guest_name=args.name,
                delay_minutes=args.delay, consent_given=args.consent, consent_source="cli"))
        except review_growth.GrowthError as exc:
            sys.exit(str(exc))
    elif args.command == "export-agent":
        from app.voice.agent_config import build_agent_config

        print(json.dumps(build_agent_config(_restaurant(args.id), redact_secret=True), indent=2))
    elif args.command == "provision-agent":
        from app.retry import PermanentError
        from app.voice.agent_config import provision_agent

        try:
            print("Agent id:", provision_agent(_restaurant(args.id)))
        except PermanentError as exc:
            sys.exit(f"Provisioning failed: {exc}")
    elif args.command == "worker":
        from app.scheduler import build_scheduler

        build_scheduler().start()
        print("Scheduler running. Ctrl+C to stop.")
        try:
            while True:
                time.sleep(3600)
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
