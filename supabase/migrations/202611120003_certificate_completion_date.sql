-- Save the first completion once, independently of later course activity.
ALTER TABLE public.user_progress ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Historical last-viewed dates are only an approximation where no original
-- completion timestamp was recorded. Leave unknown dates empty.
UPDATE public.user_progress SET completed_at = NULLIF(trim(last_viewed_at::text), '')::timestamptz
WHERE progress_percent >= 100 AND completed_at IS NULL AND last_viewed_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.preserve_certificate_completion_date()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.completed_at := OLD.completed_at;
  ELSE
    NEW.completed_at := NULL;
  END IF;
  IF NEW.completed_at IS NULL AND NEW.progress_percent >= 100 THEN
    NEW.completed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS preserve_certificate_completion_date ON public.user_progress;
CREATE TRIGGER preserve_certificate_completion_date
BEFORE INSERT OR UPDATE ON public.user_progress
FOR EACH ROW EXECUTE FUNCTION public.preserve_certificate_completion_date();
