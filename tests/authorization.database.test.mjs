import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { persistProgress, learnerProgressFields } from '../src/services/progressPersistence.ts';

// Actual PostgreSQL RLS/GRANT/function behavior. Only the Supabase auth/storage
// schemas and request identity are stubbed; no authorization rules are mocked.
const db = new PGlite();
const ids = Object.fromEntries(['admin','admin2','trainer','otherTrainer','employee','otherEmployee','leader','signup'].map((name, i) => [name, `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`]));

async function as(role, user, sql, params = []) {
  return db.transaction(async tx => {
    await tx.exec(`SET LOCAL ROLE ${role}`);
    await tx.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [user ? ids[user] : '']);
    return tx.query(sql, params);
  });
}
const asUser = (user, sql, params) => as('authenticated', user, sql, params);

before(async () => {
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text UNIQUE, raw_user_meta_data jsonb DEFAULT '{}'::jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
    CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean);
    CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid() PRIMARY KEY, bucket_id text, name text, owner_id text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA storage TO anon, authenticated;
    GRANT ALL ON storage.objects TO anon, authenticated;
  `);
  await db.exec(await readFile(new URL('../supabase_schema.sql', import.meta.url), 'utf8'));
  // Simulate a legacy custom permissive policy as well as Supabase default grants.
  await db.exec(`GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
    CREATE POLICY legacy_allow_everything ON public.profiles FOR ALL USING (true) WITH CHECK (true);`);
  const migration = await readFile(new URL('../supabase/migrations/202610150001_authorization.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration); // Repeatable deployment must preserve enforcement.
  for (const [name, id] of Object.entries(ids)) {
    await db.query('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,$3)', [id, `${name}@example.com`, JSON.stringify({ full_name: name, role: 'admin' })]);
  }
  for (const name of ['admin','admin2','trainer','otherTrainer','leader']) {
    const role = name.startsWith('admin') ? 'admin' : name === 'leader' ? 'team_leader' : 'trainer';
    await db.query('UPDATE public.profiles SET role=$1 WHERE id=$2', [role, ids[name]]);
  }
  await db.query("INSERT INTO public.courses(id,title,category,code,created_by) VALUES('a','A','Training','A',$1),('b','B','Training','B',$2),('legacy','Legacy','Training','LEGACY',null)", [ids.trainer, ids.otherTrainer]);
  await db.query('INSERT INTO public.team_members(manager_id,member_id) VALUES($1,$2)', [ids.leader, ids.employee]);
  await db.exec("INSERT INTO public.user_progress(user_email,course_id) VALUES('employee@example.com','a'),('otherEmployee@example.com','a'),('employee@example.com','b')");
  await db.exec("INSERT INTO public.practical_submissions(id,user_email,user_name,course_id,course_title,submission_text,date_submitted) VALUES('submission','employee@example.com','Employee','a','A','Work','2026-10-15')");
});
after(async () => { await db.close(); });

test('assigned learners can save lessons and completion without changing staff fields', async () => {
  await db.exec(`UPDATE public.user_progress SET due_date='2026-12-01', assigned_by='trainer@example.com'
    WHERE user_email='employee@example.com' AND course_id='a' AND application_id=0`);
  const fields = learnerProgressFields({ progress_percent: 100, completed_lessons: JSON.stringify(['lesson-a']),
    quiz_attempts: 0, practical_status: 'approved', due_date: null, assigned_by: null });
  const keys = Object.keys(fields);
  await persistProgress({
    update: async () => {
      const result = await asUser('employee', `UPDATE public.user_progress SET
        ${keys.map((key, i) => `${key}=$${i + 1}`).join(',')}
        WHERE user_email='employee@example.com' AND course_id='a' AND application_id=0 RETURNING course_id`, Object.values(fields));
      return { count: result.rows.length };
    },
    insert: async () => assert.fail('an existing assigned record must never be inserted again')
  });
  const { rows: [saved] } = await asUser('employee', "SELECT * FROM public.user_progress WHERE course_id='a' AND application_id=0");
  assert.equal(saved.progress_percent, 100);
  assert.deepEqual(saved.completed_lessons, ['lesson-a']);
  assert.equal(saved.due_date, '2026-12-01');
  assert.equal(saved.assigned_by, 'trainer@example.com');
  assert.equal(saved.practical_status, 'none');
  await assert.rejects(asUser('employee', "UPDATE public.user_progress SET due_date=null WHERE course_id='a'"), /authorized reviewer/i);
  await assert.rejects(asUser('employee', "UPDATE public.user_progress SET practical_status='approved' WHERE course_id='a'"), /authorized reviewer/i);
});

test('signup metadata requesting admin still creates an employee profile', async () => {
  const result = await db.query('SELECT role FROM public.profiles WHERE id=$1', [ids.signup]);
  assert.equal(result.rows[0].role, 'employee');
});

test('anonymous clients cannot read profiles/courses/progress or call role administration', async () => {
  for (const table of ['profiles','courses','user_progress','practical_submissions','notifications','posts','role_change_audit']) {
    await assert.rejects(as('anon', null, `SELECT * FROM public.${table}`), /permission denied/i);
  }
  await assert.rejects(as('anon', null, 'SELECT public.set_user_role($1,$2)', [ids.signup,'admin']), /permission denied/i);
});

test('employees cannot change roles directly, promote through RPC, or insert replacement profiles', async () => {
  await assert.rejects(asUser('employee', "UPDATE public.profiles SET role='admin' WHERE id=$1", [ids.employee]), /permission denied/i);
  await assert.rejects(asUser('employee', 'SELECT public.set_user_role($1,$2)', [ids.employee,'admin']), /Administrator access/i);
  await assert.rejects(asUser('trainer', 'SELECT public.set_user_role($1,$2)', [ids.employee,'admin']), /Administrator access/i);
  await assert.rejects(asUser('employee', 'INSERT INTO public.profiles(id,full_name,role) VALUES($1,$2,$3)', [ids.signup,'Spoof','admin']), /permission denied/i);
});

test('employee can update own display name but cannot update identity or another profile', async () => {
  assert.equal((await asUser('employee', "UPDATE public.profiles SET full_name='Updated' WHERE id=$1 RETURNING id", [ids.employee])).rows.length, 1);
  assert.equal((await asUser('employee', "UPDATE public.profiles SET full_name='Hacked' WHERE id=$1 RETURNING id", [ids.otherEmployee])).rows.length, 0);
  await assert.rejects(asUser('employee', "UPDATE public.profiles SET email='admin@example.com' WHERE id=$1", [ids.employee]), /permission denied/i);
  assert.equal((await asUser('employee','SELECT id FROM public.profiles')).rows.length, 1);
});

test('only admins can promote and demote, and role changes create immutable audit records', async () => {
  await asUser('admin', 'SELECT public.set_user_role($1,$2)', [ids.signup,'trainer']);
  await asUser('admin', 'SELECT public.set_user_role($1,$2)', [ids.signup,'employee']);
  assert.equal((await asUser('admin','SELECT * FROM public.role_change_audit')).rows.length, 2);
  assert.equal((await asUser('employee','SELECT * FROM public.role_change_audit')).rows.length, 0);
  await assert.rejects(asUser('admin','DELETE FROM public.role_change_audit'), /permission denied/i);
  await assert.rejects(asUser('admin','SELECT public.set_user_role($1,$2)', [ids.signup,'superadmin']), /Invalid user role/i);
});

test('the last admin cannot be demoted or delete their own profile', async () => {
  await assert.rejects(db.transaction(async tx => {
    await tx.exec('SET LOCAL ROLE authenticated');
    await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [ids.admin]);
    await tx.query('SELECT public.set_user_role($1,$2)', [ids.admin2,'employee']);
    await tx.query('SELECT public.set_user_role($1,$2)', [ids.admin,'employee']);
  }), /last administrator/i);
  assert.equal((await asUser('admin','DELETE FROM public.profiles WHERE id=$1 RETURNING id',[ids.admin])).rows.length, 0);
});

test('employee cannot create courses; trainer can create own courses but cannot modify or steal others', async () => {
  await assert.rejects(asUser('employee', "INSERT INTO public.courses(id,title,category,code) VALUES('forged','Forged','Training','FORGED')"), /row-level security/i);
  const result = await asUser('trainer', "INSERT INTO public.courses(id,title,category,code) VALUES('new','New','Training','NEW') RETURNING created_by");
  assert.equal(result.rows[0].created_by, ids.trainer);
  assert.equal((await asUser('trainer', "UPDATE public.courses SET title='Changed' WHERE id='a' RETURNING id")).rows.length, 1);
  assert.equal((await asUser('trainer', "UPDATE public.courses SET title='Hacked' WHERE id IN ('b','legacy') RETURNING id")).rows.length, 0);
  await assert.rejects(asUser('trainer', "UPDATE public.courses SET created_by=$1 WHERE id='a'", [ids.otherTrainer]), /row-level security/i);
  assert.equal((await asUser('admin', "UPDATE public.courses SET title='Admin changed' WHERE id='legacy' RETURNING id")).rows.length, 1);
});

test('learner data stays within own, course-owner or explicit team scope', async () => {
  assert.equal((await asUser('employee','SELECT * FROM public.user_progress')).rows.length, 2);
  assert.equal((await asUser('otherEmployee','SELECT * FROM public.user_progress')).rows.length, 1);
  assert.equal((await asUser('trainer',"SELECT * FROM public.user_progress WHERE course_id='b'")).rows.length, 0);
  assert.equal((await asUser('leader','SELECT * FROM public.user_progress')).rows.length, 2);
  assert.equal((await asUser('employee',"UPDATE public.user_progress SET progress_percent=100 WHERE user_email='otherEmployee@example.com' RETURNING course_id")).rows.length, 0);
  await assert.rejects(asUser('employee',"UPDATE public.user_progress SET practical_status='approved' WHERE user_email='employee@example.com' AND course_id='a'"), /authorized reviewer/i);
});

test('only the assigned team leader or course owner can review practical submissions', async () => {
  assert.equal((await asUser('employee',"UPDATE public.practical_submissions SET status='approved' WHERE id='submission' RETURNING id")).rows.length, 0);
  assert.equal((await asUser('otherTrainer',"UPDATE public.practical_submissions SET status='approved' WHERE id='submission' RETURNING id")).rows.length, 0);
  assert.equal((await asUser('leader',"UPDATE public.practical_submissions SET status='approved' WHERE id='submission' RETURNING id")).rows.length, 1);
});

test('employees cannot assign themselves or edit team membership', async () => {
  await assert.rejects(asUser('employee', 'INSERT INTO public.course_assignments(course_id,user_id) VALUES($1,$2)', ['a',ids.employee]), /row-level security/i);
  await assert.rejects(asUser('leader', 'INSERT INTO public.team_members(manager_id,member_id) VALUES($1,$2)', [ids.leader,ids.otherEmployee]), /row-level security/i);
  await asUser('trainer','INSERT INTO public.course_assignments(course_id,user_id) VALUES($1,$2)', ['a',ids.employee]);
  assert.equal((await asUser('employee','SELECT * FROM public.course_assignments')).rows.length, 1);
  assert.equal((await asUser('otherEmployee','SELECT * FROM public.course_assignments')).rows.length, 0);
});

test('resource upload writes are blocked for employees and allowed for trainers', async () => {
  await assert.rejects(asUser('employee', 'INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES($1,$2,$3)', ['course-documents','forged',ids.employee]), /row-level security/i);
  await asUser('trainer','INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES($1,$2,$3)', ['course-documents','owned',ids.trainer]);
  assert.equal((await asUser('otherTrainer',"DELETE FROM storage.objects WHERE name='owned' RETURNING id")).rows.length, 0);
  assert.equal((await asUser('trainer',"DELETE FROM storage.objects WHERE name='owned' RETURNING id")).rows.length, 1);
});

test('notifications cannot expose another learner or be forged by an employee', async () => {
  await asUser('trainer', "INSERT INTO public.notifications(id,user_email,course_id,title,message) VALUES('note','employee@example.com','a','Assigned','Course assigned')");
  assert.equal((await asUser('employee',"SELECT * FROM public.notifications WHERE id='note'")).rows.length, 1);
  assert.equal((await asUser('otherEmployee',"SELECT * FROM public.notifications WHERE id='note'")).rows.length, 0);
  await assert.rejects(asUser('employee', "INSERT INTO public.notifications(id,user_email,course_id,title,message) VALUES('forged-note','otherEmployee@example.com','a','Forged','Forged')"), /row-level security/i);
});

test('feed content cannot be impersonated, rewritten or deleted by another employee', async () => {
  await asUser('employee', "INSERT INTO public.posts(id,user_id,author_name,content) VALUES('post',$1,'Employee','Original')", [ids.employee]);
  await assert.rejects(asUser('otherEmployee', "INSERT INTO public.posts(id,user_id,author_name,content) VALUES('forged-post',$1,'Employee','Forged')", [ids.employee]), /row-level security/i);
  assert.equal((await asUser('otherEmployee',"UPDATE public.posts SET content='Hacked' WHERE id='post' RETURNING id")).rows.length, 0);
  assert.equal((await asUser('otherEmployee',"DELETE FROM public.posts WHERE id='post' RETURNING id")).rows.length, 0);
});

test('a broad legacy storage policy cannot bypass the restrictive mutation guards', async () => {
  await db.exec('CREATE POLICY unrelated_wide_storage_policy ON storage.objects FOR ALL USING (true) WITH CHECK (true)');
  await assert.rejects(asUser('employee', "INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES('course-documents','forged-through-policy',$1)", [ids.employee]), /row-level security/i);
  await assert.rejects(as('anon',null,"INSERT INTO storage.objects(bucket_id,name) VALUES('course-documents','anonymous')"), /row-level security/i);
  await db.exec('DROP POLICY unrelated_wide_storage_policy ON storage.objects');
});

test('an authenticated role without a user identity receives no learning access', async () => {
  assert.equal((await as('authenticated',null,'SELECT * FROM public.courses')).rows.length, 0);
  assert.equal((await as('authenticated',null,'SELECT * FROM public.profiles')).rows.length, 0);
});

test('reapplying the migration preserves existing roles, course ownership and audit history', async () => {
  await db.exec(await readFile(new URL('../supabase/migrations/202610150001_authorization.sql', import.meta.url), 'utf8'));
  assert.equal((await db.query('SELECT role FROM public.profiles WHERE id=$1',[ids.admin])).rows[0].role, 'admin');
  assert.equal((await db.query("SELECT created_by FROM public.courses WHERE id='a'")).rows[0].created_by, ids.trainer);
  assert.equal((await asUser('admin','SELECT * FROM public.role_change_audit')).rows.length, 2);
});

test('assignment backfill skips orphaned courses, preserves legacy progress and copies valid assignments', async () => {
  // Simulate a legacy database whose progress foreign key was previously missing.
  await db.exec(`
    ALTER TABLE public.user_progress DROP CONSTRAINT user_progress_course_id_fkey;
    INSERT INTO public.user_progress(user_email,course_id,due_date)
      VALUES('employee@example.com','c-1787046161161','2026-12-01');
    ALTER TABLE public.user_progress ADD CONSTRAINT user_progress_course_id_fkey
      FOREIGN KEY(course_id) REFERENCES public.courses(id) ON DELETE CASCADE NOT VALID;
    UPDATE public.user_progress SET due_date='2026-12-01'
      WHERE user_email='employee@example.com' AND course_id='b';
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/202610150001_authorization.sql', import.meta.url), 'utf8'));
  assert.equal((await db.query("SELECT * FROM public.course_assignments WHERE course_id='c-1787046161161'")).rows.length, 0);
  assert.equal((await db.query("SELECT * FROM public.user_progress WHERE course_id='c-1787046161161'")).rows.length, 1);
  assert.equal((await db.query("SELECT * FROM public.course_assignments WHERE course_id='b' AND user_id=$1", [ids.employee])).rows.length, 1);
  // Clean the test fixture only; the migration intentionally leaves old progress untouched.
  await db.exec(`DELETE FROM public.user_progress WHERE course_id='c-1787046161161';
    ALTER TABLE public.user_progress VALIDATE CONSTRAINT user_progress_course_id_fkey;`);
});
