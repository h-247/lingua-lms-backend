import { PrismaClient, UserRole, UserStatus } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !password || password.length < 12) {
    throw new Error(
      "Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (at least 12 characters).",
    );
  }
  if (await prisma.user.count({ where: { role: UserRole.ADMIN } }))
    throw new Error("Bootstrap refused: an administrator already exists.");
  await prisma.user.create({
    data: {
      email,
      displayName:
        process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "System Administrator",
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      passwordHash: await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 19_456,
        timeCost: 2,
        parallelism: 1,
      }),
      mustChangePassword: true,
    },
  });
  process.stdout.write(
    "Administrator created. The password was not printed.\n",
  );
}

main().finally(() => prisma.$disconnect());
