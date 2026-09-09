import { Injectable } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

interface AuditInput {
  actorId: string;
  classId?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  reason?: string;
  details?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  create(
    input: AuditInput,
    client: Prisma.TransactionClient | PrismaClient = this.prisma,
  ) {
    return client.auditEvent.create({ data: input });
  }
}
