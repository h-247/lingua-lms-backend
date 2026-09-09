import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AssessmentAudience,
  AssessmentKind,
  AssessmentStatus,
  ClassStatus,
  EnrollmentStatus,
  UserRole,
  UserStatus,
} from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { pagination } from "../common/pagination.dto";
import { AuthenticatedUser } from "../common/types";
import { PrismaService } from "../prisma/prisma.service";
import { ClassAccessService } from "./class-access.service";
import {
  AssignTeacherDto,
  CreateClassDto,
  ListClassesDto,
  StudentIdsDto,
  UpdateClassDto,
} from "./classes.dto";

@Injectable()
export class ClassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClassAccessService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthenticatedUser, dto: ListClassesDto) {
    const search = dto.search?.trim();
    const visibility =
      user.role === UserRole.ADMIN
        ? {}
        : user.role === UserRole.TEACHER
          ? { teacherId: user.id }
          : {
              status: { in: [ClassStatus.ACTIVE, ClassStatus.CLOSED] },
              enrollments: {
                some: { studentId: user.id, status: EnrollmentStatus.ACTIVE },
              },
            };
    const where = {
      ...visibility,
      ...(dto.status ? { status: dto.status } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { code: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.learningClass.findMany({
        where,
        include: { teacher: { select: { id: true, displayName: true } } },
        orderBy: [{ code: "asc" }, { id: "asc" }],
        ...pagination(dto),
      }),
      this.prisma.learningClass.count({ where }),
    ]);
    return { items, page: dto.page, pageSize: dto.pageSize, total };
  }

  async detail(user: AuthenticatedUser, id: string) {
    await this.access.anyReadableClass(user, id);
    return this.prisma.learningClass.findUnique({
      where: { id },
      include: {
        teacher: { select: { id: true, displayName: true } },
        ...(user.role === UserRole.STUDENT
          ? {
              groups: {
                where: { memberships: { some: { studentId: user.id } } },
                select: { id: true, name: true },
              },
            }
          : {
              _count: {
                select: { enrollments: true, groups: true, assessments: true },
              },
            }),
      },
    });
  }

  async create(actorId: string, dto: CreateClassDto) {
    await this.requireActiveTeacher(dto.teacherId);
    this.validateDates(dto.startDate, dto.endDate);
    const code = dto.code.trim().toUpperCase();
    if (await this.prisma.learningClass.findUnique({ where: { code } })) {
      throw new ConflictException({
        code: "CLASS_CODE_EXISTS",
        message: "Mã lớp đã tồn tại.",
      });
    }
    const learningClass = await this.prisma.learningClass.create({
      data: {
        code,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        level: dto.level,
        teacherId: dto.teacherId,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
      },
    });
    await this.audit.create({
      actorId,
      classId: learningClass.id,
      action: "CLASS_CREATED",
      resourceType: "LearningClass",
      resourceId: learningClass.id,
    });
    return learningClass;
  }

  async update(actorId: string, id: string, dto: UpdateClassDto) {
    const current = await this.prisma.learningClass.findUnique({
      where: { id },
    });
    if (!current)
      throw new NotFoundException({
        code: "CLASS_NOT_FOUND",
        message: "Không tìm thấy lớp.",
      });
    if (current.status !== ClassStatus.DRAFT)
      throw new ConflictException({
        code: "CLASS_LOCKED",
        message: "Chỉ có thể sửa lớp nháp.",
      });
    await this.requireActiveTeacher(dto.teacherId);
    this.validateDates(dto.startDate, dto.endDate);
    return this.prisma.learningClass
      .update({
        where: { id },
        data: {
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          level: dto.level,
          teacherId: dto.teacherId,
          startDate: dto.startDate ? new Date(dto.startDate) : null,
          endDate: dto.endDate ? new Date(dto.endDate) : null,
        },
      })
      .then(async (updated) => {
        await this.audit.create({
          actorId,
          classId: id,
          action: "CLASS_UPDATED",
          resourceType: "LearningClass",
          resourceId: id,
        });
        return updated;
      });
  }

  async activate(actorId: string, id: string) {
    const current = await this.prisma.learningClass.findUnique({
      where: { id },
      include: { teacher: true },
    });
    if (!current)
      throw new NotFoundException({
        code: "CLASS_NOT_FOUND",
        message: "Không tìm thấy lớp.",
      });
    if (current.status !== ClassStatus.DRAFT)
      throw new ConflictException({
        code: "INVALID_CLASS_TRANSITION",
        message: "Lớp không ở trạng thái nháp.",
      });
    if (
      current.teacher.status !== UserStatus.ACTIVE ||
      current.teacher.role !== UserRole.TEACHER
    ) {
      throw new ConflictException({
        code: "INVALID_TEACHER",
        message: "Giáo viên phụ trách không hợp lệ.",
      });
    }
    const updated = await this.prisma.learningClass.update({
      where: { id },
      data: { status: ClassStatus.ACTIVE },
    });
    await this.audit.create({
      actorId,
      classId: id,
      action: "CLASS_ACTIVATED",
      resourceType: "LearningClass",
      resourceId: id,
    });
    return updated;
  }

  async close(actorId: string, id: string) {
    const current = await this.prisma.learningClass.findUnique({
      where: { id },
    });
    if (!current)
      throw new NotFoundException({
        code: "CLASS_NOT_FOUND",
        message: "Không tìm thấy lớp.",
      });
    if (current.status !== ClassStatus.ACTIVE)
      throw new ConflictException({
        code: "INVALID_CLASS_TRANSITION",
        message: "Chỉ lớp đang hoạt động mới có thể đóng.",
      });
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.assessment.updateMany({
        where: { classId: id, status: AssessmentStatus.PUBLISHED },
        data: { status: AssessmentStatus.CLOSED, closedAt: now },
      });
      const updated = await tx.learningClass.update({
        where: { id },
        data: { status: ClassStatus.CLOSED },
      });
      await this.audit.create(
        {
          actorId,
          classId: id,
          action: "CLASS_CLOSED",
          resourceType: "LearningClass",
          resourceId: id,
        },
        tx,
      );
      return updated;
    });
  }

  async assignTeacher(actorId: string, id: string, dto: AssignTeacherDto) {
    const current = await this.prisma.learningClass.findUnique({
      where: { id },
    });
    if (!current)
      throw new NotFoundException({
        code: "CLASS_NOT_FOUND",
        message: "Không tìm thấy lớp.",
      });
    if (current.status === ClassStatus.CLOSED)
      throw new ConflictException({
        code: "CLASS_CLOSED",
        message: "Lớp đã đóng.",
      });
    await this.requireActiveTeacher(dto.teacherId);
    const updated = await this.prisma.learningClass.update({
      where: { id },
      data: { teacherId: dto.teacherId },
    });
    await this.audit.create({
      actorId,
      classId: id,
      action: "CLASS_TEACHER_CHANGED",
      resourceType: "LearningClass",
      resourceId: id,
      details: { from: current.teacherId, to: dto.teacherId },
    });
    return updated;
  }

  async enroll(actorId: string, classId: string, dto: StudentIdsDto) {
    await this.requireActiveClass(classId);
    const ids = [...new Set(dto.studentIds)];
    const students = await this.prisma.user.findMany({
      where: {
        id: { in: ids },
        role: UserRole.STUDENT,
        status: UserStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (students.length !== ids.length)
      throw new BadRequestException({
        code: "INVALID_STUDENTS",
        message: "Danh sách có tài khoản không phải học viên hoạt động.",
      });
    await this.prisma.$transaction(async (tx) => {
      for (const studentId of ids) {
        await tx.enrollment.upsert({
          where: { classId_studentId: { classId, studentId } },
          create: { classId, studentId },
          update: { status: EnrollmentStatus.ACTIVE },
        });
      }
      await this.reconcileRecipients(tx, classId, ids);
      await this.audit.create(
        {
          actorId,
          classId,
          action: "STUDENTS_ENROLLED",
          resourceType: "Enrollment",
          resourceId: classId,
          details: { studentIds: ids },
        },
        tx,
      );
    });
    return { enrolled: ids.length };
  }

  async changeEnrollment(
    actorId: string,
    classId: string,
    studentId: string,
    status: EnrollmentStatus,
  ) {
    const learningClass = await this.prisma.learningClass.findUnique({
      where: { id: classId },
    });
    if (!learningClass)
      throw new NotFoundException({
        code: "CLASS_NOT_FOUND",
        message: "Không tìm thấy lớp.",
      });
    if (
      status === EnrollmentStatus.ACTIVE &&
      learningClass.status !== ClassStatus.ACTIVE
    ) {
      throw new ConflictException({
        code: "CLASS_NOT_ACTIVE",
        message: "Chỉ có thể kích hoạt ghi danh trong lớp đang hoạt động.",
      });
    }
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { classId_studentId: { classId, studentId } },
    });
    if (!enrollment)
      throw new NotFoundException({
        code: "ENROLLMENT_NOT_FOUND",
        message: "Không tìm thấy ghi danh.",
      });
    await this.prisma.$transaction(async (tx) => {
      await tx.enrollment.update({
        where: { id: enrollment.id },
        data: { status },
      });
      if (status === EnrollmentStatus.REVOKED) {
        await tx.groupMembership.deleteMany({
          where: { studentId, group: { classId } },
        });
      } else {
        await this.reconcileRecipients(tx, classId, [studentId]);
      }
      await this.audit.create(
        {
          actorId,
          classId,
          action:
            status === EnrollmentStatus.ACTIVE
              ? "ENROLLMENT_REACTIVATED"
              : "ENROLLMENT_REVOKED",
          resourceType: "Enrollment",
          resourceId: enrollment.id,
          details: { studentId },
        },
        tx,
      );
    });
    return { status };
  }

  private async reconcileRecipients(
    tx: Parameters<Parameters<PrismaService["$transaction"]>[0]>[0],
    classId: string,
    studentIds: string[],
  ) {
    const now = new Date();
    const assessments = await tx.assessment.findMany({
      where: {
        classId,
        status: AssessmentStatus.PUBLISHED,
        audience: AssessmentAudience.WHOLE_CLASS,
        OR: [
          { kind: AssessmentKind.PRACTICE_QUIZ },
          { dueAt: { gt: now } },
          { allowLate: true },
        ],
      },
      select: { id: true },
    });
    if (assessments.length) {
      await tx.assessmentRecipient.createMany({
        data: assessments.flatMap((assessment) =>
          studentIds.map((studentId) => ({
            assessmentId: assessment.id,
            studentId,
          })),
        ),
        skipDuplicates: true,
      });
    }
  }

  private validateDates(start?: string, end?: string): void {
    if (start && end && new Date(start) > new Date(end))
      throw new BadRequestException({
        code: "INVALID_DATE_RANGE",
        message: "Ngày bắt đầu không được sau ngày kết thúc.",
      });
  }

  private async requireActiveTeacher(id: string): Promise<void> {
    const teacher = await this.prisma.user.findUnique({ where: { id } });
    if (
      !teacher ||
      teacher.role !== UserRole.TEACHER ||
      teacher.status !== UserStatus.ACTIVE
    ) {
      throw new BadRequestException({
        code: "INVALID_TEACHER",
        message: "Giáo viên phải là tài khoản TEACHER đang hoạt động.",
      });
    }
  }

  private async requireActiveClass(id: string): Promise<void> {
    const found = await this.prisma.learningClass.findUnique({ where: { id } });
    if (!found)
      throw new NotFoundException({
        code: "CLASS_NOT_FOUND",
        message: "Không tìm thấy lớp.",
      });
    if (found.status !== ClassStatus.ACTIVE)
      throw new ConflictException({
        code: "CLASS_NOT_ACTIVE",
        message: "Lớp chưa hoạt động.",
      });
  }
}
