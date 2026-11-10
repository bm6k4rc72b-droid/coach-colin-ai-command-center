# Restaurant Reputation AI

Answers your reviews, asks happy guests for more of them, picks up the phone,
and tells the manager what matters every morning.

| Module | What it does |
|---|---|
| **1. Review Response** | Polls Google Business Profile every 10 minutes. Claude drafts a reply in the restaurant's voice. 4-5 star replies post automatically; 1-3 star and anything sensitive waits for a human in the approval queue. |
| **2. Review Growth** | Branded QR codes (table tent, receipt strip) and opt-in-only post-visit texts, all through tracked links so you can see what converts. |
| **3. Guest Recovery** | An ElevenLabs voice agent answers every call, takes reservations, and texts the manager mid-call when a guest is unhappy. Claude re-reads every transcript afterwards as a safety net. |
| **4. Daily Summary** | One page every morning: rating and weekly change, new reviews, replies waiting, top themes, recommended actions. |

Multi-tenant: one deployment serves any number of restaurants, each with its
own brand voice, contacts, and schedule.

## Try it in two minutes (no accounts needed)

```bash
cd reputation-ai
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

python -m scripts.demo          # runs all four modules on mock reviews and mock calls
python -m pytest                # 45 tests
```

Or click around the dashboard in test mode:

```bash
TEST_MODE=true ADMIN_TOKEN=demo uvicorn app.main:app --port 8000
# open http://localhost:8000/admin   (any username, password: demo)
```

Test mode uses mock reviews, a rule-based stand-in for Claude, and records
every SMS, email and Slack message in the `outbox` table instead of sending
it. To see real Claude replies on the mock reviews, add
`MOCK_LLM=false ANTHROPIC_API_KEY=...`.

## Architecture

```
                         ┌────────────────────────────────────────────┐
 Google Business Profile │  FastAPI app (app/main.py)                 │
   reviews  ◄──poll/reply┤                                            │
                         │  Scheduler (APScheduler, in-process)       │
 Guests' phones          │    every 10 min  review cycle              │──► Claude
   SMS  ◄────────Twilio──┤    every 1 min   send due invites          │    (drafts, call analysis,
   scan/tap ──► /r/{tok} │    every 5 min   daily summary if due      │     summary themes)
                         │                                            │
 Callers ──► ElevenLabs  │  Webhooks                                  │──► Manager
   agent ──tool calls───►│    /webhooks/voice/{id}/{tool}             │    SMS / Slack / email
         ──post-call────►│    /webhooks/elevenlabs/post-call          │
                         │    /webhooks/twilio/sms  (STOP/START)      │
 Manager ──► /admin      │  Admin API + dashboard (token-protected)   │
                         └───────────────────┬────────────────────────┘
                                             │
                                  Postgres (Supabase) / SQLite
```

### Project structure

```
reputation-ai/
├── app/
│   ├── main.py               FastAPI entry point
│   ├── config.py             all environment variables
│   ├── db.py                 database schema (single source of truth) + helpers
│   ├── prompts.py            every Claude prompt and output schema
│   ├── llm.py                Claude client wrapper (+ offline mock)
│   ├── notify.py             SMS / email / Slack, recorded in `outbox`
│   ├── retry.py              backoff helper
│   ├── scheduler.py          background jobs
│   ├── tenants.py            create/update restaurants (brand settings)
│   ├── demo_data.py          the demo restaurant
│   ├── modules/
│   │   ├── review_response.py   Module 1
│   │   ├── review_growth.py     Module 2
│   │   ├── guest_recovery.py    Module 3 (our side of the phone calls)
│   │   └── daily_summary.py     Module 4
│   ├── platforms/            review sources: google.py, mock.py, stubs.py (Yelp, TripAdvisor)
│   ├── voice/agent_config.py ElevenLabs agent: system prompt, tools, provisioning
│   ├── routes/               admin.py (API + dashboard), public.py (links + webhooks)
│   ├── static/dashboard.html
│   └── fixtures/             mock reviews and mock calls
├── scripts/cli.py            admin CLI
├── scripts/demo.py           end-to-end demo
├── tests/
├── schema.sql                Postgres schema (generated from app/db.py)
├── .env.example
└── requirements.txt
```

### Where to find the prompts

| Prompt | Location |
|---|---|
| Review reply (system prompt + output schema) | `app/prompts.py` → `REVIEW_RESPONSE_SYSTEM_PROMPT`, `ReviewDraft` |
| Daily summary | `app/prompts.py` → `DAILY_SUMMARY_SYSTEM_PROMPT`, `SummaryAnalysis` |
| Post-call analysis | `app/prompts.py` → `CALL_ANALYSIS_SYSTEM_PROMPT`, `CallAnalysis` |
| Voice agent system prompt + tool definitions | `app/voice/agent_config.py` → `VOICE_AGENT_SYSTEM_PROMPT`, `build_tools()` |

`python -m scripts.cli export-agent <restaurant-id>` prints the voice agent's
finished prompt and tools for a specific restaurant.

### Safeguards worth knowing about

- **A reply is auto-posted only if** the review is 4-5 stars, Claude did not
  flag it, *and* a separate keyword check found nothing sensitive (illness,
  allergy, injury, legal threats, harassment). A 5-star review that mentions
  an allergic reaction goes to a human.
- **1-3 star reviews can never be set to auto-post.** `auto_post_min_rating`
  only accepts 4, 5, or 6 (6 = approve everything by hand).
- **Old reviews are left alone.** Connecting a location does not send replies
  to reviews older than `MAX_REVIEW_AGE_DAYS`.
- **Texts need a recorded opt-in**, go out at most once per guest per 30
  days, only during daytime hours, and STOP is honored.
- **Unhappy callers are caught twice:** by the live agent (instant text to the
  manager) and by Claude reading the transcript after the call.
- **The numbers in the daily summary are computed in code**, not by the model.
- Review and call text is treated as untrusted data in every prompt.
- Every action is written to `action_log`; every outbound message to `outbox`.

---

## Production setup

You need: a server with a public HTTPS URL (Render, Railway, Fly.io, a VPS...),
and accounts with Anthropic, Supabase, Google, Twilio and ElevenLabs.

### 1. Supabase (database)

1. Create a project at supabase.com.
2. SQL Editor → paste the contents of `schema.sql` → Run. (It also enables
   Row Level Security on every table so they are not exposed through
   Supabase's public REST API.)
3. Project Settings → Database → copy the **Session pooler** connection
   string into `DATABASE_URL`.

Plain Postgres works the same way: `psql "$DATABASE_URL" -f schema.sql`.

### 2. Environment

```bash
cp .env.example .env
```

Fill in `DATABASE_URL`, `PUBLIC_BASE_URL`, `ANTHROPIC_API_KEY`, and generate
two secrets (`openssl rand -hex 24`) for `ADMIN_TOKEN` and `VOICE_TOOL_SECRET`.
The remaining sections are filled in during the steps below.

### 3. Add your restaurant

Put the long text in files (easier to edit), then:

```bash
python -m scripts.cli set olive-and-ember \
  --name "Olive & Ember" \
  --phone "(512) 555-0100" \
  --address "412 Congress Ave, Austin, TX" \
  --hours "Tue-Thu 5-10pm; Fri-Sat 5-11pm; Sun 10am-3pm; closed Mon" \
  --parking "Free lot behind the building after 5pm" \
  --menu-highlights @menu.txt \
  --brand-voice @voice.txt \
  --sign-off "— Maria, General Manager" \
  --manager-phone "+15125550111" \
  --manager-email "maria@example.com" \
  --slack-webhook-url "https://hooks.slack.com/services/..." \
  --timezone America/Chicago \
  --summary-time 07:30
```

Run the same command with only the flags you want to change to update it
later, edit it in the dashboard (Brand settings tab), or use the API:

```bash
curl -X PUT "$PUBLIC_BASE_URL/api/restaurants/olive-and-ember" \
  -H "X-Admin-Token: $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"brand_voice": "Dry, witty, brief.", "phone": "(512) 555-0199"}'
```

The brand voice is the most important field. Two or three sentences on how
you talk to guests, plus anything you never say, is enough.

### 4. Google Business Profile (Module 1)

1. **Request API access.** The Business Profile APIs are not open by default:
   submit Google's "Business Profile API access" request form for your Google
   Cloud project. Approval can take several days, so start here.
2. In Google Cloud Console, enable **My Business Account Management API**,
   **My Business Business Information API** and **Google My Business API**.
3. APIs & Services → Credentials → Create OAuth client ID (type: Web
   application). Add `https://developers.google.com/oauthplayground` as an
   authorized redirect URI. Copy the client ID and secret into `.env`.
4. Get a refresh token: open the
   [OAuth Playground](https://developers.google.com/oauthplayground), click the
   gear icon → "Use your own OAuth credentials" → enter the client ID/secret.
   Authorize the scope `https://www.googleapis.com/auth/business.manage`
   while signed in as a Google account that **manages the restaurant's
   profile**, then "Exchange authorization code for tokens". Copy the refresh
   token into `GOOGLE_REFRESH_TOKEN`. (Set the OAuth consent screen to
   "In production", otherwise the token expires after 7 days.)
5. Find your ids:
   ```bash
   TOKEN=...   # the access token shown in the Playground
   curl -H "Authorization: Bearer $TOKEN" https://mybusinessaccountmanagement.googleapis.com/v1/accounts
   curl -H "Authorization: Bearer $TOKEN" "https://mybusinessbusinessinformation.googleapis.com/v1/accounts/ACCOUNT_ID/locations?readMask=name,title,metadata"
   ```
   `metadata.placeId` in the second response is the place ID.
6. Save them:
   ```bash
   python -m scripts.cli set olive-and-ember \
     --google-account-id 1234567890 --google-location-id 9876543210 \
     --google-place-id ChIJ...
   ```
7. Check it: `python -m scripts.cli poll olive-and-ember`

One Google login can manage many locations, so one set of credentials serves
every restaurant that account manages.

### 5. Twilio (Module 2 texts, and manager alerts)

1. Buy a phone number. For US numbers, register for A2P 10DLC (or use a
   verified toll-free number); carriers block unregistered senders.
2. Copy the Account SID and Auth Token into `.env`, and set either
   `TWILIO_FROM_NUMBER` or `TWILIO_MESSAGING_SERVICE_SID`.
3. On the number (or Messaging Service), set the incoming-message webhook to
   `POST {PUBLIC_BASE_URL}/webhooks/twilio/sms` so STOP replies are recorded.

Send invites from your POS or reservation system when a guest checks out:

```bash
curl -X POST "$PUBLIC_BASE_URL/api/restaurants/olive-and-ember/invites" \
  -H "X-Admin-Token: $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"phone": "512-555-0123", "guest_name": "Jamie", "delay_minutes": 60,
       "consent_given": true, "consent_source": "pos_checkbox"}'
```

Send `consent_given: true` only when the guest actually ticked a box or said
yes. Without a recorded opt-in the API answers `{"status": "skipped"}`.

QR codes: download from the dashboard (Review growth tab) or

```bash
python -m scripts.cli qr olive-and-ember table_tent   # 4x6 in, 300 dpi
python -m scripts.cli qr olive-and-ember receipt      # 80 mm thermal strip
python -m scripts.cli qr olive-and-ember plain        # QR only
```

**What "converts" means.** Google does not tell anyone which reviewer came
from which link. Clicks and scans are exact. Reviews are attributed by a
name match (an invited guest who clicked, then a review from the same first
name within 7 days), so treat attributed reviews as a minimum.

### 6. ElevenLabs (Module 3)

1. Copy your API key into `ELEVENLABS_API_KEY`; optionally choose a voice
   (`ELEVENLABS_VOICE_ID`).
2. Create the agent from your restaurant's settings:
   ```bash
   python -m scripts.cli provision-agent olive-and-ember
   ```
   Re-run it whenever hours, menu or brand voice change. If you prefer to
   build the agent by hand in the ElevenLabs dashboard, run
   `python -m scripts.cli export-agent olive-and-ember` and copy the system
   prompt and the three webhook tools across.
3. In ElevenLabs → Agents → Settings, add a **post-call webhook**
   (transcription) pointing at `{PUBLIC_BASE_URL}/webhooks/elevenlabs/post-call`
   and copy its signing secret into `ELEVENLABS_WEBHOOK_SECRET`.
4. Connect the phone: ElevenLabs → Phone Numbers → import your Twilio number
   and assign the agent to it. Then forward the restaurant's main line to
   that number (or port it).
5. Call it. Ask for the hours, book a table, then complain about something:
   the manager's phone should buzz before you hang up.

### 7. Email and Slack

- **Email:** fill in the `SMTP_*` settings with any provider.
- **Slack:** create an Incoming Webhook for the channel you want and save it
  per restaurant (`--slack-webhook-url`).

Approval requests and the daily summary go to Slack and email. Text messages
are reserved for things that cannot wait: unhappy callers, and reviews
mentioning safety, health, legal or harassment issues.

### 8. Run it

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

- Dashboard: `{PUBLIC_BASE_URL}/admin` (any username; password = `ADMIN_TOKEN`)
- API docs: `{PUBLIC_BASE_URL}/docs`
- Health check: `{PUBLIC_BASE_URL}/health`

Background jobs run inside the web process. **Run them in exactly one
process:** with several web workers, set `RUN_SCHEDULER=false` on the web
service and run `python -m scripts.cli worker` as a separate one.

## Day to day

- **Approving replies:** the manager gets a Slack/email message with the
  review and the draft, and a link to the dashboard to approve, edit, ask for
  a redraft ("shorter, mention the patio"), or decide not to reply.
- **Morning brief:** arrives at `summary_time` in the restaurant's timezone.
  Send one on demand with `python -m scripts.cli summary olive-and-ember`.
- **Audit trail:** dashboard → Activity log, or the `action_log` and `outbox`
  tables.

## Adding Yelp or TripAdvisor

`app/platforms/base.py` defines the interface (`fetch_reviews`, `post_reply`).
`app/platforms/stubs.py` has placeholders for both. Neither platform offers a
self-serve API for posting owner replies, so they are set up as "draft here,
post by hand": every reply goes to the approval queue and the manager pastes
it into the platform. Implement `fetch_reviews`, register the class in
`app/platforms/__init__.py`, and the rest of the pipeline works unchanged.

## Known limits

- The ElevenLabs agent payload in `app/voice/agent_config.py` follows their
  agent-creation API as documented when this was written. If
  `provision-agent` returns a validation error, their schema has moved: use
  `export-agent` and paste the prompt and tools into their dashboard.
- Reservations are captured and sent to the manager to confirm; there is no
  live table-availability check. Hook `handle_reservation` in
  `app/modules/guest_recovery.py` up to your booking system to change that.
- If a guest edits a review after it was answered, the edit is not re-processed.
- You are responsible for SMS consent compliance (TCPA in the US). This
  system enforces opt-in, STOP, a cooldown and sending hours, but it cannot
  verify how consent was collected.
