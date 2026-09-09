-- =============================================================================
-- AviatorPass Migration 034 — Category SEO/media, course catalog order, certificates
-- =============================================================================

ALTER TABLE course_categories
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS seo_title TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS meta_description TEXT NOT NULL DEFAULT '';

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_courses_display_order ON courses(display_order);
CREATE INDEX IF NOT EXISTS idx_course_categories_sort ON course_categories(sort_order);

-- Stored QR payloads should never point at localhost.
UPDATE certificates
SET qr_payload = regexp_replace(
  qr_payload,
  '^https?://(localhost|127\\.0\\.0\\.1)(:[0-9]+)?',
  'https://www.aviatorpass.com'
)
WHERE qr_payload ~ '^https?://(localhost|127\\.0\\.0\\.1)';
