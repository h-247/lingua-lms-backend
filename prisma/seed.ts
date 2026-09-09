import {
  AssessmentAudience,
  AssessmentKind,
  AssessmentStatus,
  ClassStatus,
  GroupStatus,
  Level,
  PrismaClient,
  QuestionType,
  UserRole,
  UserStatus,
} from "@prisma/client";
import * as argon2 from "argon2";
import { createHash } from "crypto";

const prisma = new PrismaClient();

function stableUuid(name: string): string {
  const bytes = Buffer.from(
    createHash("sha256").update(`lingua-load:${name}`).digest().subarray(0, 16),
  );
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function main(): Promise<void> {
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 12)
    throw new Error(
      "Set SEED_PASSWORD to a synthetic test-only value with at least 12 characters.",
    );
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_SYNTHETIC_SEED !== "true"
  )
    throw new Error("Synthetic seed is disabled in production.");
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
  const adminId = stableUuid("admin");
  const teacherId = stableUuid("teacher");
  const classId = stableUuid("class");
  const g1 = stableUuid("group:g1");
  const g2 = stableUuid("group:g2");
  const homeworkId = stableUuid("assessment:homework");
  const quizId = stableUuid("assessment:quiz");
  const practiceId = stableUuid("assessment:practice");
  const dueAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await prisma.user.upsert({
    where: { email: "admin@seed.invalid" },
    update: {},
    create: {
      id: adminId,
      email: "admin@seed.invalid",
      displayName: "Synthetic Admin",
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      passwordHash,
      mustChangePassword: false,
    },
  });
  await prisma.user.upsert({
    where: { email: "teacher@seed.invalid" },
    update: {},
    create: {
      id: teacherId,
      email: "teacher@seed.invalid",
      displayName: "Synthetic Teacher",
      role: UserRole.TEACHER,
      status: UserStatus.ACTIVE,
      passwordHash,
      mustChangePassword: false,
    },
  });
  const students = Array.from({ length: 300 }, (_, index) => ({
    id: stableUuid(`student:${index + 1}`),
    email: `student${String(index + 1).padStart(3, "0")}@seed.invalid`,
    displayName: `Synthetic Student ${String(index + 1).padStart(3, "0")}`,
    role: UserRole.STUDENT,
    status: UserStatus.ACTIVE,
    passwordHash,
    mustChangePassword: false,
  }));
  await prisma.user.createMany({ data: students, skipDuplicates: true });
  await prisma.learningClass.upsert({
    where: { id: classId },
    update: { status: ClassStatus.ACTIVE, teacherId },
    create: {
      id: classId,
      code: "LOAD-B1-300",
      name: "Synthetic B1 Load Class",
      level: Level.B1,
      teacherId,
      status: ClassStatus.ACTIVE,
    },
  });
  await prisma.enrollment.createMany({
    data: students.map((student) => ({ classId, studentId: student.id })),
    skipDuplicates: true,
  });
  await prisma.learnerGroup.upsert({
    where: { id: g1 },
    update: {},
    create: {
      id: g1,
      classId,
      name: "Reading Support",
      nameKey: "reading support",
      status: GroupStatus.ACTIVE,
    },
  });
  await prisma.learnerGroup.upsert({
    where: { id: g2 },
    update: {},
    create: {
      id: g2,
      classId,
      name: "Vocabulary Support",
      nameKey: "vocabulary support",
      status: GroupStatus.ACTIVE,
    },
  });
  await prisma.groupMembership.createMany({
    data: students
      .slice(0, 200)
      .map((student) => ({ groupId: g1, studentId: student.id })),
    skipDuplicates: true,
  });
  await prisma.groupMembership.createMany({
    data: students
      .slice(100)
      .map((student) => ({ groupId: g2, studentId: student.id })),
    skipDuplicates: true,
  });

  const questions = (assessmentId: string) =>
    Array.from({ length: 10 }, (_, index) => {
      const questionId = stableUuid(`${assessmentId}:q:${index}`);
    return {
      id: questionId,
      type: QuestionType.SINGLE_CHOICE,
        prompt: `Synthetic question ${index + 1}`,
        explanation: `Synthetic explanation ${index + 1}`,
        points: 1,
        position: index,
        options: {
          create: [0, 1, 2, 3].map((option) => ({
            id: stableUuid(`${questionId}:o:${option}`),
            text: `Option ${option + 1}`,
            isCorrect: option === 0,
            position: option,
          })),
        },
      };
    });
  await prisma.assessment.upsert({
    where: { id: homeworkId },
    update: { dueAt },
    create: {
      id: homeworkId,
      classId,
      createdById: teacherId,
      kind: AssessmentKind.HOMEWORK,
      status: AssessmentStatus.PUBLISHED,
      audience: AssessmentAudience.SELECTED_GROUPS,
      title: "Synthetic Homework",
      maxPoints: 10,
      dueAt,
      publishedAt: new Date(),
      groups: { create: [{ groupId: g1 }, { groupId: g2 }] },
    },
  });
  await prisma.assessment.upsert({
    where: { id: quizId },
    update: { dueAt },
    create: {
      id: quizId,
      classId,
      createdById: teacherId,
      kind: AssessmentKind.GRADED_QUIZ,
      status: AssessmentStatus.PUBLISHED,
      audience: AssessmentAudience.WHOLE_CLASS,
      title: "Synthetic Official Quiz",
      maxPoints: 10,
      dueAt,
      publishedAt: new Date(),
      questions: { create: questions(quizId) },
    },
  });
  await prisma.assessment.upsert({
    where: { id: practiceId },
    update: {},
    create: {
      id: practiceId,
      classId,
      createdById: teacherId,
      kind: AssessmentKind.PRACTICE_QUIZ,
      status: AssessmentStatus.PUBLISHED,
      audience: AssessmentAudience.WHOLE_CLASS,
      title: "Synthetic Practice Quiz",
      maxPoints: 10,
      publishedAt: new Date(),
      questions: { create: questions(practiceId) },
    },
  });
  await prisma.assessmentRecipient.createMany({
    data: [homeworkId, quizId, practiceId].flatMap((assessmentId) =>
      students.map((student) => ({ assessmentId, studentId: student.id })),
    ),
    skipDuplicates: true,
  });
  process.stdout.write(
    "Synthetic fixture ready: 300 students, 2 overlapping groups, 3 assessments.\n",
  );
}

main().finally(() => prisma.$disconnect());
