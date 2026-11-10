"""ElevenLabs voice agent: system prompt, tool definitions, and provisioning.

`build_agent_config()` returns the complete agent definition as the JSON body
for ElevenLabs' "create agent" API. `provision_agent()` pushes it (create the
first time, update afterwards) and stores the agent id on the restaurant.

If you would rather configure the agent by hand in the ElevenLabs dashboard,
`python -m scripts.cli export-agent <restaurant>` prints the same prompt and
tool definitions to copy across.

The agent's three tools are webhooks back into this server
(see app/routes/voice.py); each call carries the X-Voice-Secret header.
"""
from __future__ import annotations

import logging
from typing import Any

import httpx
from sqlalchemy import update

from app.config import settings
from app.db import engine, log_action, restaurants
from app.prompts import restaurant_profile
from app.retry import PermanentError, with_retry

log = logging.getLogger(__name__)

ELEVENLABS_API = "https://api.elevenlabs.io/v1/convai"

# {{system__...}} placeholders are filled in by ElevenLabs at call time.
VOICE_AGENT_SYSTEM_PROMPT = """\
You are the phone host for {name}, a restaurant. You answer every call the way the restaurant's \
best front-of-house person would: warm, unhurried, and genuinely helpful. Callers are guests or \
future guests, and how this call feels shapes what they think of the restaurant.

# What you know

<restaurant>
{profile}
</restaurant>

<brand_voice>
{brand_voice}
</brand_voice>

The restaurant's local timezone is {timezone}. The current time in UTC is {{{{system__time_utc}}}}; \
convert it to local time when you need today's date or need to know whether the restaurant is open.

Everything you know about the restaurant is in the block above. If a caller asks something it \
does not cover (a specific ingredient, whether a dish is available tonight, pricing you were not \
given), say you are not sure rather than guessing, and offer to take a message so the team can \
call back. A wrong answer about allergens or hours does real harm; "let me have someone confirm \
that for you" never does.

# How to speak

You are on a phone call, so everything you say is heard, not read.
- Keep each turn to one or two short sentences, then let the caller respond.
- Ask one question at a time.
- Use everyday spoken language. No lists, no symbols, nothing that only makes sense written down.
- Say times and dates the way people do: "seven thirty this Friday", not "19:30 on 11/14".
- When you collect a name or phone number, repeat it back to confirm you heard it correctly.
- If you did not catch something, ask the caller to repeat it instead of guessing.
- If asked whether they are speaking to a real person, say honestly that you are the \
restaurant's AI assistant, and that you can take a message for the team.

# What you can do

Answer questions about hours, location, parking, the menu, and anything else in the restaurant \
information above.

Take reservations. Collect the caller's name, the party size, the date, the time, and a phone \
number, plus anything the team should know (a birthday, a high chair, an allergy). Read the \
details back, and once the caller confirms, use the create_reservation tool. Then tell them \
exactly what the tool returned: the booking is a request that the team will confirm, not a \
guaranteed table. For parties larger than {max_party}, or private events, take a message instead.

Take messages. When you cannot help with something, or the caller wants a person, use the \
take_message tool with their name, number, and what they need, and tell them someone will get \
back to them.

# When a caller is unhappy

This is the most important part of your job. A guest who calls with a complaint is giving the \
restaurant a chance to make it right before it becomes a bad review, and the manager wants to \
hear about every one of them the same day.

Treat a caller as unhappy if they complain about a visit (food, service, a long wait, a wrong \
order, cleanliness, the bill), sound frustrated, upset or angry, say they felt unwell after \
eating, ask for a manager or a refund, or mention leaving a bad review or not coming back.

When that happens:
1. Listen first. Let them finish, then acknowledge specifically what went wrong and apologize \
sincerely. Do not explain, defend the restaurant, or question their account.
2. As soon as you understand the problem, use the flag_unhappy_guest tool. Do this during the \
call, as soon as you can describe the issue in a sentence, without waiting for the call to \
end, because callers sometimes hang up early. Do not announce that you are using a tool.
3. Tell them a manager will personally follow up today, and ask for their name and the best \
number to reach them. If you learn these after you have already flagged the call, use the tool \
again with the new details.
4. Thank them for telling you.

Stay within what you can deliver. You cannot offer refunds, discounts, free meals, or say what \
will happen to a staff member; those are the manager's decisions, so say the manager will \
discuss how to make it right. If a caller describes a medical problem, such as an allergic \
reaction or feeling ill after a meal, express concern, encourage them to seek medical care if \
it could be serious, do not speculate about the cause, and flag the call with high severity.

If a caller is abusive, stay calm and polite, offer to have a manager call them back, flag the \
call, and end it courteously.

# Ending the call

When the caller has what they need, ask if there is anything else, thank them for calling \
{name}, and end the call.
"""

FIRST_MESSAGE = "Thank you for calling {name}. How can I help you today?"
MAX_PARTY_SIZE = 12


def _tool(name: str, description: str, url: str, properties: dict[str, Any],
          required: list[str], secret: str) -> dict[str, Any]:
    """A webhook ("server") tool. `conversation_id` and `caller_phone` are
    filled in by ElevenLabs from system variables, not by the model."""
    return {
        "type": "webhook",
        "name": name,
        "description": description,
        "response_timeout_secs": 20,
        "api_schema": {
            "url": url,
            "method": "POST",
            "request_headers": {"X-Voice-Secret": secret},
            "request_body_schema": {
                "type": "object",
                "properties": {
                    **properties,
                    "conversation_id": {"type": "string",
                                        "dynamic_variable": "system__conversation_id"},
                    "caller_phone": {"type": "string", "dynamic_variable": "system__caller_id"},
                },
                "required": required,
            },
        },
    }


def build_tools(restaurant: dict[str, Any], *, redact_secret: bool = False) -> list[dict[str, Any]]:
    base = f"{settings.public_base_url}/webhooks/voice/{restaurant['id']}"
    secret = "<VOICE_TOOL_SECRET>" if redact_secret else settings.voice_tool_secret
    return [
        _tool(
            "create_reservation",
            "Record a reservation request after the caller has confirmed every detail. "
            "Returns a sentence to relay to the caller. If it reports a problem (for example a "
            "date in the past), fix the detail with the caller and call it again.",
            f"{base}/create-reservation",
            {
                "guest_name": {"type": "string", "description": "Name the reservation is under."},
                "phone": {"type": "string",
                          "description": "Callback number the guest gave, digits only."},
                "party_size": {"type": "integer", "description": "Number of guests."},
                "date": {"type": "string",
                         "description": "Reservation date in the restaurant's local timezone, "
                                        "formatted YYYY-MM-DD."},
                "time": {"type": "string",
                         "description": "Reservation time, 24-hour HH:MM, local time."},
                "notes": {"type": "string",
                          "description": "Occasion, seating or accessibility needs, allergies. "
                                         "Empty string if none."},
            },
            ["guest_name", "party_size", "date", "time"], secret,
        ),
        _tool(
            "flag_unhappy_guest",
            "Alert the manager immediately that this caller is unhappy. Use it as soon as you "
            "understand the problem, while the call is still in progress. Call it again if you "
            "learn the guest's name or callback number afterwards.",
            f"{base}/flag-unhappy-guest",
            {
                "issue_summary": {"type": "string",
                                  "description": "One or two sentences: what went wrong, in the "
                                                 "guest's terms, including the visit date if "
                                                 "mentioned."},
                "severity": {"type": "string", "enum": ["low", "medium", "high"],
                             "description": "high = illness, injury, allergic reaction, "
                                            "harassment, or a furious guest; medium = a clear "
                                            "complaint; low = mild disappointment."},
                "guest_name": {"type": "string", "description": "Guest's name, if known."},
                "callback_number": {"type": "string",
                                    "description": "Best number to reach the guest, if given."},
                "wants_callback": {"type": "boolean",
                                   "description": "False only if the guest said not to call."},
            },
            ["issue_summary", "severity"], secret,
        ),
        _tool(
            "take_message",
            "Leave a message for the restaurant team when you cannot help directly: questions "
            "you cannot answer, large parties, private events, lost property, or a request to "
            "speak to a person. Not for complaints; use flag_unhappy_guest for those.",
            f"{base}/take-message",
            {
                "guest_name": {"type": "string", "description": "Caller's name."},
                "callback_number": {"type": "string", "description": "Number to call back."},
                "message": {"type": "string", "description": "What the caller needs."},
            },
            ["message"], secret,
        ),
        # Built-in ElevenLabs tool that lets the agent hang up politely.
        {"type": "system", "name": "end_call", "description": ""},
    ]


def build_system_prompt(restaurant: dict[str, Any]) -> str:
    return VOICE_AGENT_SYSTEM_PROMPT.format(
        name=restaurant["name"],
        profile=restaurant_profile(restaurant),
        brand_voice=(restaurant.get("brand_voice") or "Warm, genuine, and down-to-earth.").strip(),
        timezone=restaurant["timezone"],
        max_party=MAX_PARTY_SIZE,
    )


def build_agent_config(restaurant: dict[str, Any], *, redact_secret: bool = False) -> dict[str, Any]:
    """The full ElevenLabs agent definition (body of POST /v1/convai/agents/create)."""
    prompt: dict[str, Any] = {
        "prompt": build_system_prompt(restaurant),
        "tools": build_tools(restaurant, redact_secret=redact_secret),
    }
    if settings.elevenlabs_agent_llm:
        prompt["llm"] = settings.elevenlabs_agent_llm
    conversation_config: dict[str, Any] = {
        "agent": {
            "first_message": FIRST_MESSAGE.format(name=restaurant["name"]),
            "language": "en",
            "prompt": prompt,
        },
    }
    if settings.elevenlabs_voice_id:
        conversation_config["tts"] = {"voice_id": settings.elevenlabs_voice_id}
    return {
        "name": f"{restaurant['name']} - phone host",
        "conversation_config": conversation_config,
    }


def provision_agent(restaurant: dict[str, Any]) -> str:
    """Create the agent in ElevenLabs, or update it if it already exists.

    Run this again whenever the restaurant's details or brand voice change.
    Returns the agent id.
    """
    if not settings.elevenlabs_api_key:
        raise PermanentError("ELEVENLABS_API_KEY is not set")
    if not settings.voice_tool_secret:
        raise PermanentError("VOICE_TOOL_SECRET is not set; the agent's tools would be unprotected")

    config = build_agent_config(restaurant)
    agent_id = restaurant.get("elevenlabs_agent_id")
    headers = {"xi-api-key": settings.elevenlabs_api_key}

    def _call() -> dict[str, Any]:
        if agent_id:
            response = httpx.patch(f"{ELEVENLABS_API}/agents/{agent_id}", json=config,
                                   headers=headers, timeout=30)
        else:
            response = httpx.post(f"{ELEVENLABS_API}/agents/create", json=config,
                                  headers=headers, timeout=30)
        if response.status_code in (400, 401, 403, 404, 422):
            raise PermanentError(f"ElevenLabs {response.status_code}: {response.text[:500]}")
        response.raise_for_status()
        return response.json()

    result = with_retry(_call, label="elevenlabs provision")
    agent_id = result.get("agent_id") or agent_id
    with engine.begin() as conn:
        conn.execute(update(restaurants).where(restaurants.c.id == restaurant["id"]).values(
            elevenlabs_agent_id=agent_id))
    log_action("voice", "agent_provisioned", restaurant_id=restaurant["id"], entity_id=agent_id)
    return agent_id
