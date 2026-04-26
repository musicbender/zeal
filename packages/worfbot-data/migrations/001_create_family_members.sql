CREATE TABLE family_members (
  id              SERIAL PRIMARY KEY,
  discord_user_id VARCHAR(20) NOT NULL UNIQUE,
  display_name    VARCHAR(100) NOT NULL,
  timezone        VARCHAR(50) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
