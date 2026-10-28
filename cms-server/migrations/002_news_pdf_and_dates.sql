-- Match the news table to the exported Supabase data.
--
-- - pdf_url: newsletters and reports are PDFs; the site's "View PDF" link and
--   the dashboard's newsletter panel both read it.
-- - type: 'article' or 'newsletter' in the old data; the site uses it, with
--   category, to file each item under Newsletter or Report.
-- - published_date was a DATE in Supabase ("2026-02-28"). As TIMESTAMPTZ it
--   would come back as a full timestamp, which the dashboard's date input
--   cannot show when editing. db.js returns DATE values as plain strings.
--
-- The opportunities table in Supabase also has overview, about_role,
-- responsibilities, requirements, benefits and how_to_apply. They are empty in
-- every row and nothing reads them, so they are not carried over.

ALTER TABLE news ADD COLUMN pdf_url TEXT;
ALTER TABLE news ADD COLUMN type TEXT NOT NULL DEFAULT 'article';

DROP INDEX news_public_idx;
ALTER TABLE news ALTER COLUMN published_date TYPE DATE USING published_date::date;
CREATE INDEX news_public_idx ON news (published_date DESC) WHERE is_published;
