import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { EnrollmentStatus, UserRole } from "@prisma/client";
import { CurrentUser, Roles } from "../common/decorators";
import { AuthenticatedUser } from "../common/types";
import {
  AssignTeacherDto,
  CreateClassDto,
  ListClassesDto,
  StudentIdsDto,
  UpdateClassDto,
} from "./classes.dto";
import { ClassesService } from "./classes.service";

@ApiTags("classes")
@Controller("classes")
export class ClassesController {
  constructor(private readonly classes: ClassesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() dto: ListClassesDto) {
    return this.classes.list(user, dto);
  }

  @Get(":id")
  detail(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.classes.detail(user, id);
  }

  @Roles(UserRole.ADMIN)
  @Post()
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateClassDto) {
    return this.classes.create(actor.id, dto);
  }

  @Roles(UserRole.ADMIN)
  @Patch(":id")
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateClassDto,
  ) {
    return this.classes.update(actor.id, id, dto);
  }

  @Roles(UserRole.ADMIN)
  @Post(":id/activate")
  activate(@CurrentUser() actor: AuthenticatedUser, @Param("id") id: string) {
    return this.classes.activate(actor.id, id);
  }

  @Roles(UserRole.ADMIN)
  @Post(":id/close")
  close(@CurrentUser() actor: AuthenticatedUser, @Param("id") id: string) {
    return this.classes.close(actor.id, id);
  }

  @Roles(UserRole.ADMIN)
  @Post(":id/teacher")
  teacher(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: AssignTeacherDto,
  ) {
    return this.classes.assignTeacher(actor.id, id, dto);
  }

  @Roles(UserRole.ADMIN)
  @Post(":id/enrollments")
  enroll(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: StudentIdsDto,
  ) {
    return this.classes.enroll(actor.id, id, dto);
  }

  @Roles(UserRole.ADMIN)
  @Post(":id/enrollments/:studentId/revoke")
  revoke(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id") id: string,
    @Param("studentId") studentId: string,
  ) {
    return this.classes.changeEnrollment(
      actor.id,
      id,
      studentId,
      EnrollmentStatus.REVOKED,
    );
  }

  @Roles(UserRole.ADMIN)
  @Post(":id/enrollments/:studentId/reactivate")
  reactivate(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id") id: string,
    @Param("studentId") studentId: string,
  ) {
    return this.classes.changeEnrollment(
      actor.id,
      id,
      studentId,
      EnrollmentStatus.ACTIVE,
    );
  }
}
