-- Repair older installations before applying the completion-date migration.
ALTER TABLE public.user_progress
  ADD COLUMN IF NOT EXISTS learning_hours numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_viewed_at text,
  ADD COLUMN IF NOT EXISTS quiz_history jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Refresh PostgREST after adding columns used by progress PATCH requests.
NOTIFY pgrst, 'reload schema';
