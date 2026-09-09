import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { UserRole, UserStatus } from "@prisma/client";
import { randomBytes } from "crypto";
import { AuditService } from "../audit/audit.service";
import { AuthService } from "../auth/auth.service";
import { pagination } from "../common/pagination.dto";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateUserDto,
  ListUsersDto,
  ResetPasswordDto,
  SetUserStatusDto,
  UpdateUserDto,
} from "./users.dto";

const publicUserSelect = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  status: true,
  mustChangePassword: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  async list(dto: ListUsersDto) {
    const search = dto.search?.trim();
    const where = {
      ...(dto.role ? { role: dto.role } : {}),
      ...(dto.status ? { status: dto.status } : {}),
      ...(search
        ? {
            OR: [
              {
                displayName: { contains: search, mode: "insensitive" as const },
              },
              { email: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: publicUserSelect,
        orderBy: [{ displayName: "asc" }, { id: "asc" }],
        ...pagination(dto),
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, page: dto.page, pageSize: dto.pageSize, total };
  }

  async create(actorId: string, dto: CreateUserDto) {
    const email = dto.email.trim().toLowerCase();
    const displayName = dto.displayName.trim();
    const exists = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (exists)
      throw new ConflictException({
        code: "EMAIL_EXISTS",
        message: "Email đã tồn tại.",
      });
    const temporaryPassword = `Tmp-${randomBytes(12).toString("base64url")}!`;
    const user = await this.prisma.user.create({
      data: {
        email,
        displayName,
        role: dto.role,
        passwordHash: await this.auth.hashPassword(temporaryPassword),
        mustChangePassword: true,
      },
      select: publicUserSelect,
    });
    await this.audit.create({
      actorId,
      action: "USER_CREATED",
      resourceType: "User",
      resourceId: user.id,
      details: { role: user.role },
    });
    return { user, temporaryPassword };
  }

  async update(actorId: string, id: string, dto: UpdateUserDto) {
    await this.requireUser(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: { displayName: dto.displayName.trim() },
      select: publicUserSelect,
    });
    await this.audit.create({
      actorId,
      action: "USER_PROFILE_UPDATED",
      resourceType: "User",
      resourceId: id,
    });
    return user;
  }

  async setStatus(actorId: string, id: string, dto: SetUserStatusDto) {
    const target = await this.requireUser(id);
    if (target.status === dto.status)
      return { ...target, passwordHash: undefined };
    if (dto.status === UserStatus.INACTIVE && target.role === UserRole.ADMIN) {
      const activeAdmins = await this.prisma.user.count({
        where: { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
      });
      if (activeAdmins <= 1)
        throw new ConflictException({
          code: "LAST_ADMIN",
          message: "Không thể vô hiệu hóa quản trị viên hoạt động cuối cùng.",
        });
    }
    if (
      dto.status === UserStatus.INACTIVE &&
      target.role === UserRole.TEACHER
    ) {
      const activeClasses = await this.prisma.learningClass.count({
        where: { teacherId: id, status: { in: ["DRAFT", "ACTIVE"] } },
      });
      if (activeClasses)
        throw new ConflictException({
          code: "TEACHER_ASSIGNED",
          message: "Phải phân công lại các lớp đang hoạt động trước.",
        });
    }
    const user = await this.prisma.user.update({
      where: { id },
      data: { status: dto.status, authVersion: { increment: 1 } },
      select: publicUserSelect,
    });
    if (
      dto.status === UserStatus.INACTIVE &&
      target.role === UserRole.STUDENT
    ) {
      await this.prisma.groupMembership.deleteMany({
        where: { studentId: id },
      });
    }
    await this.audit.create({
      actorId,
      action: "USER_STATUS_CHANGED",
      resourceType: "User",
      resourceId: id,
      details: { from: target.status, to: dto.status },
    });
    return user;
  }

  async resetPassword(actorId: string, id: string, dto: ResetPasswordDto) {
    await this.requireUser(id);
    const temporaryPassword = `Tmp-${randomBytes(12).toString("base64url")}!`;
    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash: await this.auth.hashPassword(temporaryPassword),
        mustChangePassword: dto.mustChangePassword,
        authVersion: { increment: 1 },
      },
    });
    await this.audit.create({
      actorId,
      action: "USER_PASSWORD_RESET",
      resourceType: "User",
      resourceId: id,
    });
    return { temporaryPassword };
  }

  private async requireUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user)
      throw new NotFoundException({
        code: "USER_NOT_FOUND",
        message: "Không tìm thấy tài khoản.",
      });
    if (!user.displayName.trim()) throw new BadRequestException();
    return user;
  }
}
