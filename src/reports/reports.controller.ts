import { Controller, Get, Header, Param, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { CurrentUser, Roles } from "../common/decorators";
import { AuthenticatedUser } from "../common/types";
import { AuditQueryDto, ClassReportQueryDto } from "./reports.dto";
import { ReportsService } from "./reports.service";

@ApiTags("reports")
@Controller("reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("dashboard")
  dashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.reports.dashboard(user);
  }

  @Roles(UserRole.STUDENT)
  @Get("classes/:classId/me")
  own(
    @CurrentUser() user: AuthenticatedUser,
    @Param("classId") classId: string,
  ) {
    return this.reports.ownProgress(user, classId);
  }

  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Get("classes/:classId/progress")
  classProgress(
    @CurrentUser() user: AuthenticatedUser,
    @Param("classId") classId: string,
    @Query() dto: ClassReportQueryDto,
  ) {
    return this.reports.classProgress(user, classId, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Get("classes/:classId/progress.csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="progress.csv"')
  csv(
    @CurrentUser() user: AuthenticatedUser,
    @Param("classId") classId: string,
    @Query() dto: ClassReportQueryDto,
  ) {
    return this.reports.classCsv(user, classId, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Get("classes/:classId/audit")
  audit(
    @CurrentUser() user: AuthenticatedUser,
    @Param("classId") classId: string,
    @Query() dto: AuditQueryDto,
  ) {
    return this.reports.audit(user, classId, dto);
  }
}
