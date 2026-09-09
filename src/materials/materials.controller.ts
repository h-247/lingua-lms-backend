import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiConsumes, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { Response } from "express";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { diskStorage } from "multer";
import { extname, resolve } from "path";
import { randomUUID } from "crypto";
import { CurrentUser, Roles } from "../common/decorators";
import { AuthenticatedUser } from "../common/types";
import {
  CreateLinkMaterialDto,
  CreateSectionDto,
  FileMaterialMetadataDto,
} from "./materials.dto";
import { MaterialsService } from "./materials.service";

const stagingRoot = resolve(
  process.env.UPLOAD_TMP_ROOT ?? "./uploads/.staging",
);

@ApiTags("materials")
@Controller()
export class MaterialsController {
  constructor(private readonly materials: MaterialsService) {}

  @Get("classes/:classId/materials")
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("classId") classId: string,
  ) {
    return this.materials.list(user, classId);
  }

  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Post("classes/:classId/sections")
  section(
    @CurrentUser() user: AuthenticatedUser,
    @Param("classId") classId: string,
    @Body() dto: CreateSectionDto,
  ) {
    return this.materials.createSection(user, classId, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Post("classes/:classId/materials/link")
  link(
    @CurrentUser() user: AuthenticatedUser,
    @Param("classId") classId: string,
    @Body() dto: CreateLinkMaterialDto,
  ) {
    return this.materials.createLink(user, classId, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiConsumes("multipart/form-data")
  @Post("classes/:classId/materials/file")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
      storage: diskStorage({
        destination: stagingRoot,
        filename: (_req, file, callback) =>
          callback(
            null,
            `${randomUUID()}${extname(file.originalname).toLowerCase()}`,
          ),
      }),
    }),
  )
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param("classId") classId: string,
    @Body() dto: FileMaterialMetadataDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.materials.createFile(user, classId, dto, file);
  }

  @Get("materials/:materialId/download")
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param("materialId") materialId: string,
    @Headers("range") range: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { asset, path } = await this.materials.authorizeDownload(
      user,
      materialId,
    );
    res.setHeader("Content-Type", asset.mediaType);
    const disposition =
      asset.mediaType === "application/pdf" ||
      asset.mediaType.startsWith("image/")
        ? "inline"
        : "attachment";
    res.setHeader(
      "Content-Disposition",
      `${disposition}; filename*=UTF-8''${encodeURIComponent(asset.originalName)}`,
    );
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Accept-Ranges", "bytes");
    if (process.env.USE_X_ACCEL === "true") {
      res.setHeader(
        "X-Accel-Redirect",
        `${process.env.INTERNAL_FILE_PREFIX ?? "/_protected_files"}/${asset.storageKey}`,
      );
      res.end();
      return;
    }
    const info = await stat(path);
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (match) {
        const start = match[1] ? Number(match[1]) : 0;
        const end = match[2]
          ? Math.min(Number(match[2]), info.size - 1)
          : info.size - 1;
        if (start <= end && start < info.size) {
          res.status(206);
          res.setHeader("Content-Range", `bytes ${start}-${end}/${info.size}`);
          res.setHeader("Content-Length", end - start + 1);
          createReadStream(path, { start, end }).pipe(res);
          return;
        }
      }
      res.status(416).setHeader("Content-Range", `bytes */${info.size}`).end();
      return;
    }
    res.setHeader("Content-Length", info.size);
    createReadStream(path).pipe(res);
  }
}
