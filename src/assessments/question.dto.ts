import { Type } from "class-transformer";
import { QuestionType } from "@prisma/client";
import { ApiProperty } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

export class QuestionOptionDto {
  @IsUUID()
  @IsOptional()
  id?: string;

  @IsString()
  @Length(1, 1000)
  text!: string;

  @IsBoolean()
  isCorrect!: boolean;

  @IsInt()
  @Min(0)
  position!: number;
}

export class AssessmentQuestionDto {
  @IsUUID()
  @IsOptional()
  id?: string;

  @IsEnum(QuestionType)
  type!: QuestionType;

  @IsString()
  @Length(1, 2000)
  prompt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  explanation?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(10000)
  points!: number;

  @IsInt()
  @Min(0)
  position!: number;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  @ApiProperty({ type: () => QuestionOptionDto, isArray: true })
  options!: QuestionOptionDto[];
}
