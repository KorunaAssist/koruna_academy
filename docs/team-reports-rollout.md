# Team Reports

This change implements Team Reports only. Career Path remains unchanged.

## Database installation

With the existing authorization, learning-path (including trigger repair), and
skills migrations installed, run the **entire**
`supabase/migrations/202611020001_team_reports.sql` in the same Supabase project
used by the app. Do not rerun the base schema or old migrations. The new migration
is transactional, safe to repeat and refreshes the API schema cache itself.

Then apply `supabase/migrations/202611020002_team_leader_members.sql` to enable
team leaders to select their own members. If the first report migration is already
installed, apply only this follow-up. It replaces the checked membership function
and adds a basic selection directory. It does not remove memberships or progress.

It adds checked reporting/action functions, a roadmap reference on notifications,
and feedback/reviewer/time fields on practical submissions. It does not delete
courses, employee learning progress or roadmaps. Direct access to existing progress
tables is not widened. It replaces the progress guard only to permit an employee
to set pending status when backed by their own real pending practical submission;
approval, identity and assignment fields remain protected.

## Where to open it

- Admin/Trainer Suite sidebar → Team Reports.
- Academy sidebar → Team Reports for admins, trainers and team leaders.
- Admins configure team membership in Team Reports → Manage Teams. A manager
  must already have the team_leader role, and members must have the employee role.
- Admin Suite also has a direct **Manage Teams** sidebar entry.
- Team leaders have a **Team Leader View** choice in the header view switcher.
  It opens Team Reports, not Admin Suite. Fresh logins from Home or an unavailable
  saved page default to that reporting workspace. The Employee View option still
  opens their personal learning pages. Team leaders can now open **Manage My Team**
  to add/remove employees on their own team. Admins retain control of all teams.
  Adding an employee preserves their memberships in other teams.

## Scope and calculations

- Admin Team Overview groups employees under their actual team leader. All Teams
  includes leaders with no members, but excludes unassigned employees and admin
  accounts from the member lists. Select one leader to show only that team.
  Member names expand to reveal their course/roadmap/skill detail and actions.
  Admins can still select any employee in Assign Training and Manage Teams.
- Team leaders see only explicitly assigned team members.
- For member selection, team leaders can read employees' basic name/email/department
  directory, not unselected employees' learning progress. Training assignment
  recipients remain restricted to their current team. Trainers cannot manage teams.
- Trainers see employees learning their own courses or enrolled in their own
  roadmaps. Course and roadmap details are restricted to this managed training.
  The basic employee directory remains available for assigning new learners.
- Skill percentages use the same global lesson curriculum and shared completion
  rules as the employee Skills Dashboard. Trainers see only skills taught in
  training they manage; global skill progress is an aggregate, not proficiency.
- Average progress is the mean of the visible employees' course percentages.
  Each course counts once using its highest recorded progress across application
  records, consistent with existing roadmap/skill shared-credit rules. Courses
  introduced by roadmap enrolment count as 0 until started. An employee with no
  course records does not add a fictitious 0% course to that average.
- Overdue assignments count incomplete course and assigned-roadmap deadlines.
  These are distinct assignments; the count is not a count of employees.
  Completed training is not overdue. Date-only deadlines are inclusive in
  Asia/Singapore. Invalid legacy dates are omitted instead of crashing the report.
- Filters select employees by name/email, department, team, roadmap and overall
  learning status. Summary cards and practical listings follow the selected set.
  A selected employee's full authorised training remains visible for context.
- Team Overview summary counts use the unique displayed employees, so an employee
  in two teams is listed in both groups but counted once in overall statistics.
- Pending reviews count real pending practical submissions for the visible set.
- Report updates are explicit (Refresh Report) and after successful actions;
  the page does not blank/reload on the global five-second course poll.

## Actions

- Assign Training accepts a course or published roadmap and an optional deadline.
  Courses default to seven days. Roadmap deadlines are optional. Team leaders can
  assign any published roadmap to their own team, trainers only their own roadmaps.
  Course assignments follow existing owner/team permissions.
- Assignment preserves existing course progress. Existing roadmap enrolments stay
  on their pinned version. New roadmap enrolments use the latest published version.
- Unassigning a course removes assignment/deadline fields while keeping progress.
  Unassigning a roadmap changes it to self-enrolled, preserving version and progress.
- Remind saves a real in-platform notification and its timestamp. Sending the same
  target another reminder within one minute is rejected. No email/Slack is sent.
- Practical reviewers can approve or request changes. Changes require feedback;
  decisions update the submission and learner practical status in one transaction,
  record the reviewer/time and create an employee notification. Reviewed decisions
  cannot be edited through this workflow. Historical submissions remain visible.
- The employee practical form shows real feedback and allows revisions. Submission
  and pending progress status are saved atomically; failures are shown rather than
  silently reported as success. Approval cannot be set by the learner.

## Manual test checklist

1. Apply the new migration, refresh, and open Team Reports as an admin. Summary
   values must reflect actual training data, not the former 56.2% / 2 employees.
2. Under Manage Teams, add Employee A to Team Leader A. Sign in as that leader:
   Employee A should appear; unassigned Employee B should not.
3. Assign A a course with a deadline and a published roadmap. Confirm both on A's
   employee screens. Complete a lesson/course, refresh the report and confirm
   course, roadmap and skill learning percentages reflect the actual progress.
4. Try employee/department/team/roadmap/status filters. A learner with one complete
   course and another at 0% must be In Progress, not Completed or Not Started.
5. Assign an incomplete course with a past deadline. It must be overdue; finish
   it and refresh to confirm the overdue count drops.
6. Send a reminder. A must receive a notification; B must not. Reload the report
   and confirm the last-sent timestamp persists. Immediate duplicate reminders
   should be blocked.
7. Submit practical work from an existing course that requires an assessment.
   Request changes with feedback, then sign in as A and revise/resubmit. Approve
   the revision and check the employee status, notification and reviewer history.
   Custom assessment authoring is not part of this change.
8. Unassign the course and roadmap. A's learning progress must remain intact.
9. Publish a new roadmap version, reassign an existing learner and confirm their
   pinned version is preserved. A newly assigned learner receives the new version.
10. Sign in as a trainer: only managed training is reported, and unrelated
    course/roadmap assignments and reviews must be rejected by the database.
11. Remove A's team membership and refresh as their former leader: the learner
    must disappear. Regular employees must not have Team Reports access.
12. As a team leader, open Manage My Team and select an employee. Their learning
    becomes visible after adding them. Remove them to revoke access. The leader
    must not be able to add/remove members on another leader's team. Employees may
    belong to multiple teams, and adding to one team must not remove another.

Automated validation: `npm.cmd test` and `npm.cmd run build` on Windows. Tests
execute all relevant migrations in PostgreSQL/PGlite with separate identities,
including unauthorized requests, real notifications, deadlines, practical revision
cycles, version pinning, unassignment preservation and repeated migration runs.
