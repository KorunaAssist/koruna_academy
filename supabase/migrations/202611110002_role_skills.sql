-- Requires the skills dashboard and 202611110001_employee_course_skills.
BEGIN;
CREATE TABLE public.skill_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120)
);
CREATE UNIQUE INDEX skill_roles_name_unique ON public.skill_roles (lower(btrim(name)));
CREATE TABLE public.role_skills (
  role_id uuid NOT NULL REFERENCES public.skill_roles(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, skill_id)
);
ALTER TABLE public.skill_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_skills ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.skill_roles, public.role_skills TO authenticated;
CREATE POLICY skill_roles_read ON public.skill_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY skill_roles_admin ON public.skill_roles FOR ALL TO authenticated
  USING (private.ka_role() = 'admin') WITH CHECK (private.ka_role() = 'admin');
CREATE POLICY role_skills_read ON public.role_skills FOR SELECT TO authenticated USING (true);
CREATE POLICY role_skills_admin ON public.role_skills FOR ALL TO authenticated
  USING (private.ka_role() = 'admin') WITH CHECK (private.ka_role() = 'admin');

CREATE FUNCTION public.save_skill_role(p_id uuid, p_name text, p_skill_ids uuid[])
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE saved_id uuid;
BEGIN
  IF auth.uid() IS NULL OR private.ka_role() <> 'admin' THEN
    RAISE EXCEPTION 'Administrator access is required.' USING ERRCODE = '42501';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.skill_roles(name) VALUES (btrim(p_name)) RETURNING id INTO saved_id;
  ELSE
    UPDATE public.skill_roles SET name = btrim(p_name) WHERE id = p_id RETURNING id INTO saved_id;
    IF saved_id IS NULL THEN RAISE EXCEPTION 'Role no longer exists.'; END IF;
  END IF;
  DELETE FROM public.role_skills WHERE role_id = saved_id;
  INSERT INTO public.role_skills(role_id, skill_id)
    SELECT saved_id, skill_id FROM unnest(p_skill_ids) AS skill_id GROUP BY skill_id;
  RETURN saved_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_skill_role(uuid, text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_skill_role(uuid, text, uuid[]) TO authenticated;

INSERT INTO public.skill_roles(name) VALUES ('Loan Processor');
INSERT INTO public.role_skills(role_id, skill_id)
SELECT r.id, s.id FROM public.skill_roles r CROSS JOIN public.skills s
WHERE r.name = 'Loan Processor' AND lower(btrim(s.name)) IN (
 'basic computer literacy',
 'basic knowledge of microsoft office (word, excel, outlook)',
 'basic knowledge of google workspace (google drive, docs, sheets)',
 'basic data entry skills', 'basic file and document management',
 'good written and verbal english communication', 'basic email writing and correspondence',
 'good organizational skills', 'time management and ability to prioritize tasks',
 'attention to detail and accuracy', 'ability to follow instructions and procedures',
 'basic problem-solving skills', 'customer service orientation',
 'professionalism and workplace etiquette', 'confidentiality and data privacy awareness'
);
NOTIFY pgrst, 'reload schema';
COMMIT;
