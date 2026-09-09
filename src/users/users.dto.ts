import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from "class-validator";
import { UserRole, UserStatus } from "@prisma/client";
import { PaginationDto } from "../common/pagination.dto";

export class ListUsersDto extends PaginationDto {
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}

export class CreateUserDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @Length(1, 120)
  displayName!: string;

  @IsEnum(UserRole)
  role!: UserRole;
}

export class UpdateUserDto {
  @IsString()
  @Length(1, 120)
  displayName!: string;
}

export class SetUserStatusDto {
  @IsEnum(UserStatus)
  status!: UserStatus;
}

export class ResetPasswordDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  mustChangePassword = true;
}
