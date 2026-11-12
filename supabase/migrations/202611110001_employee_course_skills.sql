-- Apply after the skills dashboard migration (202610260001).
-- Preserve existing skill IDs, descriptions, archive status, and course links.
BEGIN;

INSERT INTO public.skills (name)
SELECT seed.name
FROM (VALUES
  ('Basic computer literacy'),
  ('Basic knowledge of Microsoft Office (Word, Excel, Outlook)'),
  ('Basic knowledge of Google Workspace (Google Drive, Docs, Sheets)'),
  ('Basic data entry skills'),
  ('Basic file and document management'),
  ('Good written and verbal English communication'),
  ('Basic email writing and correspondence'),
  ('Good organizational skills'),
  ('Time management and ability to prioritize tasks'),
  ('Attention to detail and accuracy'),
  ('Ability to follow instructions and procedures'),
  ('Basic problem-solving skills'),
  ('Customer service orientation'),
  ('Professionalism and workplace etiquette'),
  ('Confidentiality and data privacy awareness')
) AS seed(name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.skills existing
  WHERE lower(btrim(existing.name)) = lower(seed.name)
)
ON CONFLICT DO NOTHING;

COMMIT;
