-- Content tables for afosi.org, replacing the Supabase project.
--
-- Columns are taken from what the old backend reads and writes
-- (/var/www/AFOSI_NGO/backend/controllers) and from the live API responses,
-- so the public site and the admin dashboard see the same shapes.
--
-- When the Supabase data is exported, compare this against the dump's own
-- schema before importing: any type that differs there (for example a date
-- stored as DATE rather than TIMESTAMPTZ) gets a follow-up migration, never an
-- edit to this file once it has been applied anywhere.
--
-- Arrays are JSONB rather than TEXT[]: both come back to the API as JSON
-- arrays, and JSONB also accepts whatever mix the old data turns out to hold.
--
-- Admin accounts are NOT here. They live in Better Auth's tables.

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── news ────────────────────────────────────────────────────────────────────
CREATE TABLE news (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT        NOT NULL,
  slug            TEXT        NOT NULL,
  excerpt         TEXT        NOT NULL,
  content         TEXT        NOT NULL,
  image_url       TEXT,
  category        TEXT        NOT NULL DEFAULT 'general',
  location        TEXT,
  published_date  TIMESTAMPTZ NOT NULL,
  is_published    BOOLEAN     NOT NULL DEFAULT true,
  featured        BOOLEAN     NOT NULL DEFAULT false,
  author          TEXT,
  tags            JSONB       NOT NULL DEFAULT '[]'::jsonb,
  views           INTEGER     NOT NULL DEFAULT 0 CHECK (views >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT news_slug_key UNIQUE (slug),
  CONSTRAINT news_tags_is_array CHECK (jsonb_typeof(tags) = 'array')
);
CREATE INDEX news_public_idx ON news (published_date DESC) WHERE is_published;
CREATE INDEX news_created_idx ON news (created_at DESC);
CREATE TRIGGER news_updated_at BEFORE UPDATE ON news
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── projects ────────────────────────────────────────────────────────────────
CREATE TABLE projects (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT        NOT NULL,
  slug            TEXT        NOT NULL,
  description     TEXT        NOT NULL,
  excerpt         TEXT        NOT NULL DEFAULT '',
  image_url       TEXT,
  icon            TEXT        NOT NULL DEFAULT 'Lightbulb',
  beneficiaries   TEXT,
  duration        TEXT,
  highlights      JSONB       NOT NULL DEFAULT '[]'::jsonb,
  link            TEXT,
  is_external     BOOLEAN     NOT NULL DEFAULT false,
  is_featured     BOOLEAN     NOT NULL DEFAULT false,
  display_order   INTEGER     NOT NULL DEFAULT 0,
  why_it_matters  TEXT,
  what_we_do      JSONB       NOT NULL DEFAULT '[]'::jsonb,
  key_solutions   TEXT,
  who_it_serves   TEXT,
  impact          JSONB       NOT NULL DEFAULT '[]'::jsonb,
  partners        JSONB       NOT NULL DEFAULT '[]'::jsonb,
  call_to_action  TEXT,
  full_content    TEXT,
  has_subpage     BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT projects_slug_key UNIQUE (slug)
);
CREATE INDEX projects_order_idx ON projects (display_order, created_at);
CREATE TRIGGER projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── opportunities ───────────────────────────────────────────────────────────
-- deadline is TEXT on purpose: the site supports open-ended deadlines, so the
-- old data may hold words as well as dates. The API has never parsed it.
CREATE TABLE opportunities (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title              TEXT        NOT NULL,
  slug               TEXT        NOT NULL,
  type               TEXT        NOT NULL CHECK (type IN ('employment', 'consulting', 'volunteering')),
  description        TEXT        NOT NULL,
  location           TEXT        NOT NULL,
  duration           TEXT        NOT NULL,
  deadline           TEXT        NOT NULL,
  full_description   TEXT,
  apply_link         TEXT,
  manually_disabled  BOOLEAN     NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT opportunities_slug_key UNIQUE (slug)
);
CREATE INDEX opportunities_created_idx ON opportunities (created_at DESC);
CREATE TRIGGER opportunities_updated_at BEFORE UPDATE ON opportunities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── gallery ─────────────────────────────────────────────────────────────────
-- src and image_url always hold the same URL; both names are kept because
-- older frontend code reads one and newer code the other.
CREATE TABLE gallery_images (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  src          TEXT        NOT NULL,
  image_url    TEXT        NOT NULL,
  category     TEXT        NOT NULL CHECK (category IN
                 ('Programs', 'Community', 'Youth', 'Events', 'Environment', 'Partners', 'Projects')),
  title        TEXT        NOT NULL,
  alt          TEXT,
  description  TEXT,
  featured     BOOLEAN     NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX gallery_category_idx ON gallery_images (category, created_at DESC);
CREATE INDEX gallery_created_idx ON gallery_images (created_at DESC);
CREATE TRIGGER gallery_images_updated_at BEFORE UPDATE ON gallery_images
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
