-- =========================================
-- Syncra MVP PostgreSQL Schema (DDL)
-- =========================================

-- UUID üretimi için
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------
-- ENUM TYPES
-- -----------------------------
DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('active', 'disabled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE member_role AS ENUM ('admin', 'mod', 'member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE channel_type AS ENUM ('text', 'voice');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE report_status AS ENUM ('open', 'reviewing', 'resolved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE audit_action AS ENUM ('BAN', 'UNBAN', 'MUTE', 'UNMUTE', 'DELETE_MESSAGE', 'RESOLVE_REPORT', 'REJECT_REPORT', 'ROLE_CHANGE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -----------------------------
-- COMMON UPDATED_AT TRIGGER
-- -----------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------
-- USERS
-- -----------------------------
DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username          VARCHAR(15) NOT NULL UNIQUE,
  email             VARCHAR(255) NOT NULL UNIQUE,
  password_hash     TEXT NOT NULL,
  status            user_status NOT NULL DEFAULT 'active',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT check_username_len CHECK (LENGTH(username) >= 3)
);


CREATE TRIGGER trg_users_updated
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------
-- SERVERS
-- -----------------------------
CREATE TABLE IF NOT EXISTS servers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR(10) NOT NULL,
  handle            VARCHAR(40) NOT NULL UNIQUE,
  owner_id          UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  is_published      BOOLEAN NOT NULL DEFAULT FALSE,
  invite_min_role   member_role NOT NULL DEFAULT 'member',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_servers_owner ON servers(owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_servers_owner_name_lower ON servers(owner_id, lower(name));

CREATE TRIGGER trg_servers_updated
BEFORE UPDATE ON servers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------
-- SERVER INVITES (BONUS, çok işe yarar)
-- -----------------------------
CREATE TABLE IF NOT EXISTS server_invites (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id          UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  code              VARCHAR(24) NOT NULL UNIQUE,
  created_by        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_role     member_role NOT NULL DEFAULT 'member',
  max_uses          INT,
  uses_count        INT NOT NULL DEFAULT 0,
  expires_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invites_server ON server_invites(server_id);

-- -----------------------------
-- MEMBERSHIPS (RBAC + Moderation state)
-- -----------------------------
CREATE TABLE IF NOT EXISTS server_memberships (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id          UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  role              member_role NOT NULL DEFAULT 'member',

  -- Moderasyon durumları
  is_banned          BOOLEAN NOT NULL DEFAULT FALSE,
  banned_reason      TEXT,
  banned_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  banned_at          TIMESTAMPTZ,

  mute_until         TIMESTAMPTZ,  -- NULL ise mute yok
  muted_reason       TEXT,
  muted_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  muted_at           TIMESTAMPTZ,

  -- Online/Offline Durumu
  is_online          BOOLEAN NOT NULL DEFAULT FALSE,
  last_seen_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_membership UNIQUE (server_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_server ON server_memberships(server_id);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON server_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_banned ON server_memberships(server_id, is_banned);
CREATE INDEX IF NOT EXISTS idx_memberships_mute ON server_memberships(server_id, mute_until);

CREATE TRIGGER trg_memberships_updated
BEFORE UPDATE ON server_memberships
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------
-- CATEGORIES
-- -----------------------------
CREATE TABLE IF NOT EXISTS categories (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id          UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name              VARCHAR(10) NOT NULL,
  position          INT NOT NULL DEFAULT 0,
  is_published      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_server ON categories(server_id);

CREATE TRIGGER trg_categories_updated
BEFORE UPDATE ON categories
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------
-- CHANNELS
-- -----------------------------
CREATE TABLE IF NOT EXISTS channels (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id          UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  category_id        UUID REFERENCES categories(id) ON DELETE SET NULL,

  name              VARCHAR(10) NOT NULL,
  type              channel_type NOT NULL DEFAULT 'text',
  position          INT NOT NULL DEFAULT 0,

  -- MVP için basit izin modeli:
  -- min_role_to_view: bu rolden düşük olan göremez (member < mod < admin)
  -- min_role_to_post: bu rolden düşük olan mesaj atamaz (text için)
  min_role_to_view  member_role NOT NULL DEFAULT 'member',
  min_role_to_post  member_role NOT NULL DEFAULT 'member',
  is_published      BOOLEAN NOT NULL DEFAULT FALSE,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channels_server ON channels(server_id);
CREATE INDEX IF NOT EXISTS idx_channels_category ON channels(category_id);
CREATE INDEX IF NOT EXISTS idx_channels_type ON channels(type);

CREATE TRIGGER trg_channels_updated
BEFORE UPDATE ON channels
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------
-- MESSAGES (text channels)
-- -----------------------------
CREATE TABLE IF NOT EXISTS messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id          UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  channel_id         UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  author_id          UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  content           TEXT NOT NULL,
  is_deleted        BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_at        TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_channel_time ON messages(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_author ON messages(author_id);

CREATE TRIGGER trg_messages_updated
BEFORE UPDATE ON messages
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------
-- REPORTS (message reporting)
-- -----------------------------
CREATE TABLE IF NOT EXISTS message_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id          UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  message_id         UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,

  reporter_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  reason             TEXT,
  status             report_status NOT NULL DEFAULT 'open',

  reviewed_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at        TIMESTAMPTZ,
  resolution_note    TEXT,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- aynı kullanıcı aynı mesajı tekrar tekrar raporlamasın
  CONSTRAINT uq_report_once UNIQUE (message_id, reporter_id)
);

CREATE INDEX IF NOT EXISTS idx_reports_server_status ON message_reports(server_id, status);
CREATE INDEX IF NOT EXISTS idx_reports_message ON message_reports(message_id);

CREATE TRIGGER trg_reports_updated
BEFORE UPDATE ON message_reports
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------
-- VOICE PRESENCE (simülasyon)
-- Kullanıcı aynı anda bir sunucuda en fazla 1 voice odada olsun.
-- -----------------------------
CREATE TABLE IF NOT EXISTS voice_presence (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id          UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id         UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE, -- type=voice olmalı (uygulama katmanı kontrol eder)

  joined_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_voice_one_per_server UNIQUE (server_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_voice_presence_channel ON voice_presence(channel_id);
CREATE INDEX IF NOT EXISTS idx_voice_presence_server ON voice_presence(server_id);

-- -----------------------------
-- BOT: POLLS (/poll)
-- -----------------------------
CREATE TABLE IF NOT EXISTS polls (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id          UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  channel_id         UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  created_by         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  question          TEXT NOT NULL,
  is_closed         BOOLEAN NOT NULL DEFAULT FALSE,
  closes_at         TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_polls_channel_time ON polls(channel_id, created_at DESC);

CREATE TRIGGER trg_polls_updated
BEFORE UPDATE ON polls
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS poll_options (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id            UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  label             VARCHAR(120) NOT NULL,
  position          INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_poll_options_poll ON poll_options(poll_id);

CREATE TABLE IF NOT EXISTS poll_votes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id            UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  option_id          UUID NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  voter_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  voted_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 1 kullanıcı 1 poll'da 1 oy
  CONSTRAINT uq_one_vote_per_poll UNIQUE (poll_id, voter_id)
);

CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON poll_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_option ON poll_votes(option_id);

-- -----------------------------
-- AUDIT LOG (Bonus ama çok değerli)
-- Moderasyon / kritik işlemler izlenebilir olsun
-- -----------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id          UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  actor_id           UUID REFERENCES users(id) ON DELETE SET NULL,   -- işlemi yapan
  target_user_id     UUID REFERENCES users(id) ON DELETE SET NULL,   -- hedef kullanıcı (ban/mute)
  target_message_id  UUID REFERENCES messages(id) ON DELETE SET NULL, -- hedef mesaj (silme vb.)
  action             audit_action NOT NULL,
  reason             TEXT,
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_server_time ON audit_logs(server_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);

-- =========================================
-- END OF SCHEMA
-- =========================================
