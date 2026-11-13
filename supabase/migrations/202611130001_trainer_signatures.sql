-- Apply to the same Supabase project used by the app, after its base schema
-- and 202610150001_authorization.sql. This is an upgrade, not a fresh setup.
DO $$ BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'Trainer signatures require public.profiles. Verify the Supabase project matches the app. For a fresh project apply supabase_schema.sql followed by 202610150001_authorization.sql first.';
  END IF;
  IF to_regprocedure('private.ka_role()') IS NULL THEN
    RAISE EXCEPTION 'Trainer signatures require the authorization migration (202610150001_authorization.sql).';
  END IF;
END $$;

CREATE TABLE public.trainer_signatures (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  image text NOT NULL CHECK (
    length(image) <= 700000 AND image ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$'
  )
);
ALTER TABLE public.trainer_signatures ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trainer_signatures TO authenticated;
CREATE POLICY trainer_signatures_read ON public.trainer_signatures
  FOR SELECT TO authenticated USING (true);
CREATE POLICY trainer_signatures_write ON public.trainer_signatures
  FOR ALL TO authenticated USING (private.ka_role() = 'admin')
  WITH CHECK (private.ka_role() = 'admin' AND EXISTS (
    SELECT 1 FROM public.profiles WHERE id = profile_id AND role IN ('trainer', 'admin')
  ));
