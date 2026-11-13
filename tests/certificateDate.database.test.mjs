import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('certificate completion date survives reopening, retries and progress changes', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE user_progress(id int PRIMARY KEY, progress_percent int, last_viewed_at text);
      INSERT INTO user_progress VALUES (1,100,'2026-01-05T00:00:00Z'),(2,50,NULL);`);
    await db.exec(await readFile(new URL('../supabase/migrations/202611120003_certificate_completion_date.sql', import.meta.url), 'utf8'));
    const date = async id => (await db.query('SELECT completed_at FROM user_progress WHERE id=$1', [id])).rows[0].completed_at?.toISOString();
    const historical = await date(1);
    assert.equal(historical, '2026-01-05T00:00:00.000Z');
    assert.equal(await date(2), undefined);
    await db.exec('UPDATE user_progress SET progress_percent=100 WHERE id=2');
    const earned = await date(2);
    assert.ok(earned);
    await db.exec(`UPDATE user_progress SET last_viewed_at=now(), completed_at='2099-01-01';
      UPDATE user_progress SET progress_percent=0;
      UPDATE user_progress SET progress_percent=100;`);
    assert.equal(await date(1), historical);
    assert.equal(await date(2), earned);
    await db.exec("INSERT INTO user_progress VALUES(3,100,NULL,'2099-01-01')");
    assert.ok(await date(3));
    assert.notEqual(await date(3), '2099-01-01T00:00:00.000Z');
  } finally {
    await db.close();
  }
});
