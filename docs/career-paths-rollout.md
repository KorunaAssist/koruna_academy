# Career Paths rollout

Apply `supabase/migrations/202611030001_career_paths.sql` in Supabase SQL Editor after the existing authorization, learning path, and skills migrations. If those earlier migrations are installed, run only this new file. This migration adds `career_paths`, `career_goals`, checked RPCs, and read policies. It does not seed sample careers or change account roles.

## Create a career path

1. Open Admin/Trainer Suite → Career Paths → Create Career Path.
2. Name it, for example **Loan Processor** or **Parabroker**.
3. Add ordered stages such as Junior Processor → Loan Processor → Senior Processor. Move stages up/down to arrange their sequence.
4. Select one or more requirements per stage: courses, specific published learning roadmap versions, or skill targets (1–100%). Required skills need linked lessons before publication. Every requirement in a stage must be met.
5. Save Draft to continue editing, or Publish Career Path to make it discoverable to all signed-in users.

Admins oversee all career paths. Trainers create and manage their own. Team leaders and employees can explore published paths and choose their own career goal but cannot edit career definitions.

## Employee flow

Open Career Path in the Academy menu, or My Career in the Home menu. Explore paths and choose **Set as My Career Goal**. This saves one personal goal; switching or clearing it preserves course/skill progress. Selecting a goal does not assign courses or enroll the user into every roadmap.

My Career opens the employee's saved goal first, with current stage, next stage, and remaining requirements. Other career paths are available through **Explore Career Paths**. Before a goal is selected, paths are shown as previews, rather than an assumed current career. Courses started directly from My Career return there using the course breadcrumb or completion return action.

The page shows current training stage, completed stages, missing requirements, skill targets, and overall training progress. **Continue training** opens the next assigned, available required course, including a prerequisite when necessary. Individual course links respect existing assignment and prerequisite checks. Unassigned courses show **Needs Assignment** and direct the learner to their team leader or trainer. Roadmap and skill links open Learning Paths and Skills Dashboard. Refresh reloads requirements and skill progress; returning after course study reloads the page automatically. There is no periodic polling.

## Progress and updates

- Course requirements use the highest saved completion percentage for the signed-in user's course across applications. Other users' progress is excluded.
- Roadmap requirements use the selected version's **required** courses, averaged equally. Optional courses and newer roadmap versions do not change that requirement. Training counts even if completed before selecting this career goal or joining that roadmap.
- Skill targets use the signed-in user's existing Skills Dashboard percentage divided by the target, capped at 100%. A 25% skill with a 50% target is halfway to the target. Unconfigured/unavailable training earns no credit.
- Requirements have equal weight within each stage; stages have equal weight in overall training progress. Stages unlock in order. Training completed for a later stage still counts when earlier stages are complete.
- Published career definitions are frozen. **Copy to New Draft** creates a separate editable path. Existing goals retain the original path. Archiving hides a path from new selection while existing goal holders retain its requirements, including referenced archived roadmap versions. No training progress is deleted.
- Course content and the skill lesson catalogue remain live, as in the existing Learning Paths and Skills Dashboard. Linking more lessons to a skill can change its percentage. Career publication freezes requirement IDs, roadmap version IDs, ordering, and skill targets, rather than duplicating course content or the skill catalogue.
- Completing all stages means **training readiness for a career discussion**. It does not grant a promotion, certification, or platform role. Practical assessment approval continues through the existing course completion workflow.

## Test in localhost

1. As trainer, save a draft with two stages. Confirm employees cannot see it; another trainer cannot edit it. Admin can manage it.
2. Publish the path. Confirm employee and team leader accounts can explore it and save their own goal. Refresh or sign back in and confirm the goal persists.
3. Start with a fresh account: progress should be 0%; the first stage is current and later stages locked. Other users' completions must not appear.
4. Complete the first course. Confirm the first stage completes and the next stage becomes current. Repeat an application and verify it does not double count.
5. Test a skill target and a roadmap requirement. Optional roadmap courses should not block completion. An incomplete prerequisite should offer its assigned course before the locked course. Unassigned courses should show **Needs Assignment**; use the existing training assignment workflow to grant access.
6. Copy a published path into a new draft and change its stages. Confirm existing goals remain tied to the original. Archive the original: existing goal holders can still see it; new users cannot select it.
7. Complete all requirements. Confirm the ready-for-discussion message appears and the user's account role stays unchanged.

Automated verification covers database permissions/lifecycle, personal progress calculations, pinned roadmap curriculum, prerequisite suggestions, and rendered navigation for every role. Live Supabase/account testing still requires applying the migration to your project.
