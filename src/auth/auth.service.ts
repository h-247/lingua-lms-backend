import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { UserStatus } from "@prisma/client";
import * as argon2 from "argon2";
import { createHash, randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";

const ARGON_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  generateCsrf(): string {
    return randomBytes(32).toString("base64url");
  }

  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, ARGON_OPTIONS);
  }

  async validateLogin(emailInput: string, password: string) {
    const email = emailInput.trim().toLowerCase();
    const limit = await this.prisma.authAttemptLimit.findUnique({
      where: { emailKey: email },
    });
    if (limit?.blockedUntil && limit.blockedUntil > new Date()) {
      throw new UnauthorizedException({
        code: "LOGIN_FAILED",
        message: "Email hoặc mật khẩu không đúng.",
      });
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    const valid = user
      ? await argon2.verify(user.passwordHash, password).catch(() => false)
      : false;
    if (!user || !valid || user.status !== UserStatus.ACTIVE) {
      await this.recordFailure(email);
      throw new UnauthorizedException({
        code: "LOGIN_FAILED",
        message: "Email hoặc mật khẩu không đúng.",
      });
    }
    await this.prisma.authAttemptLimit.deleteMany({
      where: { emailKey: email },
    });
    return user;
  }

  private async recordFailure(email: string): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO "AuthAttemptLimit" ("emailKey", "failedCount", "windowStartedAt", "blockedUntil", "updatedAt")
      VALUES (${email}, 1, NOW(), NULL, NOW())
      ON CONFLICT ("emailKey") DO UPDATE SET
        "failedCount" = CASE
          WHEN "AuthAttemptLimit"."windowStartedAt" < NOW() - INTERVAL '15 minutes' THEN 1
          ELSE "AuthAttemptLimit"."failedCount" + 1
        END,
        "windowStartedAt" = CASE
          WHEN "AuthAttemptLimit"."windowStartedAt" < NOW() - INTERVAL '15 minutes' THEN NOW()
          ELSE "AuthAttemptLimit"."windowStartedAt"
        END,
        "blockedUntil" = CASE
          WHEN (CASE WHEN "AuthAttemptLimit"."windowStartedAt" < NOW() - INTERVAL '15 minutes' THEN 1 ELSE "AuthAttemptLimit"."failedCount" + 1 END) >= 5
          THEN NOW() + INTERVAL '15 minutes'
          ELSE "AuthAttemptLimit"."blockedUntil"
        END,
        "updatedAt" = NOW()
    `;
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (!(await argon2.verify(user.passwordHash, currentPassword))) {
      throw new UnauthorizedException({
        code: "PASSWORD_INVALID",
        message: "Mật khẩu hiện tại không đúng.",
      });
    }
    if (
      createHash("sha256").update(currentPassword).digest("hex") ===
      createHash("sha256").update(newPassword).digest("hex")
    ) {
      throw new ConflictException({
        code: "PASSWORD_REUSED",
        message: "Mật khẩu mới phải khác mật khẩu hiện tại.",
      });
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await this.hashPassword(newPassword),
        mustChangePassword: false,
        authVersion: { increment: 1 },
      },
      select: { id: true, authVersion: true },
    });
  }
}
