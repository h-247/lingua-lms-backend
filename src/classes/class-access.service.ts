import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ClassStatus,
  EnrollmentStatus,
  UserRole,
  UserStatus,
} from "@prisma/client";
import { AuthenticatedUser } from "../common/types";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ClassAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async staffClass(
    user: AuthenticatedUser,
    classId: string,
    includeClosed = true,
  ) {
    const learningClass = await this.prisma.learningClass.findUnique({
      where: { id: classId },
    });
    if (
      !learningClass ||
      (!includeClosed && learningClass.status === ClassStatus.CLOSED)
    ) {
      throw new NotFoundException({
        code: "CLASS_NOT_FOUND",
        message: "Không tìm thấy lớp.",
      });
    }
    if (
      user.role === UserRole.ADMIN ||
      (user.role === UserRole.TEACHER && learningClass.teacherId === user.id)
    )
      return learningClass;
    throw new NotFoundException({
      code: "CLASS_NOT_FOUND",
      message: "Không tìm thấy lớp.",
    });
  }

  async studentClass(user: AuthenticatedUser, classId: string) {
    if (user.role !== UserRole.STUDENT)
      throw new ForbiddenException({
        code: "STUDENT_ONLY",
        message: "Chỉ học viên được phép.",
      });
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { classId_studentId: { classId, studentId: user.id } },
      include: { learningClass: true, student: { select: { status: true } } },
    });
    if (
      !enrollment ||
      enrollment.status !== EnrollmentStatus.ACTIVE ||
      enrollment.student.status !== UserStatus.ACTIVE ||
      (enrollment.learningClass.status !== ClassStatus.ACTIVE &&
        enrollment.learningClass.status !== ClassStatus.CLOSED)
    ) {
      throw new NotFoundException({
        code: "CLASS_NOT_FOUND",
        message: "Không tìm thấy lớp.",
      });
    }
    return enrollment.learningClass;
  }

  async anyReadableClass(user: AuthenticatedUser, classId: string) {
    return user.role === UserRole.STUDENT
      ? this.studentClass(user, classId)
      : this.staffClass(user, classId);
  }
}
