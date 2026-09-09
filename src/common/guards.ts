import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UserRole, UserStatus } from "@prisma/client";
import { Request } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { IS_PUBLIC_KEY, ROLES_KEY } from "./decorators";
import { AuthenticatedUser } from "./types";

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const req = context.switchToHttp().getRequest<Request>();
    const userId = req.session?.userId;
    if (!userId)
      throw new UnauthorizedException({
        code: "AUTH_REQUIRED",
        message: "Vui lòng đăng nhập.",
      });
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        status: true,
        authVersion: true,
      },
    });
    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      user.authVersion !== req.session.authVersion
    ) {
      await new Promise<void>((resolve) =>
        req.session.destroy(() => resolve()),
      );
      throw new UnauthorizedException({
        code: "SESSION_REVOKED",
        message: "Phiên đăng nhập đã hết hiệu lực.",
      });
    }
    (req as Request & { user: AuthenticatedUser }).user = user;
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    if (!req.user || !roles.includes(req.user.role)) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Anh/chị không có quyền thực hiện thao tác này.",
      });
    }
    return true;
  }
}

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;
    const expected = req.session?.csrfToken;
    const supplied = req.header("x-csrf-token");
    if (!expected || !supplied || expected !== supplied) {
      throw new ForbiddenException({
        code: "CSRF_INVALID",
        message: "CSRF token không hợp lệ.",
      });
    }
    return true;
  }
}
