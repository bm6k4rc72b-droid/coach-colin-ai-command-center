"""The demo restaurant used by TEST_MODE, the demo script and the tests."""
from __future__ import annotations

from datetime import timedelta
from typing import Any

from sqlalchemy import insert, select

from app.db import engine, fetch_one, get_restaurant, new_id, rating_snapshots, utcnow
from app.tenants import RestaurantSettings, upsert_restaurant

DEMO_ID = "olive-and-ember"

DEMO_SETTINGS = RestaurantSettings(
    name="Olive & Ember",
    phone="(512) 555-0100",
    address="412 Congress Ave, Austin, TX 78701",
    hours="Tue-Thu 5pm-10pm; Fri-Sat 5pm-11pm; Sun 10am-3pm (brunch) and 5pm-9pm; closed Monday",
    parking="Free lot behind the building after 5pm; street parking on Congress; valet Fri-Sat.",
    menu_highlights=("Wood-fired margherita pizza, 12-hour braised short rib, handmade "
                     "pappardelle with wild mushroom ragu, burrata with grilled peaches, "
                     "house tiramisu. Natural wine list. Sunday brunch."),
    brand_voice=("Warm, a little playful, never corporate. We talk like a neighbor who loves to "
                 "cook for people. First names, plain words, no buzzwords, no exclamation-mark "
                 "pileups. We're proud of the wood-fired oven and the people who run it."),
    extra_info=("Reservations recommended on weekends. Vegetarian and gluten-free options on "
                "every course; the kitchen can accommodate most allergies with notice. Private "
                "dining room seats 20. Dog-friendly patio."),
    sign_off="— Maria, General Manager",
    brand_color="#1F3A2E",
    manager_name="Maria Santos",
    manager_phone="+15125550111",
    manager_email="maria@oliveandember.example",
    slack_webhook_url="https://hooks.slack.com/services/T000/B000/DEMO",
    google_place_id="ChIJDEMO-placeid-000",
    timezone="America/Chicago",
    summary_time="07:30",
)


def seed_demo_restaurant() -> dict[str, Any]:
    """Create the demo restaurant if it does not exist yet (idempotent)."""
    existing = get_restaurant(DEMO_ID)
    if existing:
        return existing
    restaurant = upsert_restaurant(DEMO_ID, DEMO_SETTINGS)
    # A rating from last week so the summary can show a week-over-week change.
    week_ago = (utcnow() - timedelta(days=7)).date()
    if not fetch_one(select(rating_snapshots.c.id).where(
            rating_snapshots.c.restaurant_id == DEMO_ID)):
        with engine.begin() as conn:
            conn.execute(insert(rating_snapshots).values(
                id=new_id(), restaurant_id=DEMO_ID, platform="mock", snapshot_date=week_ago,
                average_rating=4.3, total_reviews=305))
    return restaurant
