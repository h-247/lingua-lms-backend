import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AssessmentAudience,
  AssessmentKind,
  AssessmentStatus,
  ClassStatus,
  EnrollmentStatus,
  FileContext,
  GroupStatus,
  MaterialVisibility,
  PracticeAttemptStatus,
  Prisma,
  QuestionType,
  SubmissionStatus,
  UserRole,
  UserStatus,
} from "@prisma/client";
import { randomUUID } from "crypto";
import { Express } from "express";
import { AuditService } from "../audit/audit.service";
import { ClassAccessService } from "../classes/class-access.service";
import { pagination } from "../common/pagination.dto";
import { AuthenticatedUser } from "../common/types";
import { parseDeadline } from "../common/time";
import { FileStorageService } from "../materials/file-storage.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  DraftPayloadDto,
  ExtendDeadlineDto,
  GradeHomeworkDto,
  ListAssessmentsDto,
  PracticeDraftDto,
  SubmitPayloadDto,
  UpsertAssessmentDto,
} from "./assessments.dto";
import { canonicalHash, scoreQuiz } from "./scoring";

const questionInclude = {
  options: { orderBy: [{ position: "asc" as const }, { id: "asc" as const }] },
};

@Injectable()
export class AssessmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClassAccessService,
    private readonly audit: AuditService,
    private readonly storage: FileStorageService,
  ) {}

  async list(
    user: AuthenticatedUser,
    classId: string,
    dto: ListAssessmentsDto,
  ) {
    await this.access.anyReadableClass(user, classId);
    const where = {
      classId,
      ...(dto.kind ? { kind: dto.kind } : {}),
      ...(dto.status ? { status: dto.status } : {}),
      ...(user.role === UserRole.STUDENT
        ? {
            status: {
              in: [AssessmentStatus.PUBLISHED, AssessmentStatus.CLOSED],
            },
            recipients: { some: { studentId: user.id } },
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.assessment.findMany({
        where,
        select: {
          id: true,
          classId: true,
          kind: true,
          status: true,
          audience: true,
          title: true,
          dueAt: true,
          allowLate: true,
          maxPoints: true,
          publishedAt: true,
          closedAt: true,
        },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        ...pagination(dto),
      }),
      this.prisma.assessment.count({ where }),
    ]);
    return { items, page: dto.page, pageSize: dto.pageSize, total };
  }

  async detail(user: AuthenticatedUser, id: string) {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id },
      include: {
        questions: {
          include: questionInclude,
          orderBy: [{ position: "asc" }, { id: "asc" }],
        },
        groups: true,
        materials: true,
      },
    });
    if (!assessment) throw this.notFound();
    if (user.role === UserRole.STUDENT) {
      await this.requireStudentAssessment(user, id, false);
      if (assessment.status === AssessmentStatus.DRAFT) throw this.notFound();
      const revealOfficialKey =
        assessment.kind === AssessmentKind.GRADED_QUIZ &&
        assessment.status === AssessmentStatus.CLOSED;
      return {
        ...assessment,
        groups: undefined,
        questions: assessment.questions.map((question) => ({
          ...question,
          explanation: revealOfficialKey ? question.explanation : undefined,
          options: question.options.map((option) =>
            revealOfficialKey
              ? option
              : { id: option.id, text: option.text, position: option.position },
          ),
        })),
      };
    }
    await this.access.staffClass(user, assessment.classId);
    return assessment;
  }

  async create(
    user: AuthenticatedUser,
    classId: string,
    dto: UpsertAssessmentDto,
  ) {
    await this.requireEditableClass(user, classId);
    const data = await this.validateDraft(classId, dto);
    const assessment = await this.prisma.assessment.create({
      data: { ...data, classId, createdById: user.id },
      include: { questions: { include: questionInclude } },
    });
    await this.audit.create({
      actorId: user.id,
      classId,
      action: "ASSESSMENT_CREATED",
      resourceType: "Assessment",
      resourceId: assessment.id,
      details: { kind: assessment.kind },
    });
    return assessment;
  }

  async update(user: AuthenticatedUser, id: string, dto: UpsertAssessmentDto) {
    const current = await this.requireStaffAssessment(user, id);
    if (current.status !== AssessmentStatus.DRAFT)
      throw new ConflictException({
        code: "ASSESSMENT_LOCKED",
        message: "Bài đã phát hành nên không thể sửa nội dung.",
      });
    if (dto.kind !== current.kind)
      throw new ConflictException({
        code: "KIND_IMMUTABLE",
        message: "Không được đổi loại bài.",
      });
    const data = await this.validateDraft(current.classId, dto);
    return this.prisma.$transaction(async (tx) => {
      await tx.questionOption.deleteMany({
        where: { question: { assessmentId: id } },
      });
      await tx.assessmentQuestion.deleteMany({ where: { assessmentId: id } });
      await tx.assessmentGroup.deleteMany({ where: { assessmentId: id } });
      await tx.assessmentMaterial.deleteMany({ where: { assessmentId: id } });
      const updated = await tx.assessment.update({
        where: { id },
        data,
        include: { questions: { include: questionInclude } },
      });
      await this.audit.create(
        {
          actorId: user.id,
          classId: current.classId,
          action: "ASSESSMENT_UPDATED",
          resourceType: "Assessment",
          resourceId: id,
        },
        tx,
      );
      return updated;
    });
  }

  async preview(user: AuthenticatedUser, id: string) {
    const assessment = await this.requireStaffAssessment(user, id);
    const ids = await this.eligibleStudentIds(
      assessment.id,
      assessment.classId,
      assessment.audience,
    );
    return {
      eligibleCount: ids.length,
      studentIds: ids.slice(0, 100),
      truncated: ids.length > 100,
    };
  }

  async publish(user: AuthenticatedUser, id: string) {
    const assessment = await this.requireStaffAssessment(user, id);
    if (assessment.status !== AssessmentStatus.DRAFT)
      throw new ConflictException({
        code: "ASSESSMENT_NOT_DRAFT",
        message: "Bài không ở trạng thái nháp.",
      });
    await this.requireEditableClass(user, assessment.classId);
    const full = await this.prisma.assessment.findUniqueOrThrow({
      where: { id },
      include: {
        questions: { include: { options: true } },
        groups: { include: { group: true } },
      },
    });
    this.validatePublishable(full);
    const ids = await this.eligibleStudentIds(
      id,
      assessment.classId,
      assessment.audience,
    );
    if (!ids.length)
      throw new ConflictException({
        code: "NO_RECIPIENTS",
        message: "Không có học viên đủ điều kiện nhận bài.",
      });
    return this.prisma.$transaction(
      async (tx) => {
        const changed = await tx.assessment.updateMany({
          where: { id, status: AssessmentStatus.DRAFT },
          data: { status: AssessmentStatus.PUBLISHED, publishedAt: new Date() },
        });
        if (changed.count !== 1)
          throw new ConflictException({
            code: "PUBLISH_RACE",
            message: "Bài đã được xử lý bởi yêu cầu khác.",
          });
        await tx.assessmentRecipient.createMany({
          data: ids.map((studentId) => ({ assessmentId: id, studentId })),
          skipDuplicates: true,
        });
        await this.audit.create(
          {
            actorId: user.id,
            classId: assessment.classId,
            action: "ASSESSMENT_PUBLISHED",
            resourceType: "Assessment",
            resourceId: id,
            details: { recipientCount: ids.length },
          },
          tx,
        );
        return {
          id,
          status: AssessmentStatus.PUBLISHED,
          recipientCount: ids.length,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async close(user: AuthenticatedUser, id: string) {
    const assessment = await this.requireStaffAssessment(user, id);
    if (assessment.status !== AssessmentStatus.PUBLISHED)
      throw new ConflictException({
        code: "ASSESSMENT_NOT_PUBLISHED",
        message: "Chỉ có thể đóng bài đã phát hành.",
      });
    const updated = await this.prisma.assessment.update({
      where: { id },
      data: { status: AssessmentStatus.CLOSED, closedAt: new Date() },
    });
    await this.audit.create({
      actorId: user.id,
      classId: assessment.classId,
      action: "ASSESSMENT_CLOSED",
      resourceType: "Assessment",
      resourceId: id,
    });
    return updated;
  }

  async extend(user: AuthenticatedUser, id: string, dto: ExtendDeadlineDto) {
    const assessment = await this.requireStaffAssessment(user, id);
    if (
      assessment.kind === AssessmentKind.PRACTICE_QUIZ ||
      assessment.status !== AssessmentStatus.PUBLISHED
    ) {
      throw new ConflictException({
        code: "DEADLINE_NOT_EXTENDABLE",
        message: "Không thể gia hạn bài này.",
      });
    }
    const dueAt = parseDeadline(dto.dueAt);
    if (!assessment.dueAt || dueAt <= assessment.dueAt || dueAt <= new Date()) {
      throw new BadRequestException({
        code: "DEADLINE_INVALID",
        message: "Hạn mới phải muộn hơn hạn hiện tại và ở tương lai.",
      });
    }
    await this.requireEditableClass(user, assessment.classId);
    const updated = await this.prisma.assessment.update({
      where: { id },
      data: { dueAt },
    });
    const ids = await this.eligibleStudentIds(
      id,
      assessment.classId,
      assessment.audience,
    );
    await this.prisma.assessmentRecipient.createMany({
      data: ids.map((studentId) => ({ assessmentId: id, studentId })),
      skipDuplicates: true,
    });
    await this.audit.create({
      actorId: user.id,
      classId: assessment.classId,
      action: "ASSESSMENT_DEADLINE_EXTENDED",
      resourceType: "Assessment",
      resourceId: id,
      reason: dto.reason.trim(),
      details: {
        from: assessment.dueAt.toISOString(),
        to: dueAt.toISOString(),
      },
    });
    return { ...updated, reconciledRecipientCount: ids.length };
  }

  async duplicate(user: AuthenticatedUser, id: string) {
    const source = await this.requireStaffAssessment(user, id);
    if (source.kind === AssessmentKind.PRACTICE_QUIZ) {
      // Same-kind duplication is allowed; mode conversion is intentionally absent.
    }
    const full = await this.prisma.assessment.findUniqueOrThrow({
      where: { id },
      include: {
        groups: true,
        materials: true,
        questions: { include: { options: true } },
      },
    });
    const copy = await this.prisma.assessment.create({
      data: {
        classId: full.classId,
        createdById: user.id,
        kind: full.kind,
        audience: full.audience,
        title: `${full.title} (bản sao)`,
        instructions: full.instructions,
        maxPoints: full.maxPoints,
        dueAt: full.dueAt,
        allowLate: full.allowLate,
        groups: {
          create: full.groups.map((item) => ({ groupId: item.groupId })),
        },
        materials: {
          create: full.materials.map((item) => ({
            materialId: item.materialId,
          })),
        },
        questions: {
          create: full.questions.map((question) => ({
            type: question.type,
            prompt: question.prompt,
            explanation: question.explanation,
            points: question.points,
            position: question.position,
            options: {
              create: question.options.map((option) => ({
                text: option.text,
                isCorrect: option.isCorrect,
                position: option.position,
              })),
            },
          })),
        },
      },
    });
    await this.audit.create({
      actorId: user.id,
      classId: full.classId,
      action: "ASSESSMENT_DUPLICATED",
      resourceType: "Assessment",
      resourceId: copy.id,
      details: { sourceId: id },
    });
    return copy;
  }

  async getOfficialDraft(user: AuthenticatedUser, assessmentId: string) {
    await this.requireStudentAssessment(user, assessmentId, false);
    return (
      (await this.prisma.submission.findUnique({
        where: { assessmentId_studentId: { assessmentId, studentId: user.id } },
      })) ?? { status: "NOT_STARTED", revision: 0 }
    );
  }

  async saveOfficialDraft(
    user: AuthenticatedUser,
    assessmentId: string,
    dto: DraftPayloadDto,
  ) {
    const assessment = await this.requireStudentAssessment(
      user,
      assessmentId,
      true,
    );
    if (assessment.kind === AssessmentKind.PRACTICE_QUIZ)
      throw new BadRequestException({
        code: "OFFICIAL_ONLY",
        message: "Dùng API luyện tập cho bài này.",
      });
    await this.validateOfficialPayload(assessment, user.id, dto, false);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.submission.findUnique({
        where: { assessmentId_studentId: { assessmentId, studentId: user.id } },
      });
      if (existing && existing.status !== SubmissionStatus.DRAFT)
        throw new ConflictException({
          code: "SUBMISSION_FINAL",
          message: "Bài đã nộp và không thể sửa.",
        });
      if (existing && existing.revision !== dto.expectedRevision)
        throw this.revisionConflict(existing.revision);
      const data = {
        textAnswer: dto.textAnswer?.trim() || null,
        answers: (dto.answers ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        attachmentId: dto.attachmentId ?? null,
      };
      if (
        existing &&
        canonicalHash({
          textAnswer: existing.textAnswer,
          answers: existing.answers,
          attachmentId: existing.attachmentId,
        }) === canonicalHash(data)
      )
        return existing;
      if (!existing) {
        if (dto.expectedRevision !== 0) throw this.revisionConflict(0);
        return tx.submission.create({
          data: { assessmentId, studentId: user.id, revision: 1, ...data },
        });
      }
      const changed = await tx.submission.updateMany({
        where: {
          id: existing.id,
          revision: dto.expectedRevision,
          status: SubmissionStatus.DRAFT,
        },
        data: { ...data, revision: { increment: 1 } },
      });
      if (!changed.count) throw this.revisionConflict(existing.revision);
      return tx.submission.findUniqueOrThrow({ where: { id: existing.id } });
    });
  }

  async submitOfficial(
    user: AuthenticatedUser,
    assessmentId: string,
    dto: SubmitPayloadDto,
    idempotencyKey: string,
  ) {
    if (!idempotencyKey || idempotencyKey.length > 120)
      throw new BadRequestException({
        code: "IDEMPOTENCY_REQUIRED",
        message: "Cần Idempotency-Key hợp lệ.",
      });
    const readable = await this.requireStudentAssessment(
      user,
      assessmentId,
      false,
    );
    if (readable.kind === AssessmentKind.PRACTICE_QUIZ)
      throw new BadRequestException({
        code: "OFFICIAL_ONLY",
        message: "Dùng API luyện tập cho bài này.",
      });
    const payload = {
      textAnswer: dto.textAnswer?.trim() || null,
      answers: dto.answers ?? {},
      attachmentId: dto.attachmentId ?? null,
    };
    const payloadHash = canonicalHash(payload);
    const existingFinal = await this.prisma.submission.findUnique({
      where: { assessmentId_studentId: { assessmentId, studentId: user.id } },
    });
    if (existingFinal && existingFinal.status !== SubmissionStatus.DRAFT) {
      if (
        existingFinal.idempotencyKey === idempotencyKey &&
        existingFinal.payloadHash === payloadHash
      )
        return this.submissionReceipt(existingFinal);
      throw new ConflictException({
        code: "SUBMISSION_FINAL",
        message: "Bài đã được nộp với nội dung khác.",
      });
    }
    const assessment = await this.requireStudentAssessment(
      user,
      assessmentId,
      true,
    );
    await this.validateOfficialPayload(assessment, user.id, dto, true);
    return this.prisma.$transaction(
      async (tx) => {
        const locked = await this.lockAcceptingAssessment(tx, assessmentId);
        const current = await tx.submission.findUnique({
          where: {
            assessmentId_studentId: { assessmentId, studentId: user.id },
          },
        });
        if (current && current.status !== SubmissionStatus.DRAFT) {
          if (
            current.idempotencyKey === idempotencyKey &&
            current.payloadHash === payloadHash
          )
            return this.submissionReceipt(current);
          throw new ConflictException({
            code: "SUBMISSION_FINAL",
            message: "Bài đã được nộp.",
          });
        }
        if ((current?.revision ?? 0) !== dto.expectedRevision)
          throw this.revisionConflict(current?.revision ?? 0);
        const now = new Date();
        const isLate = Boolean(locked.dueAt && now > locked.dueAt);
        let score: ReturnType<typeof scoreQuiz> | null = null;
        if (assessment.kind === AssessmentKind.GRADED_QUIZ)
          score = this.scoreAssessment(assessment.questions, dto.answers ?? {});
        const finalData = {
          ...payload,
          answers: payload.answers as Prisma.InputJsonValue,
          status: score ? SubmissionStatus.GRADED : SubmissionStatus.SUBMITTED,
          revision: (current?.revision ?? 0) + 1,
          receiptId: randomUUID(),
          idempotencyKey,
          payloadHash,
          submittedAt: now,
          isLate,
          ...(score
            ? {
                earnedPoints: score.earnedPoints,
                maxPoints: score.maxPoints,
                percentage: score.percentage,
                gradedAt: now,
              }
            : {}),
        };
        const saved = current
          ? await tx.submission.update({
              where: { id: current.id },
              data: finalData,
            })
          : await tx.submission.create({
              data: { assessmentId, studentId: user.id, ...finalData },
            });
        return this.submissionReceipt(saved);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 8_000,
      },
    );
  }

  async ownResult(user: AuthenticatedUser, assessmentId: string) {
    const assessment = await this.requireStudentAssessment(
      user,
      assessmentId,
      false,
    );
    const submission = await this.prisma.submission.findUnique({
      where: { assessmentId_studentId: { assessmentId, studentId: user.id } },
    });
    if (!submission || submission.status === SubmissionStatus.DRAFT)
      throw new NotFoundException({
        code: "RESULT_NOT_FOUND",
        message: "Chưa có kết quả.",
      });
    const reveal =
      assessment.kind === AssessmentKind.GRADED_QUIZ &&
      assessment.status === AssessmentStatus.CLOSED;
    return {
      ...submission,
      ...(reveal
        ? {
            review: this.scoreAssessment(
              assessment.questions,
              (submission.answers ?? {}) as Record<string, string>,
            ).details,
          }
        : {}),
    };
  }

  async uploadHomeworkAttachment(
    user: AuthenticatedUser,
    assessmentId: string,
    file?: Express.Multer.File,
  ) {
    const assessment = await this.requireStudentAssessment(
      user,
      assessmentId,
      true,
    );
    if (assessment.kind !== AssessmentKind.HOMEWORK)
      throw new BadRequestException({
        code: "HOMEWORK_ONLY",
        message: "Tệp đính kèm chỉ dùng cho bài tập.",
      });
    if (!file)
      throw new BadRequestException({
        code: "FILE_REQUIRED",
        message: "Thiếu tệp tải lên.",
      });
    return this.storage.finalize({
      tempPath: file.path,
      originalName: file.originalname,
      declaredMime: file.mimetype,
      byteCount: file.size,
      classId: assessment.classId,
      uploaderId: user.id,
      ownerStudentId: user.id,
      context: FileContext.HOMEWORK_ATTACHMENT,
    });
  }

  async grade(
    user: AuthenticatedUser,
    submissionId: string,
    dto: GradeHomeworkDto,
  ) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: { assessment: true },
    });
    if (
      !submission ||
      submission.assessment.kind !== AssessmentKind.HOMEWORK ||
      submission.status === SubmissionStatus.DRAFT
    )
      throw new NotFoundException({
        code: "SUBMISSION_NOT_FOUND",
        message: "Không tìm thấy bài nộp.",
      });
    await this.access.staffClass(user, submission.assessment.classId);
    const maxPoints = Number(submission.assessment.maxPoints);
    if (dto.earnedPoints > maxPoints)
      throw new BadRequestException({
        code: "GRADE_OUT_OF_RANGE",
        message: "Điểm vượt quá điểm tối đa.",
      });
    const correction = submission.status === SubmissionStatus.GRADED;
    if (correction && !dto.reason?.trim())
      throw new BadRequestException({
        code: "CORRECTION_REASON_REQUIRED",
        message: "Cần lý do sửa điểm.",
      });
    const percentage =
      Math.round((dto.earnedPoints / maxPoints) * 10_000) / 100;
    const updated = await this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: SubmissionStatus.GRADED,
        earnedPoints: dto.earnedPoints,
        maxPoints,
        percentage,
        feedback: dto.feedback?.trim() || null,
        gradedById: user.id,
        gradedAt: new Date(),
      },
    });
    await this.audit.create({
      actorId: user.id,
      classId: submission.assessment.classId,
      action: correction ? "GRADE_CORRECTED" : "HOMEWORK_GRADED",
      resourceType: "Submission",
      resourceId: submissionId,
      reason: dto.reason?.trim(),
      details: {
        oldPoints: submission.earnedPoints?.toString() ?? null,
        newPoints: dto.earnedPoints,
      },
    });
    return updated;
  }

  async startPractice(user: AuthenticatedUser, assessmentId: string) {
    const assessment = await this.requireStudentAssessment(
      user,
      assessmentId,
      true,
    );
    if (assessment.kind !== AssessmentKind.PRACTICE_QUIZ)
      throw new BadRequestException({
        code: "PRACTICE_ONLY",
        message: "Đây không phải bài luyện tập.",
      });
    const maxAttempts = 4;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const existing = await tx.practiceAttempt.findFirst({
              where: {
                assessmentId,
                studentId: user.id,
                status: PracticeAttemptStatus.DRAFT,
              },
            });
            if (existing) return existing;
            const latest = await tx.practiceAttempt.aggregate({
              where: { assessmentId, studentId: user.id },
              _max: { attemptNumber: true },
            });
            return tx.practiceAttempt.create({
              data: {
                assessmentId,
                studentId: user.id,
                attemptNumber: (latest._max.attemptNumber ?? 0) + 1,
              },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          return this.prisma.practiceAttempt.findFirstOrThrow({
            where: {
              assessmentId,
              studentId: user.id,
              status: PracticeAttemptStatus.DRAFT,
            },
          });
        }
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034" &&
          attempt < maxAttempts
        ) {
          await new Promise((resolve) =>
            setTimeout(resolve, 10 * 2 ** (attempt - 1) + Math.random() * 20),
          );
          continue;
        }
        throw error;
      }
    }
    throw new Error("Practice transaction retry loop exhausted");
  }

  async savePractice(
    user: AuthenticatedUser,
    assessmentId: string,
    attemptId: string,
    dto: PracticeDraftDto,
  ) {
    await this.requireStudentAssessment(user, assessmentId, true);
    this.validateAnswerIds(await this.loadQuestions(assessmentId), dto.answers);
    const changed = await this.prisma.practiceAttempt.updateMany({
      where: {
        id: attemptId,
        assessmentId,
        studentId: user.id,
        status: PracticeAttemptStatus.DRAFT,
        revision: dto.expectedRevision,
      },
      data: { answers: dto.answers, revision: { increment: 1 } },
    });
    if (!changed.count) {
      const current = await this.prisma.practiceAttempt.findFirst({
        where: { id: attemptId, assessmentId, studentId: user.id },
      });
      if (!current)
        throw new NotFoundException({
          code: "ATTEMPT_NOT_FOUND",
          message: "Không tìm thấy lượt luyện tập.",
        });
      if (current.status !== PracticeAttemptStatus.DRAFT)
        throw new ConflictException({
          code: "ATTEMPT_FINAL",
          message: "Lượt luyện tập đã hoàn tất.",
        });
      throw this.revisionConflict(current.revision);
    }
    return this.prisma.practiceAttempt.findUniqueOrThrow({
      where: { id: attemptId },
    });
  }

  async submitPractice(
    user: AuthenticatedUser,
    assessmentId: string,
    attemptId: string,
    dto: PracticeDraftDto,
    idempotencyKey: string,
  ) {
    if (!idempotencyKey || idempotencyKey.length > 120)
      throw new BadRequestException({
        code: "IDEMPOTENCY_REQUIRED",
        message: "Cần Idempotency-Key hợp lệ.",
      });
    const readable = await this.requireStudentAssessment(
      user,
      assessmentId,
      false,
    );
    if (readable.kind !== AssessmentKind.PRACTICE_QUIZ)
      throw new BadRequestException({
        code: "PRACTICE_ONLY",
        message: "Đây không phải bài luyện tập.",
      });
    const payloadHash = canonicalHash(dto.answers);
    const prior = await this.prisma.practiceAttempt.findFirst({
      where: { id: attemptId, assessmentId, studentId: user.id },
    });
    if (!prior)
      throw new NotFoundException({
        code: "ATTEMPT_NOT_FOUND",
        message: "Không tìm thấy lượt luyện tập.",
      });
    if (prior.status === PracticeAttemptStatus.GRADED) {
      if (
        prior.idempotencyKey === idempotencyKey &&
        prior.payloadHash === payloadHash
      )
        return this.practiceResult(prior, readable.questions);
      throw new ConflictException({
        code: "ATTEMPT_FINAL",
        message: "Lượt luyện tập đã hoàn tất.",
      });
    }
    const assessment = await this.requireStudentAssessment(
      user,
      assessmentId,
      true,
    );
    return this.prisma.$transaction(
      async (tx) => {
        await this.lockAcceptingAssessment(tx, assessmentId);
        const current = await tx.practiceAttempt.findFirst({
          where: { id: attemptId, assessmentId, studentId: user.id },
        });
        if (!current)
          throw new NotFoundException({
            code: "ATTEMPT_NOT_FOUND",
            message: "Không tìm thấy lượt luyện tập.",
          });
        if (current.status === PracticeAttemptStatus.GRADED) {
          if (
            current.idempotencyKey === idempotencyKey &&
            current.payloadHash === payloadHash
          )
            return this.practiceResult(current, assessment.questions);
          throw new ConflictException({
            code: "ATTEMPT_FINAL",
            message: "Lượt luyện tập đã hoàn tất.",
          });
        }
        if (current.revision !== dto.expectedRevision)
          throw this.revisionConflict(current.revision);
        const score = this.scoreAssessment(assessment.questions, dto.answers);
        const saved = await tx.practiceAttempt.update({
          where: { id: attemptId },
          data: {
            status: PracticeAttemptStatus.GRADED,
            answers: dto.answers,
            revision: { increment: 1 },
            receiptId: randomUUID(),
            idempotencyKey,
            payloadHash,
            submittedAt: new Date(),
            earnedPoints: score.earnedPoints,
            maxPoints: score.maxPoints,
            percentage: score.percentage,
          },
        });
        return this.practiceResult(saved, assessment.questions);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async practiceHistory(
    user: AuthenticatedUser,
    assessmentId: string,
    dto: ListAssessmentsDto,
  ) {
    await this.requireStudentAssessment(user, assessmentId, false);
    const where = {
      assessmentId,
      studentId: user.id,
      status: PracticeAttemptStatus.GRADED,
    };
    const [items, total, stats, latest] = await this.prisma.$transaction([
      this.prisma.practiceAttempt.findMany({
        where,
        orderBy: [{ attemptNumber: "desc" }],
        ...pagination(dto),
      }),
      this.prisma.practiceAttempt.count({ where }),
      this.prisma.practiceAttempt.aggregate({
        where,
        _max: { percentage: true },
      }),
      this.prisma.practiceAttempt.findFirst({
        where,
        orderBy: { submittedAt: "desc" },
        select: { percentage: true },
      }),
    ]);
    return {
      items,
      page: dto.page,
      pageSize: dto.pageSize,
      total,
      summary: {
        completedCount: total,
        bestPercentage: stats._max.percentage,
        latestPercentage: latest?.percentage ?? null,
      },
    };
  }

  async practiceDetail(
    user: AuthenticatedUser,
    assessmentId: string,
    attemptId: string,
  ) {
    const assessment = await this.requireStudentAssessment(
      user,
      assessmentId,
      false,
    );
    const attempt = await this.prisma.practiceAttempt.findFirst({
      where: { id: attemptId, assessmentId, studentId: user.id },
    });
    if (!attempt)
      throw new NotFoundException({
        code: "ATTEMPT_NOT_FOUND",
        message: "Không tìm thấy lượt luyện tập.",
      });
    if (attempt.status === PracticeAttemptStatus.DRAFT) return attempt;
    return this.practiceResult(attempt, assessment.questions);
  }

  private async validateDraft(
    classId: string,
    dto: UpsertAssessmentDto,
  ): Promise<Prisma.AssessmentCreateInput | any> {
    if (dto.kind === AssessmentKind.PRACTICE_QUIZ) {
      if (dto.dueAt || dto.allowLate)
        throw new BadRequestException({
          code: "PRACTICE_DEADLINE_FORBIDDEN",
          message: "Bài luyện tập không có hạn nộp.",
        });
    } else if (!dto.dueAt)
      throw new BadRequestException({
        code: "DUE_AT_REQUIRED",
        message: "Bài chính thức cần hạn nộp.",
      });
    if (dto.kind === AssessmentKind.HOMEWORK) {
      if (!dto.maxPoints || dto.questions.length)
        throw new BadRequestException({
          code: "HOMEWORK_CONTENT_INVALID",
          message: "Bài tập cần maxPoints và không có câu hỏi trắc nghiệm.",
        });
    } else {
      if (
        dto.maxPoints !== undefined ||
        dto.questions.length < 1 ||
        dto.questions.length > 50
      )
        throw new BadRequestException({
          code: "QUIZ_CONTENT_INVALID",
          message: "Quiz cần 1–50 câu và không nhận maxPoints từ client.",
        });
      this.validateQuestions(dto.questions);
    }
    if (
      dto.audience === AssessmentAudience.SELECTED_GROUPS &&
      !dto.groupIds.length
    )
      throw new BadRequestException({
        code: "GROUPS_REQUIRED",
        message: "Cần chọn ít nhất một nhóm.",
      });
    if (dto.audience === AssessmentAudience.WHOLE_CLASS && dto.groupIds.length)
      throw new BadRequestException({
        code: "GROUPS_FORBIDDEN",
        message: "Không gửi groupIds cho toàn lớp.",
      });
    const groupIds = [...new Set(dto.groupIds)];
    const materialIds = [...new Set(dto.materialIds)];
    if (groupIds.length) {
      const count = await this.prisma.learnerGroup.count({
        where: { id: { in: groupIds }, classId, status: GroupStatus.ACTIVE },
      });
      if (count !== groupIds.length)
        throw new BadRequestException({
          code: "INVALID_GROUPS",
          message: "Nhóm không hợp lệ.",
        });
    }
    if (materialIds.length) {
      const count = await this.prisma.material.count({
        where: {
          id: { in: materialIds },
          classId,
          visibility: MaterialVisibility.STUDENTS,
        },
      });
      if (count !== materialIds.length)
        throw new BadRequestException({
          code: "INVALID_MATERIALS",
          message: "Tài liệu phải cùng lớp và hiển thị cho học viên.",
        });
    }
    const maxPoints =
      dto.kind === AssessmentKind.HOMEWORK
        ? dto.maxPoints!
        : dto.questions.reduce((sum, item) => sum + item.points, 0);
    return {
      kind: dto.kind,
      audience: dto.audience,
      title: dto.title.trim(),
      instructions: dto.instructions?.trim() || null,
      maxPoints,
      dueAt: dto.dueAt ? parseDeadline(dto.dueAt) : null,
      allowLate:
        dto.kind === AssessmentKind.PRACTICE_QUIZ ? false : dto.allowLate,
      groups: { create: groupIds.map((groupId) => ({ groupId })) },
      materials: { create: materialIds.map((materialId) => ({ materialId })) },
      questions: {
        create: dto.questions.map((question) => ({
          id: question.id ?? randomUUID(),
          type: question.type,
          prompt: question.prompt.trim(),
          explanation: question.explanation?.trim() || null,
          points: question.points,
          position: question.position,
          options: {
            create: question.options.map((option) => ({
              id: option.id ?? randomUUID(),
              text: option.text.trim(),
              isCorrect: option.isCorrect,
              position: option.position,
            })),
          },
        })),
      },
    };
  }

  private validateQuestions(questions: UpsertAssessmentDto["questions"]): void {
    for (const question of questions) {
      const correct = question.options.filter(
        (option) => option.isCorrect,
      ).length;
      if (
        correct !== 1 ||
        (question.type === QuestionType.TRUE_FALSE &&
          question.options.length !== 2)
      ) {
        throw new BadRequestException({
          code: "QUESTION_INVALID",
          message:
            "Mỗi câu cần đúng một đáp án; TRUE_FALSE phải có hai lựa chọn.",
        });
      }
    }
  }

  private validatePublishable(assessment: any): void {
    if (
      assessment.kind !== AssessmentKind.PRACTICE_QUIZ &&
      (!assessment.dueAt || assessment.dueAt <= new Date())
    ) {
      throw new ConflictException({
        code: "DUE_AT_PASSED",
        message: "Hạn nộp phải ở tương lai khi phát hành.",
      });
    }
    if (
      assessment.audience === AssessmentAudience.SELECTED_GROUPS &&
      assessment.groups.some(
        (item: any) => item.group.status !== GroupStatus.ACTIVE,
      )
    ) {
      throw new ConflictException({
        code: "GROUP_INACTIVE",
        message: "Nhóm đích không còn hoạt động.",
      });
    }
    if (assessment.kind !== AssessmentKind.HOMEWORK)
      this.validateQuestions(
        assessment.questions.map((q: any) => ({
          ...q,
          points: Number(q.points),
        })),
      );
  }

  private async eligibleStudentIds(
    assessmentId: string,
    classId: string,
    audience: AssessmentAudience,
  ): Promise<string[]> {
    const groupFilter =
      audience === AssessmentAudience.SELECTED_GROUPS
        ? {
            groupMemberships: {
              some: {
                group: {
                  assessmentGroups: { some: { assessmentId } },
                  status: GroupStatus.ACTIVE,
                },
              },
            },
          }
        : {};
    const users = await this.prisma.user.findMany({
      where: {
        role: UserRole.STUDENT,
        status: UserStatus.ACTIVE,
        enrollments: { some: { classId, status: EnrollmentStatus.ACTIVE } },
        ...groupFilter,
      },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    return users.map((user) => user.id);
  }

  private async requireEditableClass(user: AuthenticatedUser, classId: string) {
    const learningClass = await this.access.staffClass(user, classId, false);
    if (learningClass.status !== ClassStatus.ACTIVE)
      throw new ConflictException({
        code: "CLASS_NOT_ACTIVE",
        message: "Lớp chưa hoạt động.",
      });
    return learningClass;
  }

  private async requireStaffAssessment(user: AuthenticatedUser, id: string) {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id },
    });
    if (!assessment) throw this.notFound();
    await this.access.staffClass(user, assessment.classId);
    return assessment;
  }

  private async requireStudentAssessment(
    user: AuthenticatedUser,
    id: string,
    requireAccepting: boolean,
  ) {
    if (user.role !== UserRole.STUDENT)
      throw new ForbiddenException({
        code: "STUDENT_ONLY",
        message: "Chỉ học viên được thao tác bài của mình.",
      });
    const assessment = await this.prisma.assessment.findUnique({
      where: { id },
      include: {
        questions: {
          include: { options: true },
          orderBy: [{ position: "asc" }, { id: "asc" }],
        },
        learningClass: true,
      },
    });
    if (
      !assessment ||
      (assessment.status !== AssessmentStatus.PUBLISHED &&
        assessment.status !== AssessmentStatus.CLOSED)
    )
      throw this.notFound();
    await this.access.studentClass(user, assessment.classId);
    const recipient = await this.prisma.assessmentRecipient.findUnique({
      where: {
        assessmentId_studentId: { assessmentId: id, studentId: user.id },
      },
    });
    if (!recipient) throw this.notFound();
    if (requireAccepting) {
      if (
        assessment.status !== AssessmentStatus.PUBLISHED ||
        assessment.learningClass.status !== ClassStatus.ACTIVE
      )
        throw new ConflictException({
          code: "WORK_CLOSED",
          message: "Bài không còn nhận nội dung mới.",
        });
      if (
        assessment.kind !== AssessmentKind.PRACTICE_QUIZ &&
        assessment.dueAt &&
        new Date() > assessment.dueAt &&
        !assessment.allowLate
      ) {
        throw new ConflictException({
          code: "DEADLINE_PASSED",
          message: "Đã quá hạn nộp.",
        });
      }
    }
    return assessment;
  }

  private async validateOfficialPayload(
    assessment: any,
    studentId: string,
    dto: DraftPayloadDto,
    final: boolean,
  ) {
    if (assessment.kind === AssessmentKind.HOMEWORK) {
      if (dto.answers && Object.keys(dto.answers).length)
        throw new BadRequestException({
          code: "ANSWERS_FORBIDDEN",
          message: "Bài tập không nhận câu trả lời quiz.",
        });
      if (final && !dto.textAnswer?.trim() && !dto.attachmentId)
        throw new BadRequestException({
          code: "HOMEWORK_EMPTY",
          message: "Bài tập cần nội dung chữ hoặc một tệp.",
        });
      if (dto.attachmentId) {
        const asset = await this.prisma.fileAsset.findFirst({
          where: {
            id: dto.attachmentId,
            classId: assessment.classId,
            ownerStudentId: studentId,
            context: FileContext.HOMEWORK_ATTACHMENT,
            status: "READY",
          },
        });
        if (!asset)
          throw new BadRequestException({
            code: "ATTACHMENT_INVALID",
            message: "Tệp đính kèm không hợp lệ.",
          });
      }
    } else {
      if (dto.textAnswer || dto.attachmentId)
        throw new BadRequestException({
          code: "QUIZ_PAYLOAD_INVALID",
          message: "Quiz chỉ nhận answers.",
        });
      this.validateAnswerIds(assessment.questions, dto.answers ?? {});
    }
  }

  private validateAnswerIds(
    questions: any[],
    answers: Record<string, string>,
  ): void {
    try {
      this.scoreAssessment(questions, answers);
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_ANSWER_ID")
        throw new BadRequestException({
          code: "INVALID_ANSWER_ID",
          message: "Mã câu hỏi hoặc lựa chọn không hợp lệ.",
        });
      throw error;
    }
  }

  private scoreAssessment(questions: any[], answers: Record<string, string>) {
    return scoreQuiz(
      questions.map((question) => ({
        ...question,
        points: Number(question.points),
      })),
      answers,
    );
  }

  private async loadQuestions(assessmentId: string) {
    return this.prisma.assessmentQuestion.findMany({
      where: { assessmentId },
      include: { options: true },
    });
  }

  private submissionReceipt(submission: any) {
    return {
      id: submission.id,
      receiptId: submission.receiptId,
      status: submission.status,
      revision: submission.revision,
      submittedAt: submission.submittedAt,
      isLate: submission.isLate,
      earnedPoints: submission.earnedPoints,
      maxPoints: submission.maxPoints,
      percentage: submission.percentage,
    };
  }

  private practiceResult(attempt: any, questions: any[]) {
    const score = this.scoreAssessment(
      questions,
      (attempt.answers ?? {}) as Record<string, string>,
    );
    return { ...attempt, review: score.details };
  }

  private revisionConflict(currentRevision: number) {
    return new ConflictException({
      code: "REVISION_CONFLICT",
      message: "Bản nháp đã thay đổi ở yêu cầu khác.",
      fieldErrors: { currentRevision },
    });
  }

  private async lockAcceptingAssessment(
    tx: Prisma.TransactionClient,
    assessmentId: string,
  ): Promise<{ dueAt: Date | null }> {
    const rows = await tx.$queryRaw<
      Array<{
        assessmentStatus: AssessmentStatus;
        classStatus: ClassStatus;
        dueAt: Date | null;
        allowLate: boolean;
        kind: AssessmentKind;
      }>
    >`
      SELECT a.status AS "assessmentStatus", c.status AS "classStatus", a."dueAt", a."allowLate", a.kind
      FROM "Assessment" a JOIN "LearningClass" c ON c.id = a."classId"
      WHERE a.id = ${assessmentId}::uuid
      FOR SHARE OF a, c
    `;
    const locked = rows[0];
    const now = new Date();
    if (
      !locked ||
      locked.assessmentStatus !== AssessmentStatus.PUBLISHED ||
      locked.classStatus !== ClassStatus.ACTIVE
    ) {
      throw new ConflictException({
        code: "WORK_CLOSED",
        message: "Bài không còn nhận nội dung mới.",
      });
    }
    if (
      locked.kind !== AssessmentKind.PRACTICE_QUIZ &&
      locked.dueAt &&
      now > locked.dueAt &&
      !locked.allowLate
    ) {
      throw new ConflictException({
        code: "DEADLINE_PASSED",
        message: "Đã quá hạn nộp.",
      });
    }
    return locked;
  }

  private notFound() {
    return new NotFoundException({
      code: "ASSESSMENT_NOT_FOUND",
      message: "Không tìm thấy bài.",
    });
  }
}
