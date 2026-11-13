-- The blog: long-form posts written in the dashboard by admins and by blog
-- editors (Better Auth role "editor", see src/auth.js).
--
-- Separate from news on purpose. News holds newsletters and reports (mostly
-- PDFs, filed by type); a blog post is an article read on the site itself,
-- with a byline, a cover image, a draft state and a publish time.
--
-- - content is Markdown. It is stored as written and rendered by the site
--   with an escape-first renderer (src/markdown.js), so no HTML from here is
--   ever inserted into a page as-is.
-- - status is draft or published. A published post with published_at in the
--   future is scheduled: the public API does not return it until that time.
-- - author_id is the Better Auth user who created the post. There is no
--   foreign key: content migrations run before Better Auth creates its
--   tables (scripts/migrate.js), and a post must outlive the account that
--   wrote it. author_name is the byline shown on the site, editable.

CREATE TABLE blog_posts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT        NOT NULL,
  slug             TEXT        NOT NULL,
  excerpt          TEXT        NOT NULL DEFAULT '',
  content          TEXT        NOT NULL DEFAULT '',
  cover_image_url  TEXT,
  cover_image_alt  TEXT,
  category         TEXT        NOT NULL DEFAULT 'Stories',
  tags             JSONB       NOT NULL DEFAULT '[]'::jsonb,
  status           TEXT        NOT NULL DEFAULT 'draft',
  published_at     TIMESTAMPTZ,
  featured         BOOLEAN     NOT NULL DEFAULT false,
  author_id        UUID,
  author_name      TEXT        NOT NULL DEFAULT '',
  reading_minutes  INTEGER     NOT NULL DEFAULT 1 CHECK (reading_minutes >= 1),
  views            INTEGER     NOT NULL DEFAULT 0 CHECK (views >= 0),
  updated_by       UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT blog_posts_slug_key UNIQUE (slug),
  CONSTRAINT blog_posts_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT blog_posts_title_length CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT blog_posts_status_check CHECK (status IN ('draft', 'published')),
  CONSTRAINT blog_posts_published_has_date CHECK (status = 'draft' OR published_at IS NOT NULL),
  CONSTRAINT blog_posts_tags_is_array CHECK (jsonb_typeof(tags) = 'array')
);

-- The public listing: newest published first.
CREATE INDEX blog_posts_public_idx ON blog_posts (published_at DESC) WHERE status = 'published';
CREATE INDEX blog_posts_category_idx ON blog_posts (category, published_at DESC) WHERE status = 'published';
CREATE INDEX blog_posts_tags_idx ON blog_posts USING GIN (tags);
CREATE INDEX blog_posts_created_idx ON blog_posts (created_at DESC);

-- updated_at tracks edits, not readers: counting a view only sets "views",
-- which is not in this column list, so it leaves updated_at alone.
CREATE TRIGGER blog_posts_updated_at
  BEFORE UPDATE OF title, slug, excerpt, content, cover_image_url, cover_image_alt,
                   category, tags, status, published_at, featured, author_name
  ON blog_posts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Publishing without a date means "now". Done here rather than in the route so
-- every path that publishes (create, update, a future bulk tool) agrees, and
-- the published_has_date check can never trip on an ordinary publish.
CREATE OR REPLACE FUNCTION blog_posts_default_published_at() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'published' AND NEW.published_at IS NULL THEN
    NEW.published_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER blog_posts_published_at BEFORE INSERT OR UPDATE ON blog_posts
  FOR EACH ROW EXECUTE FUNCTION blog_posts_default_published_at();
