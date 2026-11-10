-- Restaurant Reputation AI: Postgres / Supabase schema.
-- Generated from app/db.py by `python -m scripts.cli gen-schema`; do not edit by hand.
-- Run it in the Supabase SQL editor, or let `python -m scripts.cli init-db` create
-- the same tables for you.

CREATE TABLE IF NOT EXISTS action_log (
	id VARCHAR(32) NOT NULL, 
	restaurant_id VARCHAR(64), 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	module VARCHAR(32) NOT NULL, 
	action VARCHAR(64) NOT NULL, 
	entity_id TEXT, 
	detail JSONB, 
	PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS ix_action_log_restaurant_time ON action_log (restaurant_id, created_at);

ALTER TABLE action_log ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS calls (
	id VARCHAR(32) NOT NULL, 
	restaurant_id VARCHAR(64) NOT NULL, 
	conversation_id TEXT NOT NULL, 
	caller_phone VARCHAR(32), 
	started_at TIMESTAMP WITH TIME ZONE, 
	duration_seconds INTEGER, 
	transcript JSONB, 
	summary TEXT, 
	sentiment VARCHAR(16), 
	unhappy BOOLEAN NOT NULL, 
	issues JSONB, 
	follow_up TEXT, 
	alert_sent_at TIMESTAMP WITH TIME ZONE, 
	transcript_sent_at TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (conversation_id)
);

ALTER TABLE calls ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS invites (
	id VARCHAR(32) NOT NULL, 
	restaurant_id VARCHAR(64) NOT NULL, 
	token VARCHAR(32) NOT NULL, 
	channel VARCHAR(16) NOT NULL, 
	source VARCHAR(32), 
	phone VARCHAR(32), 
	guest_name TEXT, 
	status VARCHAR(16) NOT NULL, 
	send_at TIMESTAMP WITH TIME ZONE, 
	sent_at TIMESTAMP WITH TIME ZONE, 
	provider_message_id TEXT, 
	last_error TEXT, 
	click_count INTEGER NOT NULL, 
	first_clicked_at TIMESTAMP WITH TIME ZONE, 
	converted_review_id VARCHAR(32), 
	converted_at TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS ix_invites_due ON invites (status, send_at);

ALTER TABLE invites ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS outbox (
	id VARCHAR(32) NOT NULL, 
	restaurant_id VARCHAR(64), 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	channel VARCHAR(16) NOT NULL, 
	recipient TEXT, 
	purpose VARCHAR(48) NOT NULL, 
	subject TEXT, 
	body TEXT NOT NULL, 
	status VARCHAR(16) NOT NULL, 
	error TEXT, 
	PRIMARY KEY (id)
);

ALTER TABLE outbox ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS rating_snapshots (
	id VARCHAR(32) NOT NULL, 
	restaurant_id VARCHAR(64) NOT NULL, 
	platform VARCHAR(32) NOT NULL, 
	snapshot_date DATE NOT NULL, 
	average_rating FLOAT, 
	total_reviews INTEGER, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_snapshot_day UNIQUE (restaurant_id, platform, snapshot_date)
);

ALTER TABLE rating_snapshots ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS reservations (
	id VARCHAR(32) NOT NULL, 
	restaurant_id VARCHAR(64) NOT NULL, 
	conversation_id TEXT, 
	guest_name TEXT NOT NULL, 
	phone VARCHAR(32), 
	party_size INTEGER NOT NULL, 
	reservation_date DATE NOT NULL, 
	reservation_time VARCHAR(5) NOT NULL, 
	notes TEXT, 
	status VARCHAR(16) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id)
);

ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS restaurants (
	id VARCHAR(64) NOT NULL, 
	name TEXT NOT NULL, 
	phone VARCHAR(32), 
	address TEXT, 
	hours TEXT, 
	parking TEXT, 
	menu_highlights TEXT, 
	brand_voice TEXT, 
	extra_info TEXT, 
	sign_off TEXT, 
	brand_color VARCHAR(16), 
	manager_name TEXT, 
	manager_phone VARCHAR(32), 
	manager_email TEXT, 
	slack_webhook_url TEXT, 
	google_account_id TEXT, 
	google_location_id TEXT, 
	google_place_id TEXT, 
	timezone VARCHAR(64) NOT NULL, 
	summary_time VARCHAR(5) NOT NULL, 
	auto_post_min_rating INTEGER NOT NULL, 
	elevenlabs_agent_id TEXT, 
	active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id)
);

ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS reviews (
	id VARCHAR(32) NOT NULL, 
	restaurant_id VARCHAR(64) NOT NULL, 
	platform VARCHAR(32) NOT NULL, 
	external_id TEXT NOT NULL, 
	reviewer_name TEXT, 
	rating INTEGER NOT NULL, 
	text TEXT, 
	review_created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	status VARCHAR(32) NOT NULL, 
	flagged BOOLEAN NOT NULL, 
	flag_reasons JSONB, 
	sentiment VARCHAR(16), 
	themes JSONB, 
	draft_reply TEXT, 
	final_reply TEXT, 
	internal_note TEXT, 
	approved_by TEXT, 
	draft_attempts INTEGER NOT NULL, 
	post_attempts INTEGER NOT NULL, 
	last_error TEXT, 
	fetched_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	posted_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_review_external UNIQUE (restaurant_id, platform, external_id)
);

CREATE INDEX IF NOT EXISTS ix_reviews_restaurant_status ON reviews (restaurant_id, status);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sms_consent (
	id VARCHAR(32) NOT NULL, 
	restaurant_id VARCHAR(64) NOT NULL, 
	phone VARCHAR(32) NOT NULL, 
	opted_in BOOLEAN NOT NULL, 
	source TEXT, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_consent_phone UNIQUE (restaurant_id, phone)
);

ALTER TABLE sms_consent ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS summaries (
	id VARCHAR(32) NOT NULL, 
	restaurant_id VARCHAR(64) NOT NULL, 
	summary_date DATE NOT NULL, 
	data JSONB NOT NULL, 
	content_markdown TEXT NOT NULL, 
	content_html TEXT NOT NULL, 
	sent_at TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_summary_day UNIQUE (restaurant_id, summary_date)
);

ALTER TABLE summaries ENABLE ROW LEVEL SECURITY;

