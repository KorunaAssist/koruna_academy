# Skills catalogue and learning progress

## Apply the database change

Run the **entire** `supabase/migrations/202610260001_skills_dashboard.sql` file in
the Supabase SQL Editor for the project used by the app. Apply it after the
existing authorization migration; keep the installed learning-path migrations.
Do not rerun the base schema or older migrations.

This migration is transactional and safe to repeat. It creates `skills`, adds
`courses.skill_ids`, installs course-link validation, and creates the
`skill_lesson_requirements` and `skill_progress` views. It refreshes the API schema
cache itself. It does not delete courses, lesson progress, or learning paths.
The DROP statements replace only this feature's policies and trigger definition.

The editor saves skill links in the same course write as lesson content. This
avoids a course being saved with only some of its skill links. Existing lesson IDs
are preserved, and new lessons receive stable IDs when saved.

## Workflow

### Skills by job role

After the employee skills seed, apply
`supabase/migrations/202611110002_role_skills.sql`. This creates admin-managed
job roles and assigns the 15 seeded workplace skills to **Loan Processor**.
Job roles here are separate from account permissions such as admin or trainer.

Open **Admin Suite → Skills by Role** to add a role, select existing skills, or
create a new skill and select it. Click **Save Role Skills** to save the role's
selections. A skill may be shared by multiple roles. In course creation, use
**Filter skills by role** to find the relevant skills; changing filters preserves
selected course skills. Role membership does not automatically award skills:
employees still earn progress through the linked course lessons.

Apply `supabase/migrations/202611110001_employee_course_skills.sql` to an existing
skills-enabled database to add the 15 employee workplace skills to the course
editor's **Skills taught by this course** selections. The seed is safe to repeat
and preserves existing matching skills, including their archive status. Restore
an archived skill in Skills Catalogue if it should be selectable on new courses.
The prerequisite `202610260001_skills_dashboard.sql` is referenced by this guide
but is currently missing from this checkout; it must already be installed in the
target database before applying this seed.

1. As an admin, open **Admin Suite → Skills Catalogue → Create Skill**. Add a
   name such as Servicing or Loan Processing and an optional description.
2. As an admin or the owning trainer, create/edit a course. In **Info → Skills
   taught by this course**, select one or more skills. All its lessons contribute
   to each selected skill by default.
3. In **Lessons**, expand a lesson and select **Skills this lesson contributes
   to**. Uncheck skills that lesson does not teach. A lesson with no checked skills
   does not contribute to any skill. Each selected course skill must have at least
   one linked lesson before saving. New lessons inherit the course selections.
4. Save/publish the course. Link other courses if those also teach the same skill.
5. As an employee, open **Skills Dashboard**. Each skill lists the required lesson
   count, completed count, learning percentage, required training and course links.
6. Complete a linked lesson, then return to the Skills Dashboard. Its contribution
   appears automatically. Course completion also credits the linked lessons in
   that course; it never adds a second course-completion bonus.

## Progress rules

- Required lessons are all current lessons linked to that skill across all
  courses, regardless of whether the learner has enrolled yet. There is no assumed
  fixed 5% award. One lesson out of 20 required lessons gives 5%.
- Every required lesson has equal weight. An explicitly unlinked lesson has no
  effect on skill progress. A lesson may contribute to multiple skills.
- Requirements are unique by skill, course and lesson ID. Repeated application
  records, roadmap reuse, and lesson completion plus course completion count once.
- Existing completed lessons and completed courses count immediately when linked
  to a skill. Reordering lessons retains their identity and credit.
- Statuses: **Not configured** (no linked lessons), **Not Started**, **Learning**
  (activity in linked training), and **Completed** (all linked training complete).
- Percentages are calculated from existing progress, not separately saved scores.
  They measure training completion. This version does not implement practical
  verification, assessment authoring or a professional proficiency score.
- The curriculum is current, not versioned: adding/removing required lessons can
  change the denominator and percentages. Reordering alone does not change them.
  Future curriculum snapshots would be a separate feature.

## Permissions and archiving

Only admins create, rename, describe, archive and restore skills. Trainers can
select skills on courses they own; admins can select them on all courses. Employee
skill percentages can only reflect that signed-in employee's progress. Catalogue
and requirements are visible to authenticated users, not anonymous users.

Archive a skill instead of deleting it. Existing course links and progress remain;
archived skills cannot be newly selected on another course. Learners can enable
**Include archived skills** to view them. Existing linked courses can retain or
remove their archived skill selections.

## Validation

Run `npm.cmd test` and `npm.cmd run build` on Windows. The database tests exercise
real PostgreSQL RLS, atomic validation and percentage calculations using both
native JSON and the legacy JSON-encoded strings sent by the course/progress mapper.

For a manual check, create a skill with 20 required linked lessons. Complete one
lesson as an employee and confirm 1/20 and 5%. Link that lesson to a second skill
with the same 20 requirements and confirm both update. Repeat an enrolment or
complete the course and confirm no duplicate credit. Sign in as another employee
and confirm their progress remains separate.
