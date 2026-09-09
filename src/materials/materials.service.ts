import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ClassStatus,
  FileContext,
  MaterialType,
  MaterialVisibility,
  UserRole,
} from "@prisma/client";
import { Express } from "express";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../common/types";
import { ClassAccessService } from "../classes/class-access.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateLinkMaterialDto,
  CreateSectionDto,
  FileMaterialMetadataDto,
} from "./materials.dto";
import { FileStorageService } from "./file-storage.service";

@Injectable()
export class MaterialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClassAccessService,
    private readonly storage: FileStorageService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthenticatedUser, classId: string) {
    await this.access.anyReadableClass(user, classId);
    const visibility =
      user.role === UserRole.STUDENT
        ? { visibility: MaterialVisibility.STUDENTS }
        : {};
    return this.prisma.section.findMany({
      where: { classId },
      include: {
        materials: {
          where: visibility,
          include: {
            skills: { select: { skill: true } },
            fileAsset: {
              select: {
                id: true,
                originalName: true,
                mediaType: true,
                byteCount: true,
              },
            },
          },
          orderBy: [{ position: "asc" }, { id: "asc" }],
        },
      },
      orderBy: [{ position: "asc" }, { id: "asc" }],
    });
  }

  async createSection(
    user: AuthenticatedUser,
    classId: string,
    dto: CreateSectionDto,
  ) {
    await this.requireEditable(user, classId);
    const section = await this.prisma.section.create({
      data: { classId, title: dto.title.trim(), position: dto.position },
    });
    await this.audit.create({
      actorId: user.id,
      classId,
      action: "SECTION_CREATED",
      resourceType: "Section",
      resourceId: section.id,
    });
    return section;
  }

  async createLink(
    user: AuthenticatedUser,
    classId: string,
    dto: CreateLinkMaterialDto,
  ) {
    await this.requireEditable(user, classId);
    await this.requireSection(classId, dto.sectionId);
    const url = new URL(dto.url);
    if (url.protocol !== "https:")
      throw new BadRequestException({
        code: "HTTPS_REQUIRED",
        message: "Liên kết phải dùng HTTPS.",
      });
    const skills = [...new Set(dto.skills)];
    if (!skills.length)
      throw new BadRequestException({
        code: "SKILL_REQUIRED",
        message: "Cần ít nhất một kỹ năng.",
      });
    const material = await this.prisma.material.create({
      data: {
        classId,
        sectionId: dto.sectionId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        position: dto.position,
        type: MaterialType.LINK,
        visibility: dto.visibility,
        externalUrl: url.toString(),
        skills: { create: skills.map((skill) => ({ skill })) },
      },
      include: { skills: true },
    });
    await this.audit.create({
      actorId: user.id,
      classId,
      action: "MATERIAL_CREATED",
      resourceType: "Material",
      resourceId: material.id,
    });
    return material;
  }

  async createFile(
    user: AuthenticatedUser,
    classId: string,
    dto: FileMaterialMetadataDto,
    file?: Express.Multer.File,
  ) {
    await this.requireEditable(user, classId);
    await this.requireSection(classId, dto.sectionId);
    if (!file)
      throw new BadRequestException({
        code: "FILE_REQUIRED",
        message: "Thiếu tệp tải lên.",
      });
    const skills = [...new Set(dto.skills)];
    if (!skills.length)
      throw new BadRequestException({
        code: "SKILL_REQUIRED",
        message: "Cần ít nhất một kỹ năng.",
      });
    const asset = await this.storage.finalize({
      tempPath: file.path,
      originalName: file.originalname,
      declaredMime: file.mimetype,
      byteCount: file.size,
      classId,
      uploaderId: user.id,
      context: FileContext.MATERIAL,
    });
    try {
      const material = await this.prisma.material.create({
        data: {
          classId,
          sectionId: dto.sectionId,
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          position: dto.position,
          type: MaterialType.FILE,
          visibility: dto.visibility,
          fileAssetId: asset.id,
          skills: { create: skills.map((skill) => ({ skill })) },
        },
        include: { skills: true, fileAsset: true },
      });
      await this.audit.create({
        actorId: user.id,
        classId,
        action: "MATERIAL_CREATED",
        resourceType: "Material",
        resourceId: material.id,
      });
      return material;
    } catch (error) {
      await this.prisma.fileAsset.update({
        where: { id: asset.id },
        data: { status: "FAILED" },
      });
      throw error;
    }
  }

  async authorizeDownload(user: AuthenticatedUser, materialId: string) {
    const material = await this.prisma.material.findUnique({
      where: { id: materialId },
      include: { fileAsset: true },
    });
    if (
      !material ||
      material.type !== MaterialType.FILE ||
      !material.fileAsset ||
      material.fileAsset.status !== "READY"
    ) {
      throw new NotFoundException({
        code: "MATERIAL_NOT_FOUND",
        message: "Không tìm thấy tài liệu.",
      });
    }
    await this.access.anyReadableClass(user, material.classId);
    if (
      user.role === UserRole.STUDENT &&
      material.visibility !== MaterialVisibility.STUDENTS
    ) {
      throw new NotFoundException({
        code: "MATERIAL_NOT_FOUND",
        message: "Không tìm thấy tài liệu.",
      });
    }
    return {
      material,
      asset: material.fileAsset,
      path: this.storage.resolveKey(material.fileAsset.storageKey),
    };
  }

  private async requireEditable(user: AuthenticatedUser, classId: string) {
    const learningClass = await this.access.staffClass(user, classId, false);
    if (learningClass.status !== ClassStatus.ACTIVE)
      throw new ConflictException({
        code: "CLASS_NOT_ACTIVE",
        message: "Chỉ chỉnh sửa nội dung trong lớp đang hoạt động.",
      });
  }

  private async requireSection(
    classId: string,
    sectionId: string,
  ): Promise<void> {
    if (
      !(await this.prisma.section.findFirst({
        where: { id: sectionId, classId },
        select: { id: true },
      }))
    ) {
      throw new NotFoundException({
        code: "SECTION_NOT_FOUND",
        message: "Không tìm thấy mục nội dung.",
      });
    }
  }
}
