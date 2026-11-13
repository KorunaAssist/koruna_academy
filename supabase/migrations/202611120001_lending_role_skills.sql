-- Add lending roles and skills without replacing existing catalogue entries or links.
-- A single statement keeps the seed available even when a SQL editor executes
-- statements separately. Rerunning this block safely fills any missing links.
DO $lending_seed$
DECLARE
  entry record;
BEGIN
FOR entry IN
SELECT seed.role_name, unnest(seed.skill_names) AS skill_name
FROM (VALUES
  ('Basic Loan Processing', ARRAY[
    'Basic mortgage broking knowledge',
    'Understanding of loan application processes',
    'PAYG income documentation knowledge',
    'Client onboarding and document collection',
    'Loan application data entry',
    'Apply Online navigation',
    'CRM and aggregator system knowledge',
    'Document verification and checklist management',
    'Basic lender communication',
    'Client follow-up and coordination',
    'Understanding of loan terminology',
    'Basic valuation and settlement process knowledge',
    'Task prioritization and application tracking',
    'Accuracy in loan documentation'
  ]),
  ('Advanced Loan Processing', ARRAY[
    'Advanced mortgage processing knowledge',
    'Purchase and refinance loan processing',
    'Self-employed income documentation knowledge',
    'Bridging loan application knowledge',
    'Advanced Apply Online skills',
    'Loan submission and packaging',
    'Lender policy awareness',
    'Document analysis and discrepancy resolution',
    'MIR management',
    'Lender and solicitor coordination',
    'Valuation and settlement coordination',
    'Insurance underwriting coordination',
    'Application pipeline management',
    'Aftercare and loan review management',
    'Advanced CRM and aggregator system knowledge',
    'Independent problem-solving and decision-making'
  ]),
  ('Financial Assessment & Credit Analysis', ARRAY[
    'Financial analysis and assessment',
    'PAYG income assessment',
    'Self-employed income assessment',
    'Tax return and financial statement analysis',
    'Bank statement analysis',
    'Living expense assessment',
    'Liability and debt analysis',
    'Borrowing capacity assessment',
    'Loan servicing calculations',
    'LVR and equity assessment',
    'Credit risk identification',
    'Lender credit policy knowledge',
    'Financial discrepancy identification',
    'Product and interest rate comparison',
    'Pricing analysis',
    'Analytical and critical thinking',
    'Financial reporting and presentation',
    'Advanced Excel and servicing tools'
  ]),
  ('Advanced Loan Structuring & Technical Lending', ARRAY[
    'Advanced mortgage lending knowledge',
    'Complex loan structuring',
    'Advanced servicing and borrowing capacity analysis',
    'SMSF lending knowledge',
    'Complex self-employed lending knowledge',
    'Advanced lender credit policy interpretation',
    'Lender selection and product research',
    'Complex income assessment',
    'Advanced financial analysis',
    'Credit scenario assessment',
    'Loan strategy development',
    'Complex application preparation',
    'Advanced loan submission and packaging',
    'Credit submission writing',
    'Policy exception and credit issue identification',
    'Advanced product and pricing comparison',
    'Technical broker support',
    'Strong analytical and problem-solving skills'
  ])
) AS seed(role_name, skill_names)
LOOP

INSERT INTO public.skills (name)
SELECT entry.skill_name
WHERE NOT EXISTS (
  SELECT 1 FROM public.skills existing
  WHERE lower(btrim(existing.name)) = lower(entry.skill_name)
)
ON CONFLICT DO NOTHING;

INSERT INTO public.skill_roles (name)
VALUES (entry.role_name)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_skills (role_id, skill_id)
SELECT roles.id, skills.id
FROM public.skill_roles roles
CROSS JOIN public.skills skills
WHERE lower(btrim(roles.name)) = lower(entry.role_name)
AND lower(btrim(skills.name)) = lower(entry.skill_name)
ON CONFLICT DO NOTHING;
END LOOP;
END;
$lending_seed$;

NOTIFY pgrst, 'reload schema';
