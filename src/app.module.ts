import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { AssessmentsModule } from "./assessments/assessments.module";
import { ClassesModule } from "./classes/classes.module";
import { CsrfGuard, RolesGuard, SessionAuthGuard } from "./common/guards";
import { OriginMiddleware } from "./common/origin.middleware";
import { RequestIdMiddleware } from "./common/request-id.middleware";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./prisma/prisma.module";
import { MaterialsModule } from "./materials/materials.module";
import { ReportsModule } from "./reports/reports.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    ClassesModule,
    MaterialsModule,
    AssessmentsModule,
    ReportsModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware, OriginMiddleware)
      .forRoutes({ path: "{*path}", method: RequestMethod.ALL });
  }
}
