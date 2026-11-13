-- Replace active catalogue entries; retain existing IDs, links and progress.
WITH course_creation_skills (name) AS (
  VALUES
  ('Supporting Document Collection and Verification'),
  ('Client File Management and Organization (Google Drive)'),
  ('Document Preparation, Compilation, and Packaging'),
  ('Client Information Gathering and Follow-Up'),
  ('Loan Servicing and Client Support'),
  ('Financial Product Comparison and Analysis'),
  ('Loan Pricing and Rate Request Management'),
  ('Property Valuation Ordering and Coordination'),
  ('CRM Data Entry and Prospect Database Management'),
  ('PAYG Loan Application Processing'),
  ('Self-Employed Loan Application Processing'),
  ('Purchase Loan Application Processing'),
  ('Refinance Loan Application Processing'),
  ('Bridging Loan Application Processing'),
  ('SMSF Loan Application Processing'),
  ('Apply Online Data Entry and Document Upload'),
  ('Online Loan Application Submission'),
  ('Client Database Management and Maintenance'),
  ('Supporting Document Upload and Management'),
  ('Client Meeting Preparation and Documentation'),
  ('Insurance Premium Estimation and Quotation Preparation'),
  ('Lender Liaison and Application Follow-Up'),
  ('Client Communication and Missing Information Follow-Up (MIR)'),
  ('Portfolio Reporting and Product Comparison Preparation'),
  ('Loan and Banking Form Preparation (FHOG, Discharge, Cashback Forms, etc.)'),
  ('Loan Application and Insurance Underwriting Follow-Up'),
  ('Settlement Sheet Preparation and Documentation'),
  ('Client Aftercare and Post-Settlement Servicing'),
  ('General Administrative Support and Task Coordination'),
  ('Ongoing Client Relationship Management and Communication'),
  ('Time Management, Calendar Management, and Scheduling'),
  ('Social Media Account Management (Facebook, Instagram, LinkedIn)'),
  ('Project Management and Task Coordination (Trello, Asana, Monday.com)'),
  ('Workflow Development and Process Mapping (Lucidchart, PowerPoint)'),
  ('Marketing Content Development and Design (ActivePipe, Canva)'),
  ('Appointment Scheduling and Coordination (Calendly)'),
  ('AI Tools Utilization and Application (ChatGPT, Google Bard, Microsoft Copilot)'),
  ('Mortgage Aggregator and CRM System Management (Connective/Mercury, AFG/Flex)'),
  ('Mortgage Software and Financial Platform Proficiency (BrokerEngine, Quickli, IDYou, Equifax)'),
  ('Property Valuation Status Monitoring and Valuer Coordination'),
  ('Loan Review and Client Portfolio Assessment'),
  ('Settlement Coordination and Bank Liaison'),
  ('Solicitor Liaison and Finance Due Date Management'),
  ('Client Living Expense Assessment and Financial Analysis'),
  ('Financial Document Review, Accuracy Checking, and Discrepancy Resolution (Payslips, Tax Returns, Bank Statements)')
), updated_skills AS (
UPDATE public.skills existing
SET archived = NOT EXISTS (
  SELECT 1 FROM course_creation_skills seed
  WHERE lower(btrim(existing.name)) = lower(seed.name)
)
RETURNING existing.id
)
INSERT INTO public.skills (name)
SELECT seed.name FROM course_creation_skills seed
WHERE NOT EXISTS (
  SELECT 1 FROM public.skills existing
  WHERE lower(btrim(existing.name)) = lower(seed.name)
)
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
