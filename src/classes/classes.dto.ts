import { ClassStatus, Level } from "@prisma/client";
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from "class-validator";
import { PaginationDto } from "../common/pagination.dto";

export class ListClassesDto extends PaginationDto {
  @IsOptional()
  @IsEnum(ClassStatus)
  status?: ClassStatus;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;
}

export class CreateClassDto {
  @IsString()
  @Length(1, 40)
  code!: string;

  @IsString()
  @Length(1, 160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsEnum(Level)
  level!: Level;

  @IsUUID()
  teacherId!: string;

  @IsOptional()
  @IsDateString({ strict: true })
  startDate?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  endDate?: string;
}

export class UpdateClassDto extends CreateClassDto {}

export class AssignTeacherDto {
  @IsUUID()
  teacherId!: string;
}

export class StudentIdsDto {
  @IsArray()
  @IsUUID("4", { each: true })
  studentIds!: string[];
}

export class CreateGroupDto {
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  purpose?: string;
}

export class UpdateGroupDto extends CreateGroupDto {}
