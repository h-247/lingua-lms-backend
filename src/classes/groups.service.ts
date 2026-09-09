import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AssessmentKind,
  AssessmentStatus,
  ClassStatus,
  EnrollmentStatus,
  GroupStatus,
  UserRole,
  UserStatus,
} from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../common/types";
import { PrismaService } from "../prisma/prisma.service";
import { ClassAccessService } from "./class-access.service";
import { CreateGroupDto, StudentIdsDto, UpdateGroupDto } from "./classes.dto";

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClassAccessService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthenticatedUser, classId: string) {
    if (user.role === UserRole.STUDENT) {
      await this.access.studentClass(user, classId);
      return this.prisma.learnerGroup.findMany({
        where: { classId, memberships: { some: { studentId: user.id } } },
        select: { id: true, name: true, purpose: true, status: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      });
    }
    await this.access.staffClass(user, classId);
    return this.prisma.learnerGroup.findMany({
      where: { classId },
      include: { _count: { select: { memberships: true } } },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
  }

  async create(user: AuthenticatedUser, classId: string, dto: CreateGroupDto) {
    const learningClass = await this.access.staffClass(user, classId, false);
    if (learningClass.status !== ClassStatus.ACTIVE)
      throw new ConflictException({
        code: "CLASS_NOT_ACTIVE",
        message: "Chỉ tạo nhóm trong lớp đang hoạt động.",
      });
    const name = dto.name.trim();
    const nameKey = name.toLocaleLowerCase("vi");
    if (
      await this.prisma.learnerGroup.findUnique({
        where: { classId_nameKey: { classId, nameKey } },
      })
    ) {
      throw new ConflictException({
        code: "GROUP_NAME_EXISTS",
        message: "Tên nhóm đã tồn tại trong lớp.",
      });
    }
    const group = await this.prisma.learnerGroup.create({
      data: { classId, name, nameKey, purpose: dto.purpose?.trim() || null },
    });
    await this.audit.create({
      actorId: user.id,
      classId,
      action: "GROUP_CREATED",
      resourceType: "LearnerGroup",
      resourceId: group.id,
    });
    return group;
  }

  async update(
    user: AuthenticatedUser,
    classId: string,
    groupId: string,
    dto: UpdateGroupDto,
  ) {
    await this.access.staffClass(user, classId, false);
    const group = await this.requireGroup(classId, groupId);
    if (group.status !== GroupStatus.ACTIVE)
      throw new ConflictException({
        code: "GROUP_ARCHIVED",
        message: "Nhóm đã lưu trữ.",
      });
    const name = dto.name.trim();
    const updated = await this.prisma.learnerGroup.update({
      where: { id: groupId },
      data: {
        name,
        nameKey: name.toLocaleLowerCase("vi"),
        purpose: dto.purpose?.trim() || null,
      },
    });
    await this.audit.create({
      actorId: user.id,
      classId,
      action: "GROUP_UPDATED",
      resourceType: "LearnerGroup",
      resourceId: groupId,
    });
    return updated;
  }

  async archive(user: AuthenticatedUser, classId: string, groupId: string) {
    await this.access.staffClass(user, classId, false);
    await this.requireGroup(classId, groupId);
    const group = await this.prisma.learnerGroup.update({
      where: { id: groupId },
      data: { status: GroupStatus.ARCHIVED },
    });
    await this.audit.create({
      actorId: user.id,
      classId,
      action: "GROUP_ARCHIVED",
      resourceType: "LearnerGroup",
      resourceId: groupId,
    });
    return group;
  }

  async addMembers(
    user: AuthenticatedUser,
    classId: string,
    groupId: string,
    dto: StudentIdsDto,
  ) {
    const learningClass = await this.access.staffClass(user, classId, false);
    if (learningClass.status !== ClassStatus.ACTIVE)
      throw new ConflictException({
        code: "CLASS_NOT_ACTIVE",
        message: "Lớp chưa hoạt động.",
      });
    const group = await this.requireGroup(classId, groupId);
    if (group.status !== GroupStatus.ACTIVE)
      throw new ConflictException({
        code: "GROUP_ARCHIVED",
        message: "Nhóm đã lưu trữ.",
      });
    const studentIds = [...new Set(dto.studentIds)];
    const eligible = await this.prisma.enrollment.findMany({
      where: {
        classId,
        studentId: { in: studentIds },
        status: EnrollmentStatus.ACTIVE,
        student: { role: UserRole.STUDENT, status: UserStatus.ACTIVE },
      },
      select: { studentId: true },
    });
    if (eligible.length !== studentIds.length)
      throw new BadRequestException({
        code: "INVALID_GROUP_MEMBERS",
        message: "Mọi thành viên phải là học viên đang ghi danh trong lớp.",
      });
    await this.prisma.$transaction(async (tx) => {
      await tx.groupMembership.createMany({
        data: studentIds.map((studentId) => ({ groupId, studentId })),
        skipDuplicates: true,
      });
      const now = new Date();
      const assessments = await tx.assessment.findMany({
        where: {
          classId,
          status: AssessmentStatus.PUBLISHED,
          groups: { some: { groupId } },
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
      await this.audit.create(
        {
          actorId: user.id,
          classId,
          action: "GROUP_MEMBERS_ADDED",
          resourceType: "LearnerGroup",
          resourceId: groupId,
          details: { studentIds },
        },
        tx,
      );
    });
    return { added: studentIds.length };
  }

  async removeMember(
    user: AuthenticatedUser,
    classId: string,
    groupId: string,
    studentId: string,
  ) {
    await this.access.staffClass(user, classId, false);
    await this.requireGroup(classId, groupId);
    const removed = await this.prisma.groupMembership.deleteMany({
      where: { groupId, studentId },
    });
    if (!removed.count)
      throw new NotFoundException({
        code: "MEMBERSHIP_NOT_FOUND",
        message: "Không tìm thấy thành viên trong nhóm.",
      });
    await this.audit.create({
      actorId: user.id,
      classId,
      action: "GROUP_MEMBER_REMOVED",
      resourceType: "LearnerGroup",
      resourceId: groupId,
      details: { studentId },
    });
    return { removed: true };
  }

  private async requireGroup(classId: string, groupId: string) {
    const group = await this.prisma.learnerGroup.findFirst({
      where: { id: groupId, classId },
    });
    if (!group)
      throw new NotFoundException({
        code: "GROUP_NOT_FOUND",
        message: "Không tìm thấy nhóm.",
      });
    return group;
  }
}
