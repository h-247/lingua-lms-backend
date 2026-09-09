import { Injectable, NotFoundException } from "@nestjs/common";
import {
  AssessmentKind,
  AssessmentStatus,
  EnrollmentStatus,
  PracticeAttemptStatus,
  SubmissionStatus,
  UserRole,
  UserStatus,
} from "@prisma/client";
import { ClassAccessService } from "../classes/class-access.service";
import { pagination } from "../common/pagination.dto";
import { AuthenticatedUser } from "../common/types";
import { PrismaService } from "../prisma/prisma.service";
import { AuditQueryDto, ClassReportQueryDto } from "./reports.dto";

export interface ProgressRow {
  studentId: string;
  displayName: string;
  assignedCount: number;
  submittedCount: number;
  gradedCount: number;
  submittedRate: number | null;
  officialAverage: number | null;
  missingCount: number;
  overdueMissingCount: number;
  practiceCompletedCount: number;
  practiceBestPercentage: number | null;
  practiceLatestPercentage: number | null;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClassAccessService,
  ) {}

  async dashboard(user: AuthenticatedUser) {
    if (user.role === UserRole.STUDENT) {
      const classes = await this.prisma.enrollment.count({
        where: {
          studentId: user.id,
          status: EnrollmentStatus.ACTIVE,
          learningClass: { status: { in: ["ACTIVE", "CLOSED"] } },
        },
      });
      const assigned = await this.prisma.assessmentRecipient.count({
        where: {
          studentId: user.id,
          assessment: {
            kind: { in: [AssessmentKind.HOMEWORK, AssessmentKind.GRADED_QUIZ] },
            status: {
              in: [AssessmentStatus.PUBLISHED, AssessmentStatus.CLOSED],
            },
          },
        },
      });
      const pending = await this.prisma.submission.count({
        where: { studentId: user.id, status: SubmissionStatus.SUBMITTED },
      });
      return { classes, assignedOfficial: assigned, pendingGrades: pending };
    }
    const classWhere =
      user.role === UserRole.ADMIN ? {} : { teacherId: user.id };
    const [classes, assessments, pendingGrades] =
      await this.prisma.$transaction([
        this.prisma.learningClass.count({ where: classWhere }),
        this.prisma.assessment.count({
          where: {
            learningClass: classWhere,
            status: AssessmentStatus.PUBLISHED,
          },
        }),
        this.prisma.submission.count({
          where: {
            status: SubmissionStatus.SUBMITTED,
            assessment: {
              kind: AssessmentKind.HOMEWORK,
              learningClass: classWhere,
            },
          },
        }),
      ]);
    return { classes, publishedAssessments: assessments, pendingGrades };
  }

  async ownProgress(user: AuthenticatedUser, classId: string) {
    await this.access.studentClass(user, classId);
    const student = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { id: true, displayName: true },
    });
    return this.progressForStudents(classId, [student]).then((rows) => rows[0]);
  }

  async classProgress(
    user: AuthenticatedUser,
    classId: string,
    dto: ClassReportQueryDto,
  ) {
    await this.access.staffClass(user, classId);
    if (dto.groupId) {
      const valid = await this.prisma.learnerGroup.findFirst({
        where: { id: dto.groupId, classId },
        select: { id: true },
      });
      if (!valid)
        throw new NotFoundException({
          code: "GROUP_NOT_FOUND",
          message: "Không tìm thấy nhóm.",
        });
    }
    const studentWhere = {
      role: UserRole.STUDENT,
      ...(dto.includeHistorical
        ? { enrollments: { some: { classId } } }
        : {
            status: UserStatus.ACTIVE,
            enrollments: { some: { classId, status: EnrollmentStatus.ACTIVE } },
          }),
      ...(dto.groupId
        ? { groupMemberships: { some: { groupId: dto.groupId } } }
        : {}),
      ...(dto.search
        ? {
            displayName: {
              contains: dto.search.trim(),
              mode: "insensitive" as const,
            },
          }
        : {}),
    };
    const [students, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where: studentWhere,
        select: { id: true, displayName: true },
        orderBy: [{ displayName: "asc" }, { id: "asc" }],
        ...pagination(dto),
      }),
      this.prisma.user.count({ where: studentWhere }),
    ]);
    return {
      items: await this.progressForStudents(classId, students),
      page: dto.page,
      pageSize: dto.pageSize,
      total,
    };
  }

  async classCsv(
    user: AuthenticatedUser,
    classId: string,
    dto: ClassReportQueryDto,
  ) {
    await this.access.staffClass(user, classId);
    const all = await this.classProgress(user, classId, {
      ...dto,
      page: 1,
      pageSize: 100,
    });
    const header = [
      "studentId",
      "displayName",
      "assignedCount",
      "submittedCount",
      "gradedCount",
      "submittedRate",
      "officialAverage",
      "missingCount",
      "overdueMissingCount",
      "practiceCompletedCount",
      "practiceBestPercentage",
      "practiceLatestPercentage",
    ];
    const lines = [header.join(",")];
    for (const row of all.items)
      lines.push(
        header
          .map((key) => this.csvCell(row[key as keyof ProgressRow]))
          .join(","),
      );
    return `\uFEFF${lines.join("\r\n")}\r\n`;
  }

  async audit(user: AuthenticatedUser, classId: string, dto: AuditQueryDto) {
    await this.access.staffClass(user, classId);
    const where = { classId, ...(dto.action ? { action: dto.action } : {}) };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditEvent.findMany({
        where,
        include: {
          actor: { select: { id: true, displayName: true, role: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        ...pagination(dto),
      }),
      this.prisma.auditEvent.count({ where }),
    ]);
    return { items, page: dto.page, pageSize: dto.pageSize, total };
  }

  private async progressForStudents(
    classId: string,
    students: Array<{ id: string; displayName: string }>,
  ): Promise<ProgressRow[]> {
    if (!students.length) return [];
    const ids = students.map((student) => student.id);
    const recipients = await this.prisma.assessmentRecipient.findMany({
      where: {
        studentId: { in: ids },
        assessment: {
          classId,
          kind: { in: [AssessmentKind.HOMEWORK, AssessmentKind.GRADED_QUIZ] },
          status: { in: [AssessmentStatus.PUBLISHED, AssessmentStatus.CLOSED] },
        },
      },
      include: { assessment: { select: { dueAt: true } } },
    });
    const submissions = await this.prisma.submission.findMany({
      where: {
        studentId: { in: ids },
        assessment: {
          classId,
          kind: { in: [AssessmentKind.HOMEWORK, AssessmentKind.GRADED_QUIZ] },
        },
      },
      select: {
        studentId: true,
        assessmentId: true,
        status: true,
        percentage: true,
      },
    });
    const practice = await this.prisma.practiceAttempt.findMany({
      where: {
        studentId: { in: ids },
        status: PracticeAttemptStatus.GRADED,
        assessment: { classId },
      },
      select: { studentId: true, percentage: true, submittedAt: true },
      orderBy: { submittedAt: "asc" },
    });
    const submissionMap = new Map(
      submissions.map((item) => [
        `${item.studentId}:${item.assessmentId}`,
        item,
      ]),
    );
    const now = new Date();
    return students.map((student) => {
      const assigned = recipients.filter(
        (item) => item.studentId === student.id,
      );
      const results = assigned.map((item) => ({
        recipient: item,
        submission: submissionMap.get(`${student.id}:${item.assessmentId}`),
      }));
      const final = results.filter(
        (item) =>
          item.submission && item.submission.status !== SubmissionStatus.DRAFT,
      );
      const graded = final.filter(
        (item) =>
          item.submission?.status === SubmissionStatus.GRADED &&
          item.submission.percentage !== null,
      );
      const average = graded.length
        ? graded.reduce(
            (sum, item) => sum + Number(item.submission!.percentage),
            0,
          ) / graded.length
        : null;
      const missing = results.filter(
        (item) =>
          !item.submission || item.submission.status === SubmissionStatus.DRAFT,
      );
      const completedPractice = practice.filter(
        (item) => item.studentId === student.id,
      );
      const latest = completedPractice.at(-1);
      return {
        studentId: student.id,
        displayName: student.displayName,
        assignedCount: assigned.length,
        submittedCount: final.length,
        gradedCount: graded.length,
        submittedRate: assigned.length
          ? Math.round((final.length / assigned.length) * 10_000) / 100
          : null,
        officialAverage:
          average === null ? null : Math.round(average * 100) / 100,
        missingCount: missing.length,
        overdueMissingCount: missing.filter(
          (item) =>
            item.recipient.assessment.dueAt &&
            item.recipient.assessment.dueAt < now,
        ).length,
        practiceCompletedCount: completedPractice.length,
        practiceBestPercentage: completedPractice.length
          ? Math.max(
              ...completedPractice.map((item) => Number(item.percentage)),
            )
          : null,
        practiceLatestPercentage:
          latest?.percentage === null || latest?.percentage === undefined
            ? null
            : Number(latest.percentage),
      };
    });
  }

  private csvCell(value: unknown): string {
    if (value === null || value === undefined) return "";
    let text = String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }
}
