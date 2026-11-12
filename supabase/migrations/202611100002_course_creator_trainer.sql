-- Apply after 202610150001_authorization.sql.
BEGIN;

CREATE OR REPLACE FUNCTION private.ka_set_course_creator_trainer()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  creator_id uuid := auth.uid();
BEGIN
  -- Upserts also run INSERT triggers when saving an existing course.
  IF EXISTS (SELECT 1 FROM public.courses WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  IF creator_id IS NOT NULL THEN
    NEW.created_by := creator_id;
    SELECT coalesce(nullif(btrim(p.full_name), ''),
                    nullif(btrim(u.raw_user_meta_data->>'full_name'), ''),
                    split_part(u.email, '@', 1), 'User')
      INTO NEW.trainer
      FROM auth.users u
      LEFT JOIN public.profiles p ON p.id = u.id
      WHERE u.id = creator_id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.ka_set_course_creator_trainer() FROM PUBLIC;
DROP TRIGGER IF EXISTS courses_set_creator_trainer ON public.courses;
CREATE TRIGGER courses_set_creator_trainer
BEFORE INSERT ON public.courses
FOR EACH ROW EXECUTE FUNCTION private.ka_set_course_creator_trainer();

COMMIT;
