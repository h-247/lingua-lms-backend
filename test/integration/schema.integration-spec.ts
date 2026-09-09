import {
  AssessmentAudience,
  AssessmentKind,
  AssessmentStatus,
  ClassStatus,
  Level,
  PrismaClient,
  UserRole,
} from "@prisma/client";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("PostgreSQL domain constraints", () => {
  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl ?? process.env.DATABASE_URL! } },
  });

  beforeAll(async () => prisma.$connect());
  afterAll(async () => prisma.$disconnect());

  it("prevents a second active practice draft for the same learner", async () => {
    const suffix = `${Date.now()}-${Math.random()}`;
    const hash = "test-only-hash";
    const teacher = await prisma.user.create({
      data: {
        email: `teacher-${suffix}@test.invalid`,
        displayName: "Teacher",
        role: UserRole.TEACHER,
        passwordHash: hash,
      },
    });
    const student = await prisma.user.create({
      data: {
        email: `student-${suffix}@test.invalid`,
        displayName: "Student",
        role: UserRole.STUDENT,
        passwordHash: hash,
      },
    });
    const learningClass = await prisma.learningClass.create({
      data: {
        code: `T-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name: "Test",
        level: Level.A1,
        teacherId: teacher.id,
        status: ClassStatus.ACTIVE,
      },
    });
    await prisma.enrollment.create({
      data: { classId: learningClass.id, studentId: student.id },
    });
    const assessment = await prisma.assessment.create({
      data: {
        classId: learningClass.id,
        createdById: teacher.id,
        kind: AssessmentKind.PRACTICE_QUIZ,
        status: AssessmentStatus.PUBLISHED,
        audience: AssessmentAudience.WHOLE_CLASS,
        title: "Practice",
        maxPoints: 1,
        publishedAt: new Date(),
      },
    });
    await prisma.assessmentRecipient.create({
      data: { assessmentId: assessment.id, studentId: student.id },
    });
    await prisma.practiceAttempt.create({
      data: {
        assessmentId: assessment.id,
        studentId: student.id,
        attemptNumber: 1,
      },
    });
    await expect(
      prisma.practiceAttempt.create({
        data: {
          assessmentId: assessment.id,
          studentId: student.id,
          attemptNumber: 2,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
});
