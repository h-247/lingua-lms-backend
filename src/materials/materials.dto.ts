import { MaterialVisibility, SkillTag } from "@prisma/client";
import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  MaxLength,
  Min,
} from "class-validator";

export class CreateSectionDto {
  @IsString()
  @Length(1, 160)
  title!: string;

  @IsInt()
  @Min(0)
  position!: number;
}

export class CreateLinkMaterialDto {
  @IsString()
  sectionId!: string;

  @IsString()
  @Length(1, 160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsInt()
  @Min(0)
  position!: number;

  @IsEnum(MaterialVisibility)
  visibility!: MaterialVisibility;

  @IsArray()
  @IsEnum(SkillTag, { each: true })
  skills!: SkillTag[];

  @IsUrl({ protocols: ["https"], require_protocol: true, require_tld: false })
  @MaxLength(2048)
  url!: string;
}

export class FileMaterialMetadataDto {
  @IsString()
  sectionId!: string;

  @IsString()
  @Length(1, 160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  position!: number;

  @IsEnum(MaterialVisibility)
  visibility!: MaterialVisibility;

  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    try {
      return JSON.parse(String(value));
    } catch {
      return [value];
    }
  })
  @IsArray()
  @IsEnum(SkillTag, { each: true })
  skills!: SkillTag[];
}
