import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { CurrentUser, Roles } from "../common/decorators";
import { AuthenticatedUser } from "../common/types";
import { CreateGroupDto, StudentIdsDto, UpdateGroupDto } from "./classes.dto";
import { GroupsService } from "./groups.service";

@ApiTags("groups")
@Controller("classes/:classId/groups")
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("classId") classId: string,
  ) {
    return this.groups.list(user, classId);
  }

  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("classId") classId: string,
    @Body() dto: CreateGroupDto,
  ) {
    return this.groups.create(user, classId, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Patch(":groupId")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("classId") classId: string,
    @Param("groupId") groupId: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.groups.update(user, classId, groupId, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Post(":groupId/archive")
  archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param("classId") classId: string,
    @Param("groupId") groupId: string,
  ) {
    return this.groups.archive(user, classId, groupId);
  }

  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Post(":groupId/members")
  addMembers(
    @CurrentUser() user: AuthenticatedUser,
    @Param("classId") classId: string,
    @Param("groupId") groupId: string,
    @Body() dto: StudentIdsDto,
  ) {
    return this.groups.addMembers(user, classId, groupId, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Delete(":groupId/members/:studentId")
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("classId") classId: string,
    @Param("groupId") groupId: string,
    @Param("studentId") studentId: string,
  ) {
    return this.groups.removeMember(user, classId, groupId, studentId);
  }
}
