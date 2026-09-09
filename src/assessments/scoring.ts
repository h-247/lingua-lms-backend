import { createHash } from "crypto";

export interface ScoringQuestion {
  id: string;
  points: number;
  explanation?: string | null;
  options: Array<{ id: string; isCorrect: boolean }>;
}

export interface ScoreResult {
  earnedPoints: number;
  maxPoints: number;
  percentage: number;
  details: Array<{
    questionId: string;
    selectedOptionId: string | null;
    correctOptionId: string;
    correct: boolean;
    earnedPoints: number;
    maxPoints: number;
    explanation?: string | null;
  }>;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

export function canonicalHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

export function scoreQuiz(
  questions: ScoringQuestion[],
  answers: Record<string, string>,
): ScoreResult {
  const questionMap = new Map(
    questions.map((question) => [question.id, question]),
  );
  for (const [questionId, optionId] of Object.entries(answers)) {
    const question = questionMap.get(questionId);
    if (!question || !question.options.some((option) => option.id === optionId))
      throw new Error("INVALID_ANSWER_ID");
  }
  const maxPoints = questions.reduce(
    (sum, question) => sum + question.points,
    0,
  );
  const details = questions.map((question) => {
    const selectedOptionId = answers[question.id] ?? null;
    const correctOption = question.options.find((option) => option.isCorrect);
    if (!correctOption) throw new Error("INVALID_QUESTION_KEY");
    const correct = Boolean(
      selectedOptionId && correctOption.id === selectedOptionId,
    );
    return {
      questionId: question.id,
      selectedOptionId,
      correctOptionId: correctOption.id,
      correct,
      earnedPoints: correct ? question.points : 0,
      maxPoints: question.points,
      explanation: question.explanation ?? null,
    };
  });
  const earnedPoints = details.reduce(
    (sum, item) => sum + item.earnedPoints,
    0,
  );
  const percentage = maxPoints
    ? Math.round((earnedPoints / maxPoints) * 10_000) / 100
    : 0;
  return { earnedPoints, maxPoints, percentage, details };
}
