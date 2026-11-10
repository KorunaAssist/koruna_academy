import type { QuizQuestion } from './db';

export function isQuizAnswerCorrect(question: QuizQuestion, option: number | undefined, text: string | undefined): boolean {
  if (getQuizQuestionType(question) === 'short_answer') {
    const response = (text || '').trim().toLowerCase();
    const expected = (question.answerText || question.options?.[0] || '').trim().toLowerCase();
    return Boolean(response && expected && (response === expected || response.includes(expected) || expected.includes(response)));
  }
  return option !== undefined && option === question.correctAnswer;
}

export function getQuizQuestionType(question: QuizQuestion): NonNullable<QuizQuestion['type']> {
  return question.type || (
    question.options?.length === 2 && question.options[0]?.toLowerCase() === 'true'
      ? 'true_false'
      : !question.options?.length || question.answerText
        ? 'short_answer'
        : 'multiple_choice'
  );
}

export function countAnsweredQuizQuestions(
  questions: QuizQuestion[],
  optionAnswers: Record<number, number>,
  textAnswers: Record<number, string>,
): number {
  return questions.filter((question, index) => {
    if (getQuizQuestionType(question) === 'short_answer') {
      return Boolean(textAnswers[index]?.trim());
    }
    const option = optionAnswers[index];
    return Number.isInteger(option) && option >= 0 && option < question.options.length;
  }).length;
}
