-- HeadshotDesk initial schema (v0.1 — Photographer Core)
-- Database: PostgreSQL 15+
-- IDs are ULIDs (sortable, URL-safe), stored as TEXT for portability.
-- Timestamps are TIMESTAMPTZ in UTC.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ==========================================================================
-- Accounts & auth
-- ==========================================================================

CREATE TABLE accounts (
    id              TEXT PRIMARY KEY,
    -- Account type: 'photographer' (v0.1) or 'corporate' (v0.3)
    type            TEXT NOT NULL CHECK (type IN ('photographer', 'corporate')),
    name            TEXT NOT NULL,
    -- Stripe customer ID (nullable until first checkout)
    stripe_customer_id TEXT UNIQUE,
    -- Subscription state
    plan            TEXT NOT NULL DEFAULT 'trial' CHECK (
        plan IN ('trial', 'solo', 'pro', 'studio', 'hibernate', 'cancelled')
    ),
    plan_renews_at  TIMESTAMPTZ,
    hibernate_since TIMESTAMPTZ,
    -- Branding overrides (JSONB so we can extend later)
    branding        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
    id              TEXT PRIMARY KEY,
    account_id      TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    email           CITEXT NOT NULL UNIQUE,
    -- Argon2id hash; null if magic-link-only user
    password_hash   TEXT,
    name            TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'owner' CHECK (
        role IN ('owner', 'admin', 'member')
    ),
    -- Email verification + soft delete
    email_verified_at TIMESTAMPTZ,
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_users_account_id ON users(account_id);

CREATE TABLE auth_sessions (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash TEXT NOT NULL UNIQUE,
    user_agent      TEXT,
    ip_address      INET,
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_auth_sessions_user_id ON auth_sessions(user_id);

-- ==========================================================================
-- Jobs (a "shoot" — one event/team being photographed)
-- ==========================================================================

CREATE TABLE jobs (
    id              TEXT PRIMARY KEY,
    account_id      TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    -- Slug used in public signup URL: headshotdesk.com/s/{slug}
    public_slug     TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    -- Optional client metadata (company being shot, contact, etc.)
    client_name     TEXT,
    client_email    CITEXT,
    -- Shoot date(s)
    shoot_date      DATE,
    location        TEXT,
    status          TEXT NOT NULL DEFAULT 'draft' CHECK (
        status IN ('draft', 'open_for_signup', 'in_progress', 'delivered', 'archived')
    ),
    -- Per-job settings (JSONB for forward compat)
    settings        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by      TEXT NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at     TIMESTAMPTZ
);
CREATE INDEX idx_jobs_account_id ON jobs(account_id);
CREATE INDEX idx_jobs_status ON jobs(status);

-- ==========================================================================
-- Participants (the people being photographed)
-- ==========================================================================

CREATE TABLE participants (
    id              TEXT PRIMARY KEY,
    job_id          TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    email           CITEXT,
    -- Optional: role/title displayed in gallery
    title           TEXT,
    -- Custom data fields (job-specific) — e.g., department, employee ID
    custom_fields   JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Token for unauthed gallery access
    gallery_token   TEXT NOT NULL UNIQUE,
    gallery_sent_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_participants_job_id ON participants(job_id);
-- Lookup by name for tether matching (case-insensitive, trimmed)
CREATE INDEX idx_participants_job_name_lower ON participants(job_id, lower(name));

-- ==========================================================================
-- Files (uploaded images)
-- ==========================================================================

CREATE TABLE files (
    id              TEXT PRIMARY KEY,
    job_id          TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    -- May be null briefly if filename can't be parsed; orphan-recovery flow handles this
    participant_id  TEXT REFERENCES participants(id) ON DELETE SET NULL,
    -- Original uploaded filename (e.g., "Jane_Doe_001.jpg")
    original_filename TEXT NOT NULL,
    -- Storage location in R2
    storage_key     TEXT NOT NULL UNIQUE,
    -- Metadata
    width           INTEGER,
    height          INTEGER,
    size_bytes      BIGINT NOT NULL,
    mime_type       TEXT NOT NULL,
    -- Variants stored separately (thumbnail, retouched, web, crops)
    variant         TEXT NOT NULL DEFAULT 'original' CHECK (
        variant IN ('original', 'thumbnail', 'retouched', 'web', 'crop_linkedin', 'crop_slack', 'crop_badge')
    ),
    -- Reference to the source file when this is a derived variant
    source_file_id  TEXT REFERENCES files(id) ON DELETE CASCADE,
    -- Participant favorites + selection
    is_favorite     BOOLEAN NOT NULL DEFAULT FALSE,
    is_selected     BOOLEAN NOT NULL DEFAULT FALSE,
    -- AI processing status (v0.2)
    ai_status       TEXT CHECK (
        ai_status IN ('pending', 'processing', 'completed', 'failed')
    ),
    ai_error        TEXT,
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_files_job_id ON files(job_id);
CREATE INDEX idx_files_participant_id ON files(participant_id);
CREATE INDEX idx_files_variant ON files(variant);

-- ==========================================================================
-- Subscriptions & billing (Stripe sync)
-- ==========================================================================

CREATE TABLE subscriptions (
    id              TEXT PRIMARY KEY,
    account_id      TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    stripe_subscription_id TEXT NOT NULL UNIQUE,
    stripe_price_id TEXT NOT NULL,
    status          TEXT NOT NULL,  -- active, trialing, canceled, past_due, etc.
    current_period_start TIMESTAMPTZ NOT NULL,
    current_period_end   TIMESTAMPTZ NOT NULL,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_subscriptions_account_id ON subscriptions(account_id);

-- Usage events for AI overage metering (v0.2)
CREATE TABLE usage_events (
    id              TEXT PRIMARY KEY,
    account_id      TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    job_id          TEXT REFERENCES jobs(id) ON DELETE SET NULL,
    event_type      TEXT NOT NULL,  -- 'ai_retouch', 'ai_background_swap', 'ai_autocrop'
    quantity        INTEGER NOT NULL DEFAULT 1,
    -- Has this been reported to Stripe yet?
    reported_at     TIMESTAMPTZ,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_usage_events_account_id ON usage_events(account_id);
CREATE INDEX idx_usage_events_unreported
    ON usage_events(account_id, event_type)
    WHERE reported_at IS NULL;

-- ==========================================================================
-- Email log (so we can show photographers what was sent and when)
-- ==========================================================================

CREATE TABLE email_log (
    id              TEXT PRIMARY KEY,
    account_id      TEXT REFERENCES accounts(id) ON DELETE CASCADE,
    participant_id  TEXT REFERENCES participants(id) ON DELETE SET NULL,
    to_email        CITEXT NOT NULL,
    template        TEXT NOT NULL,
    subject         TEXT NOT NULL,
    -- Postmark message ID for status webhooks
    provider_id     TEXT,
    status          TEXT NOT NULL DEFAULT 'queued' CHECK (
        status IN ('queued', 'sent', 'delivered', 'bounced', 'opened', 'failed')
    ),
    sent_at         TIMESTAMPTZ,
    error           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_email_log_participant_id ON email_log(participant_id);
