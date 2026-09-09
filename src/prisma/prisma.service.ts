import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log:
        process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
  }

  async onModuleInit(): Promise<void> {
    if (process.env.OPENAPI_ONLY === "true") return;
    await this.$connect();
    await this.$executeRawUnsafe("SET statement_timeout = '8s'");
    await this.$executeRawUnsafe("SET lock_timeout = '3s'");
    this.logger.log("Database connected");
  }

  async onModuleDestroy(): Promise<void> {
    if (process.env.OPENAPI_ONLY === "true") return;
    await this.$disconnect();
  }
}
