-- Chapters table
CREATE TABLE IF NOT EXISTS chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id BIGINT,
  subject TEXT NOT NULL,
  class TEXT,
  board TEXT NOT NULL DEFAULT 'NCERT',
  chapter_name TEXT NOT NULL,
  summary JSONB, -- Subject-dependent structured summary
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Content Chunks table (semantic sections of textbook content)
CREATE TABLE IF NOT EXISTS chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID REFERENCES chapters(id) ON DELETE CASCADE,
  chunk_title TEXT,
  chunk_content TEXT NOT NULL,
  chunk_order INT NOT NULL,
  chunk_type TEXT NOT NULL -- 'theory' | 'example' | 'exercise' | 'facts'
);

-- Generated Worksheets table
CREATE TABLE IF NOT EXISTS generated_worksheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hash TEXT NOT NULL UNIQUE, -- md5 of (chapter_ids + difficulty + question_count + prompt_version + generation_mode)
  chapter_id UUID REFERENCES chapters(id) ON DELETE CASCADE, -- Nullable for multi-chapter sheets
  chapter_ids UUID[], -- Array of selected chapter UUIDs
  difficulty TEXT NOT NULL,
  question_count INT NOT NULL,
  generation_mode TEXT NOT NULL, -- 'similarity' | 'strict_grounded' | 'revision' | 'challenge' | 'weak_foundation'
  prompt_version TEXT NOT NULL,
  pdf_url TEXT NOT NULL, -- URL pointing to Supabase Storage
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Migration commands for existing databases:
-- ALTER TABLE generated_worksheets ALTER COLUMN chapter_id DROP NOT NULL;
-- ALTER TABLE generated_worksheets ADD COLUMN IF NOT EXISTS chapter_ids UUID[];

-- Enable Row Level Security (RLS) on all tables to prevent public/anonymous access
-- (The API server uses the service_role key, which bypasses RLS, so no policies are needed for backend access).
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_worksheets ENABLE ROW LEVEL SECURITY;
