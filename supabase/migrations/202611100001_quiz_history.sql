-- Keep individual scores alongside the existing highest score and attempt count.
-- Access follows the existing user_progress row-level policies.
ALTER TABLE public.user_progress
  ADD COLUMN IF NOT EXISTS quiz_history jsonb NOT NULL DEFAULT '[]'::jsonb;
