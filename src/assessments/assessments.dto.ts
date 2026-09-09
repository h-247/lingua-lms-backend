import { Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import {
  AssessmentAudience,
  AssessmentKind,
  AssessmentStatus,
} from "@prisma/client";
import { PaginationDto } from "../common/pagination.dto";
import { AssessmentQuestionDto } from "./question.dto";

export class UpsertAssessmentDto {
  @IsEnum(AssessmentKind)
  kind!: AssessmentKind;

  @IsEnum(AssessmentAudience)
  audience!: AssessmentAudience;

  @IsString()
  @Length(1, 160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  instructions?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  maxPoints?: number;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsBoolean()
  allowLate = false;

  @IsArray()
  @IsUUID("4", { each: true })
  groupIds: string[] = [];

  @IsArray()
  @IsUUID("4", { each: true })
  materialIds: string[] = [];

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AssessmentQuestionDto)
  @ApiProperty({ type: () => AssessmentQuestionDto, isArray: true })
  questions: AssessmentQuestionDto[] = [];
}

export class ExtendDeadlineDto {
  @IsDateString()
  dueAt!: string;

  @IsString()
  @Length(1, 500)
  reason!: string;
}

export class ListAssessmentsDto extends PaginationDto {
  @IsOptional()
  @IsEnum(AssessmentKind)
  kind?: AssessmentKind;

  @IsOptional()
  @IsEnum(AssessmentStatus)
  status?: AssessmentStatus;
}

export class DraftPayloadDto {
  @IsInt()
  @Min(0)
  expectedRevision!: number;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  textAnswer?: string;

  @IsOptional()
  @IsObject()
  answers?: Record<string, string>;

  @IsOptional()
  @IsUUID()
  attachmentId?: string;
}

export class SubmitPayloadDto extends DraftPayloadDto {}

export class GradeHomeworkDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  earnedPoints!: number;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  feedback?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  reason?: string;
}

export class PracticeDraftDto {
  @IsInt()
  @Min(0)
  expectedRevision!: number;

  @IsObject()
  answers!: Record<string, string>;
}
