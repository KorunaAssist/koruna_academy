import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countAnsweredQuizQuestions } from '../src/services/quizAnswers.ts';

const shortAnswer = { question: 'Explain', type: 'short_answer', options: [], correctAnswer: 0 };
const multipleChoice = { question: 'Choose', options: ['A', 'B', 'C'], correctAnswer: 0 };
const trueFalse = { question: 'Confirm', options: ['True', 'False'], correctAnswer: 1 };

test('typed answers complete short-answer-only quizzes and clearing them removes completion', () => {
  assert.equal(countAnsweredQuizQuestions([shortAnswer], {}, { 0: 'Employee response' }), 1);
  assert.equal(countAnsweredQuizQuestions([shortAnswer], {}, { 0: '' }), 0);
  assert.equal(countAnsweredQuizQuestions([shortAnswer], {}, { 0: ' \n\t ' }), 0);
});

test('mixed quizzes count text, option zero, and true/false answers together', () => {
  const questions = [multipleChoice, shortAnswer, trueFalse];
  assert.equal(countAnsweredQuizQuestions(questions, { 0: 0, 2: 1 }, { 1: 'Response' }), 3);
  assert.equal(countAnsweredQuizQuestions(questions, { 0: 0 }, { 1: 'Response' }), 2);
});

test('legacy short answers use the same question type inference as the input', () => {
  const questions = [
    { ...shortAnswer, type: undefined },
    { ...multipleChoice, answerText: 'Expected answer' },
  ];
  assert.equal(countAnsweredQuizQuestions(questions, {}, { 0: 'One', 1: 'Two' }), 2);
});

test('stale answers, invalid options, and text for option questions do not enable submission', () => {
  assert.equal(countAnsweredQuizQuestions([shortAnswer, multipleChoice], { 0: 0, 1: -1, 5: 0 }, { 1: 'Text', 5: 'Stale' }), 0);
  for (const answer of [3, 0.5, undefined]) {
    assert.equal(countAnsweredQuizQuestions([multipleChoice], { 0: answer }, {}), 0);
  }
});
