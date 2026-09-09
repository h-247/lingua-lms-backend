import { canonicalHash, scoreQuiz } from "../src/assessments/scoring";

describe("quiz scoring", () => {
  const questions = [
    {
      id: "q1",
      points: 2,
      explanation: "Because A",
      options: [
        { id: "a", isCorrect: true },
        { id: "b", isCorrect: false },
      ],
    },
    {
      id: "q2",
      points: 3,
      explanation: "Because D",
      options: [
        { id: "c", isCorrect: false },
        { id: "d", isCorrect: true },
      ],
    },
  ];

  it("scores unanswered as zero and rounds percentage to two decimals", () => {
    expect(scoreQuiz(questions, { q1: "a" })).toMatchObject({
      earnedPoints: 2,
      maxPoints: 5,
      percentage: 40,
    });
  });

  it("rejects unknown question and option ids", () => {
    expect(() => scoreQuiz(questions, { missing: "a" })).toThrow(
      "INVALID_ANSWER_ID",
    );
    expect(() => scoreQuiz(questions, { q1: "missing" })).toThrow(
      "INVALID_ANSWER_ID",
    );
  });

  it("returns stable canonical hashes regardless of object key order", () => {
    expect(canonicalHash({ b: 2, a: { d: 4, c: 3 } })).toBe(
      canonicalHash({ a: { c: 3, d: 4 }, b: 2 }),
    );
  });
});
