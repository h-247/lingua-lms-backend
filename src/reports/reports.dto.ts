import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";
import { PaginationDto } from "../common/pagination.dto";

export class ClassReportQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  includeHistorical = false;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}

export class AuditQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;
}
