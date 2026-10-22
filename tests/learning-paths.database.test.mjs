import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('learning path database lifecycle, permissions, enrolment and progress', async t => {
  const db = new PGlite();
  const ids = Object.fromEntries(['admin','trainer','otherTrainer','employee','otherEmployee'].map((name,i) =>
    [name, `00000000-0000-0000-0000-${String(i+1).padStart(12,'0')}`]));
  const as = (user,sql,params=[]) => db.transaction(async tx => {
    await tx.exec(`SET LOCAL ROLE ${user ? 'authenticated' : 'anon'}`);
    await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [ids[user] || '']);
    return tx.query(sql,params);
  });
  try {
    await db.exec(`
      CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
      CREATE SCHEMA auth; CREATE SCHEMA storage;
      CREATE TABLE auth.users(id uuid PRIMARY KEY,email text UNIQUE,raw_user_meta_data jsonb DEFAULT '{}');
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      GRANT USAGE ON SCHEMA auth TO anon,authenticated;
      GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated;
      CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean);
      CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text,owner_id text);
    `);
    for (const file of ['../supabase_schema.sql','../supabase/migrations/202610150001_authorization.sql',
      '../supabase/migrations/202610210001_learning_paths.sql',
      '../supabase/migrations/202610210002_learning_path_builder.sql',
      '../supabase/migrations/202610210003_repair_learning_progress_triggers.sql']) {
      await db.exec(await readFile(new URL(file,import.meta.url),'utf8'));
    }
    for (const [name,id] of Object.entries(ids)) {
      await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[id,`${name}@example.com`]);
      await db.query('UPDATE public.profiles SET role=$1 WHERE id=$2',[
        name === 'admin' ? 'admin' : name.includes('Trainer') || name === 'trainer' ? 'trainer' : 'employee',id]);
    }
    await as('trainer', `INSERT INTO public.courses(id,title,category,code) VALUES
      ('intro','Introduction','Mortgage','INTRO'),('processing','Processing','Mortgage','PROC'),('advanced','Advanced','Mortgage','ADV')`);
    let path, version, nextVersion;
    await t.test('trainers create owned drafts; employees and unrelated trainers cannot manage them',async () => {
      path = (await as('trainer',"INSERT INTO public.learning_paths(name) VALUES('Loan Processor') RETURNING id")).rows[0].id;
      version = (await as('trainer',`INSERT INTO public.learning_path_versions(path_id,version_number,name)
        VALUES($1,1,'Loan Processor') RETURNING id`,[path])).rows[0].id;
      await as('trainer',`INSERT INTO public.learning_path_courses(version_id,course_id,position)
        VALUES($1,'intro',1),($1,'processing',2)`,[version]);
      assert.equal((await as('employee','SELECT * FROM public.learning_paths')).rows.length,0);
      assert.equal((await as('employee','SELECT * FROM public.learning_path_courses')).rows.length,0);
      await assert.rejects(as('employee',"INSERT INTO public.learning_paths(name) VALUES('Forged')"),/row-level security/i);
      assert.equal((await as('otherTrainer',"UPDATE public.learning_paths SET name='Hacked' WHERE id=$1 RETURNING id",[path])).rows.length,0);
      await assert.rejects(as('trainer','UPDATE public.learning_paths SET created_by=$1 WHERE id=$2',[ids.otherTrainer,path]),/permission denied/i);
    });
    await t.test('prerequisites reject self references, transitive cycles and unauthorized changes',async () => {
      await as('trainer',"INSERT INTO public.course_prerequisites VALUES('processing','intro'),('advanced','processing')");
      await assert.rejects(as('trainer',"INSERT INTO public.course_prerequisites VALUES('intro','advanced')"),/cycle/i);
      await assert.rejects(as('trainer',"INSERT INTO public.course_prerequisites VALUES('intro','intro')"),/cycle|check constraint/i);
      await assert.rejects(as('employee',"INSERT INTO public.course_prerequisites VALUES('advanced','intro')"),/row-level security/i);
      await assert.rejects(as('otherTrainer',"INSERT INTO public.course_prerequisites VALUES('advanced','intro')"),/row-level security/i);
    });
    await t.test('publication requires courses and freezes the sequence',async () => {
      const empty = (await as('trainer',`INSERT INTO public.learning_path_versions(path_id,version_number,name)
        VALUES($1,2,'Empty') RETURNING id`,[path])).rows[0].id;
      await assert.rejects(as('trainer',"UPDATE public.learning_path_versions SET status='published' WHERE id=$1",[empty]),/required course/i);
      await as('trainer','DELETE FROM public.learning_path_versions WHERE id=$1',[empty]);
      await as('trainer',"UPDATE public.learning_path_versions SET status='published' WHERE id=$1",[version]);
      assert.equal((await as('employee','SELECT * FROM public.learning_paths')).rows.length,1);
      await assert.rejects(as('trainer','UPDATE public.learning_path_courses SET position=3 WHERE version_id=$1 AND position=1',[version]),/immutable/i);
      await assert.rejects(as('trainer',"UPDATE public.learning_path_versions SET name='Changed' WHERE id=$1",[version]),/immutable/i);
      assert.equal((await as('trainer','DELETE FROM public.learning_path_versions WHERE id=$1 RETURNING id',[version])).rows.length,0);
    });
    await t.test('staff assignment and self-enrolment cannot be forged or clear a deadline',async () => {
      await assert.rejects(as('employee','SELECT public.enrol_learning_path($1,$2)',[path,ids.otherEmployee]),/manager/i);
      await assert.rejects(as('employee',`INSERT INTO public.learning_path_enrolments(path_id,version_id,user_id,source)
        VALUES($1,$2,$3,'assigned')`,[path,version,ids.employee]),/permission denied/i);
      await as('trainer',"SELECT public.enrol_learning_path($1,$2,'2026-12-01'::timestamptz)",[path,ids.employee]);
      await as('employee','SELECT public.enrol_learning_path($1)',[path]);
      const row = (await as('employee','SELECT * FROM public.learning_path_enrolments')).rows[0];
      assert.equal(row.source,'assigned');
      assert.ok(row.due_at);
      assert.equal((await as('otherEmployee','SELECT * FROM public.learning_path_enrolments')).rows.length,0);
      assert.equal((await as('otherTrainer','SELECT * FROM public.learning_path_enrolments')).rows.length,0);
    });
    await t.test('course starts enrol automatically; assignments alone do not; progress is real',async () => {
      await db.exec("INSERT INTO public.user_progress(user_email,course_id,due_date) VALUES('otherEmployee@example.com','intro','2026-12-01')");
      assert.equal((await as('otherEmployee','SELECT * FROM public.learning_path_enrolments')).rows.length,0);
      await as('otherEmployee',"UPDATE public.user_progress SET last_viewed_at='2026-10-21' WHERE course_id='intro'");
      let row = (await as('otherEmployee','SELECT * FROM public.learning_path_progress')).rows[0];
      assert.equal(row.progress_percent,0);
      await as('otherEmployee',"UPDATE public.user_progress SET progress_percent=50 WHERE course_id='intro'");
      row = (await as('otherEmployee','SELECT * FROM public.learning_path_progress')).rows[0];
      assert.equal(row.progress_percent,25);
      assert.equal(row.required_courses,2);
      assert.equal(row.completed_courses,0);
      assert.equal((await as('employee','SELECT * FROM public.learning_path_progress')).rows.length,1);
      assert.equal((await as('trainer','SELECT * FROM public.learning_path_progress')).rows.length,2);
      assert.equal((await as('admin','SELECT * FROM public.learning_path_progress')).rows.length,2);
      assert.equal((await as('otherTrainer','SELECT * FROM public.learning_path_progress')).rows.length,0);
    });
    await t.test('new versions preserve existing enrolments and old progress',async () => {
      nextVersion = (await as('trainer','SELECT public.clone_learning_path_version($1) AS id',[version])).rows[0].id;
      await as('trainer',"INSERT INTO public.learning_path_courses VALUES($1,'advanced',3,true)",[nextVersion]);
      await as('trainer',"UPDATE public.learning_path_versions SET status='published' WHERE id=$1",[nextVersion]);
      await as('trainer','SELECT public.enrol_learning_path($1,$2)',[path,ids.otherEmployee]);
      assert.equal((await as('otherEmployee','SELECT version_id FROM public.learning_path_enrolments')).rows[0].version_id,version);
      assert.equal((await as('otherEmployee','SELECT progress_percent FROM public.learning_path_progress')).rows[0].progress_percent,25);
      await as('otherTrainer','SELECT public.enrol_learning_path($1)',[path]);
      assert.equal((await as('otherTrainer','SELECT version_id FROM public.learning_path_enrolments')).rows[0].version_id,nextVersion);
    });
    await t.test('archived versions remain readable to their learners, but cannot be newly joined',async () => {
      await as('admin',"UPDATE public.learning_path_versions SET status='archived' WHERE path_id=$1",[path]);
      assert.equal((await as('employee','SELECT * FROM public.learning_path_courses')).rows.length,2);
      await assert.rejects(as('employee','SELECT public.enrol_learning_path($1)',[path]),/No published version/i);
      await assert.rejects(as('trainer',"UPDATE public.learning_path_versions SET status='draft' WHERE id=$1",[version]),/immutable/i);
    });
    await t.test('anonymous clients have no access; course catalogue visibility is unchanged',async () => {
      for (const table of ['learning_paths','learning_path_versions','learning_path_courses','course_prerequisites','learning_path_enrolments','learning_path_progress']) {
        await assert.rejects(as(null,`SELECT * FROM public.${table}`),/permission denied/i);
      }
      await assert.rejects(as(null,'SELECT public.enrol_learning_path($1)',[path]),/permission denied/i);
      assert.equal((await as('employee','SELECT * FROM public.courses')).rows.length,3);
    });
    await t.test('builder saves and reorders drafts atomically and enforces ownership',async () => {
      const courses = [{course_id:'intro',required:true},{course_id:'processing',required:true}];
      const created = (await as('trainer',`SELECT public.save_learning_path_draft('Web Dev','Build useful skills',$1) AS id`,[JSON.stringify(courses)])).rows[0].id;
      assert.equal((await as('employee','SELECT * FROM public.learning_path_versions WHERE id=$1',[created])).rows.length,0);
      await as('trainer',`SELECT public.save_learning_path_draft('Web Dev','Updated',$1,$2)`,[JSON.stringify([...courses].reverse()),created]);
      const rows = (await as('trainer','SELECT course_id FROM public.learning_path_courses WHERE version_id=$1 ORDER BY position',[created])).rows;
      assert.deepEqual(rows.map(r => r.course_id),['processing','intro']);
      await assert.rejects(as('otherTrainer',`SELECT public.save_learning_path_draft('Hacked','',$1,$2)`,[JSON.stringify(courses),created]),/manager access/i);
      await assert.rejects(as('employee',`SELECT public.save_learning_path_draft('Hacked','',$1)`,[JSON.stringify(courses)]),/Trainer or administrator/i);
      const before = (await as('trainer','SELECT count(*)::integer AS count FROM public.learning_paths')).rows[0].count;
      await assert.rejects(as('trainer',`SELECT public.save_learning_path_draft('Invalid','',$1,NULL,$2)`,[JSON.stringify(courses),JSON.stringify([
        {course_id:'intro',prerequisite_course_ids:['processing']},
        {course_id:'processing',prerequisite_course_ids:['intro']},
      ])]),/cycle/i);
      assert.equal((await as('trainer','SELECT count(*)::integer AS count FROM public.learning_paths')).rows[0].count,before);
      assert.equal((await as('trainer',"SELECT * FROM public.course_prerequisites WHERE course_id='intro'")).rows.length,0);
      await as('trainer',`SELECT public.save_learning_path_draft('Web Dev','Updated',$1,$2,$3)`,[JSON.stringify(courses),created,
        JSON.stringify([{course_id:'processing',prerequisite_course_ids:['intro']}])]);
      await as('trainer',"UPDATE public.learning_path_versions SET status='published' WHERE id=$1",[created]);
      assert.equal((await as('employee','SELECT * FROM public.learning_path_versions WHERE id=$1',[created])).rows.length,1);
      await assert.rejects(as('trainer',`SELECT public.save_learning_path_draft('Edit live','',$1,$2)`,[JSON.stringify(courses),created]),/new draft version/i);
    });
    await t.test('database blocks locked starts and direct progress writes, then unlocks after prerequisites',async () => {
      await assert.rejects(as('employee',`INSERT INTO public.user_progress(user_email,course_id,last_viewed_at)
        VALUES('employee@example.com','processing','2026-10-21')`),/prerequisite courses/i);
      await assert.rejects(as('employee',`INSERT INTO public.user_progress(user_email,course_id,progress_percent)
        VALUES('employee@example.com','processing',100)`),/prerequisite courses/i);
      await as('employee',`INSERT INTO public.user_progress(user_email,course_id,progress_percent,last_viewed_at)
        VALUES('employee@example.com','intro',100,'2026-10-21')`);
      await as('employee',`INSERT INTO public.user_progress(user_email,course_id,last_viewed_at)
        VALUES('employee@example.com','processing','2026-10-21')`);
      // Supabase's legacy mapper sends JSON-encoded strings, not native arrays.
      await as('employee',`UPDATE public.user_progress SET completed_lessons=$1::jsonb,progress_percent=20
        WHERE course_id='processing'`,[JSON.stringify(JSON.stringify(['lesson-1']))]);
      assert.equal((await as('employee',"SELECT * FROM public.user_progress WHERE course_id='processing'")).rows.length,1);
      // A learner can see/join this roadmap without being individually assigned.
      const web = (await as('employee',"SELECT * FROM public.learning_path_versions WHERE name='Web Dev'")).rows[0];
      assert.equal((await as('employee','SELECT * FROM public.learning_path_enrolments WHERE path_id=$1',[web.path_id])).rows[0].source,'automatic');
    });
    await t.test('a path can include another trainer course without granting course edit or review rights',async () => {
      await as('otherTrainer',"INSERT INTO public.courses(id,title,category,code) VALUES('foreign','Another trainer course','Training','FOREIGN')");
      const rows = JSON.stringify([{course_id:'foreign',required:true}]);
      const id = (await as('trainer',"SELECT public.save_learning_path_draft('Shared curriculum','',$1) AS id",[rows])).rows[0].id;
      await as('trainer',"UPDATE public.learning_path_versions SET status='published' WHERE id=$1",[id]);
      await as('employee',"INSERT INTO public.user_progress(user_email,course_id,progress_percent,last_viewed_at) VALUES('employee@example.com','foreign',40,'2026-10-21')");
      assert.equal((await as('trainer','SELECT * FROM public.learning_path_progress WHERE version_id=$1',[id])).rows[0].progress_percent,40);
      assert.equal((await as('trainer',"UPDATE public.courses SET title='Hacked' WHERE id='foreign' RETURNING id")).rows.length,0);
      assert.equal((await as('trainer',"UPDATE public.user_progress SET practical_status='approved' WHERE course_id='foreign' RETURNING course_id")).rows.length,0);
      const before = (await as('trainer','SELECT count(*)::integer AS count FROM public.learning_paths')).rows[0].count;
      await assert.rejects(as('trainer',"SELECT public.save_learning_path_draft('Invalid edit','',$1,NULL,$2)",[rows,
        JSON.stringify([{course_id:'foreign',prerequisite_course_ids:['intro']}])]),/course owners/i);
      assert.equal((await as('trainer','SELECT count(*)::integer AS count FROM public.learning_paths')).rows[0].count,before);
    });
    await t.test('repair restores course starts after a deployed trigger references a misspelled field',async () => {
      const before = (await db.query('SELECT count(*)::integer AS count FROM public.learning_path_enrolments')).rows[0].count;
      await db.exec(`CREATE OR REPLACE FUNCTION private.ka_guard_course_prerequisites() RETURNS trigger
        LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
        BEGIN PERFORM NEW.last_viewed_a; RETURN NEW; END; $$;`);
      await assert.rejects(as('employee',"UPDATE public.user_progress SET last_viewed_at='2026-10-22' WHERE course_id='foreign'"),/has no field.*last_viewed_a/i);
      const repair = await readFile(new URL('../supabase/migrations/202610210003_repair_learning_progress_triggers.sql',import.meta.url),'utf8');
      await db.exec(repair);
      await db.exec(repair); // Safe to repeat without losing learner records.
      assert.equal((await db.query('SELECT count(*)::integer AS count FROM public.learning_path_enrolments')).rows[0].count,before);
      await as('employee',"UPDATE public.user_progress SET last_viewed_at='2026-10-22' WHERE course_id='foreign'");
      assert.equal((await as('employee',"SELECT last_viewed_at FROM public.user_progress WHERE course_id='foreign'")).rows[0].last_viewed_at,'2026-10-22');
      // The repair retains prerequisite enforcement rather than disabling it.
      await assert.rejects(as('otherEmployee',`INSERT INTO public.user_progress(user_email,course_id,last_viewed_at)
        VALUES('otherEmployee@example.com','processing','2026-10-22')`),/prerequisite courses/i);
    });
  } finally { await db.close(); }
});
