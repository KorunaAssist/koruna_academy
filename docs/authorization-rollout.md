# Authorization and role assignment rollout

This change prepares frontend guards and database enforcement. It does not modify
your hosted Supabase project. Deploy the database migration to staging before the
updated frontend, and verify the same behavior there before production.

## Access model

| Action | Employee | Trainer | Team leader | Admin |
| --- | --- | --- | --- | --- |
| Learning screens | Yes | Yes | Yes | Yes |
| Administration screens | No | Course tools only | No | Yes |
| Create/edit/delete courses | No | Owned courses | No | All |
| Assign/review training | No | Owned courses | Explicit team members | All |
| User directory | Own profile | Employee roster and own profile | Own profile and team | All |
| Change roles | No | No | No | Checked RPC |
| Change team membership | No | No | No | SQL/database administration |

New signup and OAuth accounts become employees. User-editable metadata and browser
permission overrides no longer grant privileges. The permissions screen is a
read-only display of the fixed access rules; it is not an editable local matrix.
Real sessions derive roles from `profiles.role`; a failed profile lookup does not
fall back to metadata or cached staff permissions. Development demo identities
remain available only when Supabase is unconfigured and Vite is in development mode.

## Existing project: apply in staging first

1. Back up the database and review existing policies/column grants. The migration
   replaces **all policies** for the application's profiles, courses, progress,
   submissions, notifications, posts, assignments, teams and role-audit tables,
   plus the optional legacy documents table. Review any project-specific custom
   policies before replacing them. It does not delete learning data.
2. Review every existing trainer, team leader and admin account against a trusted
   staff list. The old signup allowed self-selected roles; retaining a role is not
   proof that the account should have it. This migration preserves existing roles
   and does not silently select or promote an administrator.
3. Ensure at least one trusted administrator exists. In the privileged SQL Editor,
   inspect identities with:

   ```sql
   SELECT u.id, u.email, p.role
   FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id;
   ```

   If necessary, bootstrap **one explicitly verified account**:

   ```sql
   UPDATE public.profiles SET role = 'admin'
   WHERE id = 'REPLACE_WITH_VERIFIED_AUTH_USER_UUID'::uuid;
   ```

   Review/demote unjustified staff roles through trusted database administration
   before opening access. Never bootstrap by email substring or user metadata.
4. Run `supabase/migrations/202610150001_authorization.sql` in the SQL Editor or
   through your existing migration pipeline. **Do not rerun `supabase_schema.sql`
   on an existing project.** That file is only the fresh-install base schema.
5. The migration adds `courses.created_by`. Existing unowned courses remain admin
   managed. Assign ownership explicitly after verifying the trainer:

   ```sql
   UPDATE public.courses SET created_by = 'VERIFIED_TRAINER_AUTH_UUID'::uuid
   WHERE id = 'EXACT_COURSE_ID';
   ```

   Display names are not used to infer ownership. Course editing preserves the
   owner; changing the displayed trainer name does not transfer ownership.
6. Add explicit team membership with verified profile UUIDs:

   ```sql
   INSERT INTO public.team_members(manager_id, member_id)
   VALUES ('TEAM_LEADER_AUTH_UUID'::uuid, 'EMPLOYEE_AUTH_UUID'::uuid)
   ON CONFLICT DO NOTHING;
   ```

   The manager must separately hold the `team_leader` role. Department names do not
   grant access. Without a membership row, team leaders see no other learner data.
7. The migration creates `course_assignments` if missing and backfills assignments
   represented by progress due dates/assigners. An existing `user_id` must be UUID,
   referring to `profiles.id`. The migration stops if it finds an incompatible
   legacy type; map old numeric IDs to profile UUIDs before retrying. Review any
   assignments that exist only in embedded course JSON and have no progress row.
   Progress referring to missing courses is preserved but skipped during assignment
   backfill. Inspect such legacy records separately; the migration does not delete
   them or fabricate replacement courses.
8. Deploy the frontend and sign out/in to refresh role-dependent UI. Database
   policies check the current profile role for each request, so a stale UI cannot
   retain server privileges after demotion. A self-role change also refreshes the
   current session. When a role changes, the dashboard remounts to clear old state.

For a fresh project, run the base schema followed immediately by the authorization
migration before exposing the API to users. The base no longer creates unrestricted
public table policies or copies roles from signup metadata.

## Verification

Use Node 24 LTS and run:

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run build
npm.cmd run lint
```

The tests execute real PostgreSQL through PGlite. They simulate Supabase request
identities and minimal Auth/Storage schemas, apply the actual migration, and test
grants, RLS, signup triggers, role RPCs, audit records and repeated deployment.
They are not a substitute for hosted Supabase API/Storage integration tests.

Verify with separate staging accounts:

- Employee: sign up without choosing a role. Attempt to restore `admin_suite`,
  change local permission data, update their own role via REST, call the role RPC,
  edit a course, approve a submission, or access another employee's records.
  No privileged operation should succeed.
- Trainer: create/edit their own course. Another trainer's courses and legacy
  unowned courses must not be editable. Users, permissions and platform settings
  must not render, even if their saved inner tab is tampered with.
- Team leader: open Team Reports. Only linked members' progress/reviews should be
  available; attempts to manage another team must fail.
- Admin: change a role using the user directory. Confirm `role_change_audit`
  records it and the database refuses to demote the last admin. Direct API role
  column updates are blocked even for admins; the checked RPC is required.
- Anonymous client: protected public tables must not be readable/writable.
- Supabase failure: user/progress/course reads must not substitute privileged
  browser caches. Failed course saves and role changes must not show success.

## Scope and remaining work

Assigned-course progress regression check (no additional SQL migration needed):

1. As a trainer, assign a course with a lesson and a deadline to a test employee.
2. As that employee, start the course, complete a lesson, and refresh the page.
   The completed lesson and percentage must persist; the deadline must stay intact.
3. For a course without a quiz, finish the final lesson and click Done. Refresh
   and confirm the course remains completed. Test quiz saving separately for courses
   with a quiz; grading and certificate eligibility have the limitations below.
4. Interrupt network access before saving. The app must show a save error and
   must not advance to the next lesson or show successful quiz results.
5. Run `npm test`: PostgreSQL tests exercise employee progress updates with RLS
   and confirm that deadline and approval changes remain blocked.

- Roles, row ownership and learner visibility are enforced here. Quiz grading,
  answer-key separation, authoritative completion and certificate issuance remain
  the next phase. Learners can still submit their own quiz/progress fields; do not
  treat those client-provided scores as trustworthy certification evidence.
- The existing resource bucket stays **public** to preserve current URLs. Uploads
  and mutations now require admin or trainer ownership. Private course materials
  and signed delivery require a separate storage migration and frontend changes.
- Post edits/deletes are limited to the owner or admin. The existing feed updates
  shared JSON for other users' reactions/comments; those operations need dedicated
  authorized backend functions rather than relaxing ownership policies.
- Account invitations are not implemented. The misleading Add User handler no
  longer reports that it created a real account. Ask users to sign up, then assign
  roles as admin. Profile deletion does not disable/delete an Auth account; use
  trusted Supabase administration for that lifecycle operation.
- Team membership currently uses database administration; a dedicated admin UI
  can follow. Department/settings persistence and atomic enrollment transactions
  remain separate work.
- Dependency audit reports existing Vite/PostCSS development-tool advisories
  (including transitive source-map-js/nanoid); the registry reports no automated
  fix. This authorization change does not claim to resolve dependency advisories.

References: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[database functions](https://supabase.com/docs/guides/database/functions),
[user metadata](https://supabase.com/docs/guides/auth/users).
