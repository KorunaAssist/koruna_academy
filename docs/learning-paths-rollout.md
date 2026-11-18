# Learning path database foundation

The migrations add saved roadmaps to the existing course/progress model. The
Admin/Trainer Suite now has a Learning Paths builder, and the employee Learning
Path tab shows published roadmaps and the learner's own enrolments. Local changes
do not deploy migrations to hosted Supabase automatically.

## Deployment

For a new database, apply `supabase_schema.sql`, then
`supabase/migrations/202610150001_authorization.sql`, then
`supabase/migrations/202610210001_learning_paths.sql`, followed by
`supabase/migrations/202610210002_learning_path_builder.sql`, then
`supabase/migrations/202610210003_repair_learning_progress_triggers.sql`.

For an existing database with authorization already installed, apply only the new
learning-path migrations through the project's migration pipeline or Supabase SQL
Editor. It is a one-time transactional migration. Do not reapply the base schema
or the old authorization migration afterward: the latter replaces policies on
existing tables, including the new path-manager progress-reading policy.

If `202610210001` is already installed, apply `202610210002` followed by `202610210003`. This second
migration adds the atomic draft-save RPC and prerequisite study/progress guards.

If both earlier learning-path migrations are installed and a course start fails
with `record "new" has no field "last_viewed_at"` (or a misspelling of that field),
apply only `202610210003_repair_learning_progress_triggers.sql`. It ensures the
column exists and reinstalls both progress trigger functions and their bindings
on `public.user_progress`. It does not delete learning rows. If this repair does
not resolve the live error, inspect the deployed trigger definitions rather than
reapplying the old migrations:

```sql
SELECT c.oid::regclass AS relation, t.tgname,
       pg_get_triggerdef(t.oid) AS trigger_definition,
       pg_get_functiondef(t.tgfoid) AS function_definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
WHERE NOT t.tgisinternal
  AND c.oid = 'public.user_progress'::regclass;
```

Validate locally with `npm.cmd test` on Windows (or `npm test`). The learning-path
tests execute the base schema and all migrations in PGlite, exercising PostgreSQL constraints, triggers, grants,
RPCs and RLS with separate admin, trainer and employee identities.

## Data and permissions

- `learning_paths`: name, description and owner. Trainers manage their own paths;
  admins oversee all paths. Ownership is not editable through the client API.
- `learning_path_versions`: numbered drafts with their own name/description and
  Draft → Published → Archived lifecycle. Published metadata and sequences are
  immutable. An empty or optional-only version cannot be published.
- `learning_path_courses`: courses, sequence and required/optional flags for each
  version. Course deletion is restricted while a roadmap references it.
- `course_prerequisites`: course-level dependencies, editable by the course owner
  or admin. Self-dependencies and transitive cycles are rejected. The application
  uses these rows to show locks and enforce prerequisites when starting study.
  The second migration also rejects new study/progress writes to locked courses.
  They are global course rules, not snapshots within individual path versions.
- `learning_path_enrolments`: one enrolment per path/user, pinned to a version,
  with self/automatic/assigned source, assigning staff member and optional deadline.
  Clients cannot directly mutate enrolments; the checked RPC handles assignments.
- `learning_path_progress`: security-invoker view of equal-weight progress across
  required courses. Optional courses do not affect the denominator. Existing
  course progress counts across paths; the maximum percentage across application
  records is used. Percentages stay below 100 until all required courses reach 100.

Employees see published paths and their own archived enrolment versions. Trainers
see their own drafts, enrolments and enrolled learners' course progress for those
paths. Path ownership grants read-only oversight of progress, not permission to
edit someone else's course or approve their practical assessments. Existing course
owner/reviewer rules remain authoritative. Anonymous users have no path access.

## Integration examples

Create a path, then insert its first draft version and course rows using the
authenticated Supabase client. Version numbers must be unique within a path.
Reorder draft course positions in one transaction (the position constraint is
deferred). Publish with a version status update to `published`.

```ts
// Employee self-enrolment; omitting user ID defaults to the signed-in user.
await supabase.rpc('enrol_learning_path', { p_path_id: pathId });

// Owner trainer/admin assignment. Existing enrolments keep their pinned version.
await supabase.rpc('enrol_learning_path', {
  p_path_id: pathId,
  p_user_id: learnerId,
  p_due_at: '2026-12-01T00:00:00Z',
});

// Clone a version into a new editable draft. Publish when ready.
const { data: nextVersionId } = await supabase.rpc('clone_learning_path_version', {
  p_version_id: versionId,
});

const { data: progress } = await supabase.from('learning_path_progress').select('*');
```

Multiple published versions can coexist. New enrolments use the greatest published
version number; old enrolments never move automatically. Archive old versions
explicitly. Archived versions remain accessible to their enrolled learners.
Re-enrolment by a learner cannot clear an assignment or its deadline.

The existing course-start flow sets `user_progress.last_viewed_at`. A database
trigger then enrols the learner into every matching path whose latest published
version contains that course. Repeated updates are idempotent and do not overwrite
staff assignments. Assignment records without a start timestamp do not trigger
automatic enrolment. Existing historical progress is not backfilled at deployment;
it contributes immediately on explicit enrolment or the next course start.

## Application workflow and manual checks

1. Sign in as an admin or trainer. Open Suite → Learning Paths → Create Roadmap.
2. Enter a name and description. Add existing courses; use up/down arrows to
   arrange the sequence. Mark courses required/optional as needed.
3. Expand a course's prerequisites and select requirements. Admins can edit any
   course's prerequisites; trainers can edit prerequisites of their own courses.
   These are global rules; the editor explains that they apply in every roadmap.
4. Save Draft, leave the screen, and reopen it to confirm the sequence persists.
   Employees must not see the draft. Circular prerequisite edits must fail without
   partially changing the draft or prerequisite graph.
5. Publish. As an unassigned employee, open Learning Path → Explore Roadmaps.
   The roadmap must be visible, including its complete course sequence.
6. Join the path, or start an unlocked course from its sequence or the catalogue.
   The roadmap appears in My Learning Paths. Starting alone shows 0%; actual
   learning increases the percentage. Existing course progress counts immediately.
7. Try starting a locked course from the roadmap and from the catalogue. Both
   must require prerequisite completion; after completing the prerequisite, retry.
8. From the manager, assign a published path to employees, optionally with a
   deadline. Verify their assigned cards/deadlines and manager learner progress.
9. Create New Version, edit and publish it. Existing learners retain their old
   version/order; new learners get the latest published version. Archive an old
   version; its learners retain access.

Courses remain browsable to all authenticated users regardless of assignment;
prerequisites gate starting study. The builder loads courses from the platform
catalogue, including courses owned by other trainers, without granting edit rights
to those courses. A trainer only manages their own roadmaps; admins manage all.

Versioning here protects roadmap metadata, course order and enrolment references;
it does not snapshot course lesson content or assessments. The course editor now
retains existing lesson IDs during edits/reorders and gives new lessons unique IDs.
Course-content versioning is separate from roadmap versioning; deleting a lesson
still removes it from current course content.

Progress uses the existing `user_progress.progress_percent` authority. This change
does not introduce new assessment scoring or trainer sign-off completion rules.
