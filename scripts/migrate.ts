import { loadEnvFile } from "node:process";

import { neon } from "@neondatabase/serverless";

try {
  loadEnvFile(".env.local");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not configured");

const sql = neon(databaseUrl);

await sql`
  CREATE TABLE IF NOT EXISTS posts (
    slug text PRIMARY KEY CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    title text NOT NULL CHECK (length(btrim(title)) > 0),
    subtitle text,
    body_markdown text NOT NULL CHECK (length(btrim(body_markdown)) > 0),
    published_at timestamptz NOT NULL DEFAULT now(),
    thumbnail text,
    thumbnail_alt text,
    draft boolean NOT NULL DEFAULT false,
    category_path text NOT NULL DEFAULT '미분류',
    visibility text NOT NULL DEFAULT 'public',
    submission_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )
`;

await sql`
  ALTER TABLE posts
    DROP COLUMN IF EXISTS revision,
    ADD COLUMN IF NOT EXISTS submission_id uuid,
    ADD COLUMN IF NOT EXISTS category_path text NOT NULL DEFAULT '미분류',
    ADD COLUMN IF NOT EXISTS visibility text DEFAULT 'public'
`;

await sql`UPDATE posts SET visibility = 'public' WHERE visibility IS NULL`;

await sql`
  ALTER TABLE posts
    ALTER COLUMN visibility SET DEFAULT 'public',
    ALTER COLUMN visibility SET NOT NULL,
    DROP CONSTRAINT IF EXISTS posts_visibility_valid,
    ADD CONSTRAINT posts_visibility_valid CHECK (
      visibility IN ('public', 'friends', 'close_friends', 'private')
    )
`;

await sql`
  ALTER TABLE posts
    DROP CONSTRAINT IF EXISTS posts_category_path_valid,
    ADD CONSTRAINT posts_category_path_valid CHECK (
      length(btrim(category_path)) BETWEEN 1 AND 200
      AND category_path = btrim(category_path)
      AND category_path !~ '(^/|/$|//)'
      AND category_path !~ '[[:cntrl:]]'
      AND category_path !~ '(^|/)[^/]{41,}(/|$)'
      AND array_length(string_to_array(category_path, '/'), 1) <= 5
    )
`;

await sql`
  CREATE INDEX IF NOT EXISTS posts_category_path_idx
      ON posts (category_path, published_at DESC)
   WHERE draft = false
`;

await sql`
  CREATE UNIQUE INDEX IF NOT EXISTS posts_submission_id_unique
      ON posts (submission_id)
   WHERE submission_id IS NOT NULL
`;

await sql`DROP INDEX IF EXISTS posts_public_feed_idx`;

await sql`
  CREATE INDEX posts_public_feed_idx
      ON posts (published_at DESC, slug)
   WHERE draft = false AND visibility = 'public'
`;

await sql`
  CREATE TABLE IF NOT EXISTS post_translations (
    post_slug text NOT NULL REFERENCES posts(slug) ON DELETE CASCADE,
    locale text NOT NULL CHECK (locale IN ('en', 'ja', 'zh-CN')),
    title text NOT NULL CHECK (length(btrim(title)) > 0),
    body_markdown text NOT NULL CHECK (length(btrim(body_markdown)) > 0),
    published_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (post_slug, locale)
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS post_translation_generations (
    id uuid PRIMARY KEY,
    post_slug text NOT NULL REFERENCES posts(slug) ON DELETE CASCADE,
    locale text NOT NULL CHECK (locale IN ('en', 'ja', 'zh-CN')),
    model_locale text NOT NULL CHECK (model_locale IN ('en', 'ja', 'zh-Hans')),
    source_title text NOT NULL CHECK (length(btrim(source_title)) > 0),
    source_body_markdown text NOT NULL CHECK (length(btrim(source_body_markdown)) > 0),
    source_hash text NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
    prompt_version integer NOT NULL CHECK (prompt_version > 0),
    status text NOT NULL DEFAULT 'pending' CHECK (
      status IN ('pending', 'processing', 'ready', 'failed', 'superseded')
    ),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    available_at timestamptz NOT NULL DEFAULT now(),
    requested_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    completed_at timestamptz,
    draft_title text,
    draft_body_markdown text,
    tradeoffs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(tradeoffs) = 'array'),
    last_error text,
    CHECK (
      status <> 'ready'
      OR (
        draft_title IS NOT NULL
        AND length(btrim(draft_title)) > 0
        AND draft_body_markdown IS NOT NULL
        AND length(btrim(draft_body_markdown)) > 0
      )
    )
  )
`;

await sql`
  CREATE UNIQUE INDEX IF NOT EXISTS post_translation_generations_current_unique
      ON post_translation_generations (post_slug, locale)
   WHERE status IN ('pending', 'processing', 'ready')
`;

await sql`
  CREATE INDEX IF NOT EXISTS post_translation_generations_latest_idx
      ON post_translation_generations (post_slug, locale, requested_at DESC, id DESC)
`;

await sql`
  CREATE TABLE IF NOT EXISTS post_study_generations (
    id uuid PRIMARY KEY,
    post_slug text NOT NULL,
    locale text NOT NULL,
    source_hash text NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
    prompt_version integer NOT NULL CHECK (prompt_version > 0),
    status text NOT NULL DEFAULT 'pending' CHECK (
      status IN ('pending', 'processing', 'completed', 'failed', 'superseded')
    ),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    available_at timestamptz NOT NULL DEFAULT now(),
    requested_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    completed_at timestamptz,
    last_error text,
    FOREIGN KEY (post_slug, locale)
      REFERENCES post_translations(post_slug, locale) ON DELETE CASCADE
  )
`;

await sql`
  CREATE UNIQUE INDEX IF NOT EXISTS post_study_generations_active_unique
      ON post_study_generations (post_slug, locale)
   WHERE status IN ('pending', 'processing')
`;

await sql`
  CREATE INDEX IF NOT EXISTS post_study_generations_latest_idx
      ON post_study_generations (post_slug, locale, requested_at DESC, id DESC)
`;

await sql`
  CREATE TABLE IF NOT EXISTS post_study_items (
    generation_id uuid NOT NULL REFERENCES post_study_generations(id) ON DELETE CASCADE,
    item_key text NOT NULL CHECK (length(item_key) BETWEEN 1 AND 240),
    sort_order integer NOT NULL CHECK (sort_order >= 0),
    kind text NOT NULL CHECK (kind IN ('word', 'expression')),
    text text NOT NULL CHECK (length(btrim(text)) BETWEEN 1 AND 120),
    canonical_text text NOT NULL CHECK (length(btrim(canonical_text)) BETWEEN 1 AND 120),
    reading text CHECK (reading IS NULL OR length(btrim(reading)) BETWEEN 1 AND 120),
    meaning_ko text NOT NULL CHECK (length(btrim(meaning_ko)) BETWEEN 1 AND 500),
    note_ko text NOT NULL CHECK (length(btrim(note_ko)) BETWEEN 1 AND 500),
    context_text text NOT NULL CHECK (length(btrim(context_text)) BETWEEN 1 AND 500),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (generation_id, item_key)
  )
`;

await sql`
  ALTER TABLE post_study_items
    ADD COLUMN IF NOT EXISTS canonical_text text
`;

await sql`
  UPDATE post_study_items
     SET canonical_text = text
   WHERE canonical_text IS NULL
`;

await sql`
  ALTER TABLE post_study_items
    ALTER COLUMN canonical_text SET NOT NULL,
    DROP CONSTRAINT IF EXISTS post_study_items_reading_valid,
    DROP CONSTRAINT IF EXISTS post_study_items_canonical_text_valid,
    ADD CONSTRAINT post_study_items_canonical_text_valid CHECK (
      length(btrim(canonical_text)) BETWEEN 1 AND 120
    ),
    ADD CONSTRAINT post_study_items_reading_valid CHECK (
      reading IS NULL OR length(btrim(reading)) BETWEEN 1 AND 120
    )
`;

await sql`
  CREATE TABLE IF NOT EXISTS post_study_dismissals (
    locale text NOT NULL,
    item_key text NOT NULL CHECK (length(item_key) BETWEEN 1 AND 240),
    text text NOT NULL CHECK (length(btrim(text)) BETWEEN 1 AND 120),
    dismissed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (locale, item_key)
  )
`;

await sql`
  DO $$
  BEGIN
    IF EXISTS (
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'post_study_dismissals'
         AND column_name = 'post_slug'
    ) THEN
      DELETE FROM post_study_dismissals AS duplicate
       USING post_study_dismissals AS keeper
       WHERE duplicate.locale = keeper.locale
         AND duplicate.item_key = keeper.item_key
         AND (duplicate.dismissed_at, duplicate.post_slug)
             > (keeper.dismissed_at, keeper.post_slug);
      ALTER TABLE post_study_dismissals
        DROP CONSTRAINT IF EXISTS post_study_dismissals_post_slug_locale_fkey;
      ALTER TABLE post_study_dismissals
        DROP CONSTRAINT IF EXISTS post_study_dismissals_pkey;
      ALTER TABLE post_study_dismissals DROP COLUMN post_slug;
      ALTER TABLE post_study_dismissals
        ADD PRIMARY KEY (locale, item_key);
    END IF;
  END
  $$
`;

await sql`
  ALTER TABLE post_study_dismissals
    DROP CONSTRAINT IF EXISTS post_study_dismissals_locale_valid,
    ADD CONSTRAINT post_study_dismissals_locale_valid CHECK (
      locale IN ('en', 'ja', 'zh-CN')
    )
`;

await sql`
  CREATE TABLE IF NOT EXISTS post_writing_feedback_generations (
    id uuid PRIMARY KEY,
    post_slug text NOT NULL REFERENCES posts(slug) ON DELETE CASCADE,
    locale text NOT NULL CHECK (locale IN ('ko', 'en', 'ja', 'zh-CN')),
    source_title text NOT NULL CHECK (length(btrim(source_title)) BETWEEN 1 AND 200),
    source_body_markdown text NOT NULL CHECK (length(btrim(source_body_markdown)) > 0),
    source_hash text NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
    prompt_version integer NOT NULL CHECK (prompt_version > 0),
    status text NOT NULL DEFAULT 'pending' CHECK (
      status IN ('pending', 'processing', 'ready', 'failed', 'superseded')
    ),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    available_at timestamptz NOT NULL DEFAULT now(),
    requested_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    completed_at timestamptz,
    last_error text
  )
`;

await sql`
  CREATE UNIQUE INDEX IF NOT EXISTS post_writing_feedback_generations_active_unique
      ON post_writing_feedback_generations (post_slug, locale)
   WHERE status IN ('pending', 'processing', 'ready')
`;

await sql`
  CREATE INDEX IF NOT EXISTS post_writing_feedback_generations_latest_idx
      ON post_writing_feedback_generations (post_slug, locale, requested_at DESC, id DESC)
`;

await sql`
  CREATE TABLE IF NOT EXISTS post_writing_feedback_items (
    generation_id uuid NOT NULL REFERENCES post_writing_feedback_generations(id) ON DELETE CASCADE,
    item_key text NOT NULL CHECK (item_key ~ '^[0-9a-f]{64}$'),
    sort_order integer NOT NULL CHECK (sort_order >= 0),
    feedback text NOT NULL CHECK (length(btrim(feedback)) BETWEEN 1 AND 1200),
    reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 1600),
    dismissed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (generation_id, item_key)
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS admin_credentials (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton = true),
    password_hash text NOT NULL,
    credential_version integer NOT NULL DEFAULT 1 CHECK (credential_version > 0),
    updated_at timestamptz NOT NULL DEFAULT now()
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash text PRIMARY KEY CHECK (length(token_hash) = 43),
    credential_version integer NOT NULL CHECK (credential_version > 0),
    csrf_token text NOT NULL CHECK (length(csrf_token) = 43),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    CHECK (expires_at > created_at)
  )
`;

await sql`
  CREATE INDEX IF NOT EXISTS admin_sessions_expires_idx
      ON admin_sessions (expires_at)
`;

await sql`
  CREATE TABLE IF NOT EXISTS admin_login_limits (
    bucket text PRIMARY KEY,
    window_started_at timestamptz NOT NULL,
    attempt_count integer NOT NULL CHECK (attempt_count > 0),
    updated_at timestamptz NOT NULL DEFAULT now()
  )
`;

console.log("Database schema is ready.");
