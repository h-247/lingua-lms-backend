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
import { UserRole } from "@prisma/client";
import { CurrentUser, Roles } from "../common/decorators";
import { AuthenticatedUser } from "../common/types";
import {
  CreateUserDto,
  ListUsersDto,
  ResetPasswordDto,
  SetUserStatusDto,
  UpdateUserDto,
} from "./users.dto";
import { UsersService } from "./users.service";

@ApiTags("users")
@Roles(UserRole.ADMIN)
@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@Query() dto: ListUsersDto) {
    return this.users.list(dto);
  }

  @Post()
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateUserDto) {
    return this.users.create(actor.id, dto);
  }

  @Patch(":id/profile")
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.update(actor.id, id, dto);
  }

  @Post(":id/status")
  status(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: SetUserStatusDto,
  ) {
    return this.users.setStatus(actor.id, id, dto);
  }

  @Post(":id/reset-password")
  reset(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.users.resetPassword(actor.id, id, dto);
  }
}
