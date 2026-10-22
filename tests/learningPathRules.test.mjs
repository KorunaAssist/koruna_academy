import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coursePercent,missingPrerequisites } from '../src/services/learningPathRules.ts';

test('course unlock rules use completed prerequisites across application records',() => {
  const dependencies = [{course_id:'processing',prerequisite_course_id:'intro'}];
  assert.deepEqual(missingPrerequisites('processing',dependencies,[]),['intro']);
  assert.deepEqual(missingPrerequisites('processing',dependencies,[{courseId:'intro',progressPercent:100,practicalStatus:'pending'}]),['intro']);
  const progress = [{courseId:'intro',progressPercent:20,practicalStatus:'none'},
    {courseId:'intro',progressPercent:100,practicalStatus:'approved'}];
  assert.equal(coursePercent('intro',progress),100);
  assert.deepEqual(missingPrerequisites('processing',dependencies,progress),[]);
  assert.deepEqual(missingPrerequisites('intro',dependencies,[]),[]);
  // Preserve access to completed courses if global prerequisite rules change.
  assert.deepEqual(missingPrerequisites('processing',dependencies,[{courseId:'processing',progressPercent:100,practicalStatus:'none'}]),[]);
});
