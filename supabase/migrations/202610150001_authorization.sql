-- Apply after supabase_schema.sql. Review existing privileged profiles before rollout.
-- Does not infer ownership from display names or assign an administrator automatically.
BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid();
CREATE INDEX IF NOT EXISTS courses_created_by_idx ON public.courses(created_by);

CREATE TABLE IF NOT EXISTS public.team_members (
  manager_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (manager_id, member_id),
  CHECK (manager_id <> member_id)
);
CREATE INDEX IF NOT EXISTS team_members_member_idx ON public.team_members(member_id);

CREATE TABLE IF NOT EXISTS public.course_assignments (
  course_id text NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  application_id integer NOT NULL DEFAULT 0,
  PRIMARY KEY (course_id, user_id)
);
DO $$ BEGIN
  IF (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='course_assignments' AND column_name='user_id') <> 'uuid' THEN
    RAISE EXCEPTION 'course_assignments.user_id must reference profiles.id as UUID. Review and migrate legacy assignments before applying authorization.';
  END IF;
END; $$;

-- Preserve assignments that the old app represented only in progress records.
-- Legacy progress can refer to deleted/missing courses. Preserve those records,
-- but do not create invalid assignments for them.
INSERT INTO public.course_assignments(course_id,user_id,application_id)
SELECT DISTINCT ON (progress.course_id,u.id) progress.course_id,u.id,coalesce(progress.application_id,0)
FROM public.user_progress progress
JOIN public.courses course ON course.id = progress.course_id
JOIN auth.users u ON lower(u.email)=lower(progress.user_email)
JOIN public.profiles p ON p.id=u.id
WHERE progress.due_date IS NOT NULL OR progress.assigned_by IS NOT NULL
ORDER BY progress.course_id,u.id,progress.updated_at DESC
ON CONFLICT (course_id,user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.role_change_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  old_role text NOT NULL,
  new_role text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION private.ka_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()), 'employee');
$$;
CREATE OR REPLACE FUNCTION private.ka_email() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT lower(u.email) FROM auth.users u WHERE u.id = auth.uid();
$$;
CREATE OR REPLACE FUNCTION private.ka_can_manage_course(course text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND (private.ka_role() = 'admin' OR (
    private.ka_role() = 'trainer' AND EXISTS (
      SELECT 1 FROM public.courses c WHERE c.id = course AND c.created_by = auth.uid()
    )
  ));
$$;
CREATE OR REPLACE FUNCTION private.ka_manages_learner(email text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND (private.ka_role() = 'admin' OR (
    private.ka_role() = 'team_leader' AND EXISTS (
      SELECT 1 FROM public.team_members t JOIN auth.users u ON u.id = t.member_id
      WHERE t.manager_id = auth.uid() AND lower(u.email) = lower($1)
    )
  ));
$$;
CREATE OR REPLACE FUNCTION private.ka_can_review(course text, email text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.ka_can_manage_course(course) OR private.ka_manages_learner(email);
$$;

REVOKE ALL ON FUNCTION private.ka_role(), private.ka_email(), private.ka_can_manage_course(text), private.ka_manages_learner(text), private.ka_can_review(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.ka_role(), private.ka_email(), private.ka_can_manage_course(text), private.ka_manages_learner(text), private.ka_can_review(text,text) TO authenticated;

-- Always create employee profiles, including when signup metadata requests admin.
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.profiles(id, full_name, department, role, email)
  VALUES (NEW.id, coalesce(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    coalesce(NEW.raw_user_meta_data->>'department', 'Software Engineering'), 'employee', NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Only the checked admin RPC can change roles through the API. It serializes role
-- changes, protects the last admin and writes an audit record in the same transaction.
CREATE OR REPLACE FUNCTION public.set_user_role(p_user_id uuid, p_role text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE previous_role text;
BEGIN
  IF auth.uid() IS NULL OR private.ka_role() <> 'admin' THEN
    RAISE EXCEPTION 'Administrator access is required.' USING ERRCODE = '42501';
  END IF;
  IF p_role IS NULL OR p_role NOT IN ('employee','team_leader','trainer','admin') THEN
    RAISE EXCEPTION 'Invalid user role.' USING ERRCODE = '22023';
  END IF;
  LOCK TABLE public.profiles IN SHARE ROW EXCLUSIVE MODE;
  -- Recheck after acquiring the lock: a competing admin may have demoted us.
  IF private.ka_role() <> 'admin' THEN RAISE EXCEPTION 'Administrator access is required.' USING ERRCODE = '42501'; END IF;
  SELECT role INTO previous_role FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'User profile not found.' USING ERRCODE = 'P0002'; END IF;
  IF previous_role = 'admin' AND p_role <> 'admin' AND (SELECT count(*) FROM public.profiles WHERE role = 'admin') <= 1 THEN
    RAISE EXCEPTION 'The last administrator cannot be demoted.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.profiles SET role = p_role, updated_at = now() WHERE id = p_user_id;
  IF previous_role IS DISTINCT FROM p_role THEN
    INSERT INTO public.role_change_audit(actor_id,target_id,old_role,new_role) VALUES(auth.uid(),p_user_id,previous_role,p_role);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_user_role(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid,text) TO authenticated;

-- Replace old permissive policies; PostgreSQL ORs permissive policies together.
DO $$
DECLARE item record; target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['profiles','courses','user_progress','practical_submissions','notifications','posts','team_members','course_assignments','role_change_audit','documents'] LOOP
    IF to_regclass('public.' || target) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target);
    FOR item IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = target LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', item.policyname, target);
    END LOOP;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', target);
  END LOOP;
END;
$$;

GRANT SELECT, DELETE ON public.profiles TO authenticated;
GRANT UPDATE(full_name,department,updated_at) ON public.profiles TO authenticated;
-- Revoke old column grants too, if the project previously defined them.
REVOKE INSERT(id,user_id,full_name,role,department,email,created_at,updated_at), UPDATE(id,user_id,role,email,created_at) ON public.profiles FROM anon, authenticated;
CREATE POLICY profiles_read ON public.profiles FOR SELECT TO authenticated USING (
  id = auth.uid() OR private.ka_role() = 'admin'
  OR (private.ka_role() = 'trainer' AND role = 'employee')
  OR private.ka_manages_learner(email)
);
CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR private.ka_role() = 'admin')
  WITH CHECK (id = auth.uid() OR private.ka_role() = 'admin');
CREATE POLICY profiles_delete ON public.profiles FOR DELETE TO authenticated
  USING (private.ka_role() = 'admin' AND id <> auth.uid());

GRANT SELECT,INSERT,UPDATE,DELETE ON public.courses TO authenticated;
CREATE POLICY courses_read ON public.courses FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY courses_insert ON public.courses FOR INSERT TO authenticated
  WITH CHECK (private.ka_role() = 'admin' OR (private.ka_role() = 'trainer' AND created_by = auth.uid()));
CREATE POLICY courses_update ON public.courses FOR UPDATE TO authenticated
  USING (private.ka_can_manage_course(id))
  WITH CHECK (private.ka_role() = 'admin' OR (private.ka_role() = 'trainer' AND created_by = auth.uid()));
CREATE POLICY courses_delete ON public.courses FOR DELETE TO authenticated USING (private.ka_can_manage_course(id));

GRANT SELECT,INSERT,UPDATE,DELETE ON public.team_members TO authenticated;
CREATE POLICY team_members_read ON public.team_members FOR SELECT TO authenticated
  USING (manager_id = auth.uid() OR member_id = auth.uid() OR private.ka_role() = 'admin');
CREATE POLICY team_members_write ON public.team_members FOR ALL TO authenticated
  USING (private.ka_role() = 'admin') WITH CHECK (private.ka_role() = 'admin');

GRANT SELECT,INSERT,UPDATE,DELETE ON public.user_progress TO authenticated;
CREATE POLICY progress_read ON public.user_progress FOR SELECT TO authenticated
  USING (lower(user_email) = private.ka_email() OR private.ka_can_review(course_id,user_email));
CREATE POLICY progress_insert ON public.user_progress FOR INSERT TO authenticated
  WITH CHECK (lower(user_email) = private.ka_email() OR private.ka_can_review(course_id,user_email));
CREATE POLICY progress_update ON public.user_progress FOR UPDATE TO authenticated
  USING (lower(user_email) = private.ka_email() OR private.ka_can_review(course_id,user_email))
  WITH CHECK (lower(user_email) = private.ka_email() OR private.ka_can_review(course_id,user_email));
CREATE POLICY progress_delete ON public.user_progress FOR DELETE TO authenticated
  USING (private.ka_can_review(course_id,user_email));

-- Course scoring remains a separate phase. Block employee approval/assignment changes now.
CREATE OR REPLACE FUNCTION private.ka_guard_progress() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF; -- trusted SQL Editor/service maintenance
  IF private.ka_can_review(NEW.course_id,NEW.user_email) THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.practical_status <> 'none' OR NEW.due_date IS NOT NULL OR NEW.assigned_by IS NOT NULL THEN
      RAISE EXCEPTION 'Only an authorized reviewer can set approval or assignment fields.' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NEW.user_email IS DISTINCT FROM OLD.user_email OR NEW.course_id IS DISTINCT FROM OLD.course_id
      OR NEW.practical_status IS DISTINCT FROM OLD.practical_status
      OR NEW.due_date IS DISTINCT FROM OLD.due_date OR NEW.assigned_by IS DISTINCT FROM OLD.assigned_by THEN
      RAISE EXCEPTION 'Only an authorized reviewer can change approval or assignment fields.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.ka_guard_progress() FROM PUBLIC;
DROP TRIGGER IF EXISTS ka_guard_progress ON public.user_progress;
CREATE TRIGGER ka_guard_progress BEFORE INSERT OR UPDATE ON public.user_progress FOR EACH ROW EXECUTE FUNCTION private.ka_guard_progress();

GRANT SELECT,INSERT,UPDATE,DELETE ON public.course_assignments TO authenticated;
CREATE POLICY assignments_read ON public.course_assignments FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR private.ka_can_manage_course(course_id)
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = course_assignments.user_id AND private.ka_manages_learner(p.email))
);
CREATE POLICY assignments_write ON public.course_assignments FOR ALL TO authenticated
  USING (private.ka_can_manage_course(course_id) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = course_assignments.user_id AND private.ka_manages_learner(p.email)))
  WITH CHECK (private.ka_can_manage_course(course_id) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = course_assignments.user_id AND private.ka_manages_learner(p.email)));

GRANT SELECT,INSERT,UPDATE ON public.practical_submissions TO authenticated;
CREATE POLICY practicals_read ON public.practical_submissions FOR SELECT TO authenticated
  USING (lower(user_email) = private.ka_email() OR private.ka_can_review(course_id,user_email));
CREATE POLICY practicals_insert ON public.practical_submissions FOR INSERT TO authenticated
  WITH CHECK (lower(user_email) = private.ka_email() AND status = 'pending');
CREATE POLICY practicals_update ON public.practical_submissions FOR UPDATE TO authenticated
  USING (private.ka_can_review(course_id,user_email)) WITH CHECK (private.ka_can_review(course_id,user_email));

GRANT SELECT,INSERT,UPDATE,DELETE ON public.notifications TO authenticated;
CREATE POLICY notifications_read ON public.notifications FOR SELECT TO authenticated
  USING (lower(user_email) = private.ka_email() OR private.ka_role() = 'admin');
CREATE POLICY notifications_insert ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (private.ka_can_review(course_id,user_email));
CREATE POLICY notifications_update ON public.notifications FOR UPDATE TO authenticated
  USING (lower(user_email) = private.ka_email() OR private.ka_role() = 'admin')
  WITH CHECK (lower(user_email) = private.ka_email() OR private.ka_role() = 'admin');
CREATE POLICY notifications_delete ON public.notifications FOR DELETE TO authenticated
  USING (lower(user_email) = private.ka_email() OR private.ka_role() = 'admin');

GRANT SELECT,INSERT,UPDATE,DELETE ON public.posts TO authenticated;
CREATE POLICY posts_read ON public.posts FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY posts_insert ON public.posts FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY posts_update ON public.posts FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR private.ka_role() = 'admin') WITH CHECK (user_id = auth.uid() OR private.ka_role() = 'admin');
CREATE POLICY posts_delete ON public.posts FOR DELETE TO authenticated USING (user_id = auth.uid() OR private.ka_role() = 'admin');

GRANT SELECT ON public.role_change_audit TO authenticated;
CREATE POLICY role_audit_read ON public.role_change_audit FOR SELECT TO authenticated USING (private.ka_role() = 'admin');

-- Optional legacy document table follows the corresponding course's ownership.
DO $$ BEGIN
  IF to_regclass('public.documents') IS NOT NULL THEN
    GRANT SELECT,INSERT,UPDATE,DELETE ON public.documents TO authenticated;
    CREATE POLICY documents_read ON public.documents FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
    CREATE POLICY documents_write ON public.documents FOR ALL TO authenticated USING (private.ka_can_manage_course(id)) WITH CHECK (private.ka_can_manage_course(id));
  END IF;
END; $$;

-- Existing public resource URLs remain public. Restrict bucket mutations even if
-- another storage policy would otherwise allow writes. Private delivery is a later phase.
DROP POLICY IF EXISTS "Auth Upload" ON storage.objects;
DROP POLICY IF EXISTS "Auth Delete" ON storage.objects;
DROP POLICY IF EXISTS ka_resource_write ON storage.objects;
CREATE POLICY ka_resource_write ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'course-documents' AND (private.ka_role() = 'admin' OR (private.ka_role() = 'trainer' AND owner_id = auth.uid()::text)))
  WITH CHECK (bucket_id = 'course-documents' AND private.ka_role() IN ('admin','trainer') AND (private.ka_role() = 'admin' OR owner_id = auth.uid()::text));
DROP POLICY IF EXISTS ka_resource_insert_guard ON storage.objects;
CREATE POLICY ka_resource_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bucket_id <> 'course-documents' OR (private.ka_role() IN ('admin','trainer') AND (private.ka_role() = 'admin' OR owner_id = auth.uid()::text)));
DROP POLICY IF EXISTS ka_resource_update_guard ON storage.objects;
CREATE POLICY ka_resource_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (bucket_id <> 'course-documents' OR private.ka_role() = 'admin' OR (private.ka_role() = 'trainer' AND owner_id = auth.uid()::text))
  WITH CHECK (bucket_id <> 'course-documents' OR private.ka_role() = 'admin' OR (private.ka_role() = 'trainer' AND owner_id = auth.uid()::text));
DROP POLICY IF EXISTS ka_resource_delete_guard ON storage.objects;
CREATE POLICY ka_resource_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
  USING (bucket_id <> 'course-documents' OR private.ka_role() = 'admin' OR (private.ka_role() = 'trainer' AND owner_id = auth.uid()::text));
DROP POLICY IF EXISTS ka_resource_anon_insert_guard ON storage.objects;
CREATE POLICY ka_resource_anon_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO anon WITH CHECK (bucket_id <> 'course-documents');
DROP POLICY IF EXISTS ka_resource_anon_update_guard ON storage.objects;
CREATE POLICY ka_resource_anon_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon USING (bucket_id <> 'course-documents') WITH CHECK (bucket_id <> 'course-documents');
DROP POLICY IF EXISTS ka_resource_anon_delete_guard ON storage.objects;
CREATE POLICY ka_resource_anon_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO anon USING (bucket_id <> 'course-documents');

COMMIT;
